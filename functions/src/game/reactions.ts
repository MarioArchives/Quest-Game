import { canHoldTop } from '../shared/feedVotes.js';
import { getPack } from '../shared/packs/index.js';
import type { GamePack } from '../shared/packs/types.js';
import { StoreError } from '../shared/store/errors.js';
import type { FeedItem, Player, TopPost } from '../shared/types.js';
import type { Db } from './context.js';
import { loadSettings, loadState } from './guards.js';
import { applyPoints, applyScore, scoringFor } from './ledger.js';
import { millis, toTs } from './util.js';

/**
 * Recount reactions on a feed post (idempotent): reactionCount counts every reaction doc; in a votes pack the
 * vote docs also give up, down, score and votes (emoji docs never count towards those). Returns the count.
 */
export async function recountReactions(db: Db, feedId: string): Promise<number> {
  const ref = db.doc(`feed/${feedId}`);
  const post = await ref.get();
  if (!post.exists) return 0;
  const docs = (await ref.collection('reactions').get()).docs;
  const count = docs.length;
  const votes: Record<string, 1 | -1> = {};
  for (const d of docs) {
    const v = (d.data() as { vote?: unknown }).vote;
    if (v === 1 || v === -1) votes[d.id] = v;
  }
  const up = Object.values(votes).filter((v) => v === 1).length;
  const down = Object.values(votes).length - up;
  const update: Record<string, unknown> = { reactionCount: count };
  // Posts that never had a vote keep no vote fields (emoji packs stay as they were).
  if (up + down > 0 || (post.data() as FeedItem).votes !== undefined) Object.assign(update, { up, down, score: up - down, votes });
  try {
    // update() fails with not-found if the post was deleted since the check above.
    await ref.update(update);
  } catch (err) {
    if (err instanceof StoreError && err.code === 'not-found') return 0;
    throw err;
  }
  return count;
}

/**
 * Keeps game/top, the pinned entry of a votes pack, right (idempotent). Highest score wins among a player's own
 * entries with a score of 1 or more; a tie goes to fewer downs, then the current holder, then the earlier post.
 * Writes only on a change. The top also pays its player `settings.topEntryPoints`, and the points move with it:
 * game/top remembers what it paid (`award`), so a takeback is exactly that, and the same player's other entry
 * taking over moves nothing. Points move only while the game is active or paused; a player who has left is
 * neither paid nor charged.
 */
export async function recomputeTop(db: Db, now: Date, pack: GamePack = getPack()): Promise<void> {
  const topRef = db.doc('game/top');
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(topRef)).data() as TopPost | undefined;
    const scored = await tx.get(db.collection('feed').orderBy('score', 'desc'));
    const state = await loadState(db, tx);
    const settings = await loadSettings(db, tx);
    const cands = scored.docs
      .map((d) => ({ id: d.id, post: d.data() as FeedItem }))
      .filter(({ post }) => (post.score ?? 0) >= 1 && !post.flagged && canHoldTop(post));
    const rank = (c: (typeof cands)[number]) => [-(c.post.score ?? 0), c.post.down ?? 0, c.id === cur?.feedId ? 0 : 1, millis(c.post.createdAt)];
    cands.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return a.id < b.id ? -1 : 1;
    });
    const best = cands[0];
    const stamp = toTs(now);
    const holder = best?.post.uid ?? null;
    const award = cur?.award ?? null;

    // Reads first: the player docs of whoever holds the award now and whoever would hold it next.
    const players = new Map<string, Player>();
    for (const uid of new Set([award?.uid, holder])) {
      if (!uid) continue;
      const snap = await tx.get(db.doc(`players/${uid}`));
      if (snap.exists) players.set(uid, snap.data() as Player);
    }

    let nextAward = award;
    if (state.status === 'active' || state.status === 'paused') {
      if (award && award.uid !== holder) {
        const owner = players.get(award.uid);
        if (owner && !owner.left) {
          applyPoints(tx, db, now, settings, { uid: award.uid, current: owner.points, delta: -award.points, reason: 'top-entry-lost', ref: award.feedId, by: 'system' });
        }
        nextAward = null;
      } else if (award && best) {
        nextAward = award.feedId === best.id ? award : { ...award, feedId: best.id };
      }
      const payee = holder ? players.get(holder) : undefined;
      if (!nextAward && best && holder && payee && !payee.left && settings.topEntryPoints > 0) {
        const scoring = scoringFor(pack, settings, state, now);
        const { applied } = applyScore(tx, db, now, scoring, { kind: 'topEntry', uid: holder, points: settings.topEntryPoints }, new Map([[holder, payee.points]]), { ref: best.id, by: 'system' });
        const paid = applied.get(holder) ?? 0;
        nextAward = paid > 0 ? { uid: holder, feedId: best.id, points: paid } : null;
      }
    }
    const awardChanged = JSON.stringify(nextAward) !== JSON.stringify(award);

    if (!best) {
      if (!cur?.feedId && !awardChanged) return;
      const next: TopPost = { feedId: null, score: 0, up: 0, down: 0, since: null, previousFeedId: cur?.feedId ?? cur?.previousFeedId ?? null, previousSince: cur?.feedId ? cur.since ?? null : cur?.previousSince ?? null, award: nextAward };
      tx.set(topRef, next);
      return;
    }
    const fields = { score: best.post.score ?? 0, up: best.post.up ?? 0, down: best.post.down ?? 0 };
    if (cur?.feedId === best.id) {
      if (cur.score !== fields.score || cur.up !== fields.up || cur.down !== fields.down || awardChanged) tx.update(topRef, { ...fields, award: nextAward });
      return;
    }
    const next: TopPost = cur?.feedId
      ? { feedId: best.id, ...fields, since: stamp, previousFeedId: cur.feedId, previousSince: cur.since ?? null, award: nextAward }
      : { feedId: best.id, ...fields, since: stamp, previousFeedId: cur?.previousFeedId ?? null, previousSince: cur?.previousSince ?? null, award: nextAward };
    tx.set(topRef, next);
  });
}

/** The reaction trigger: recount the post, then (votes packs) settle the top entry. */
export async function handleReactionWritten(db: Db, feedId: string, now: Date, pack: GamePack): Promise<void> {
  await recountReactions(db, feedId);
  if (pack.reactions === 'votes') await recomputeTop(db, now, pack);
}
