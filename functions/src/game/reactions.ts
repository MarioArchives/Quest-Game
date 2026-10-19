import { canHoldTop } from '../shared/feedVotes.js';
import type { GamePack } from '../shared/packs/types.js';
import { StoreError } from '../shared/store/errors.js';
import type { FeedItem, TopPost } from '../shared/types.js';
import type { Db } from './context.js';
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
 * Keeps game/top, the pinned entry of a votes pack, right (idempotent). Highest score wins among entries with a
 * score of 1 or more; a tie goes to fewer downs, then the current holder, then the earlier post. Writes only on a change.
 */
export async function recomputeTop(db: Db, now: Date): Promise<void> {
  const topRef = db.doc('game/top');
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(topRef)).data() as TopPost | undefined;
    const scored = await tx.get(db.collection('feed').orderBy('score', 'desc'));
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

    if (!best) {
      if (!cur?.feedId) return;
      const next: TopPost = { feedId: null, score: 0, up: 0, down: 0, since: null, previousFeedId: cur.feedId, previousSince: cur.since ?? null };
      tx.set(topRef, next);
      return;
    }
    const fields = { score: best.post.score ?? 0, up: best.post.up ?? 0, down: best.post.down ?? 0 };
    if (cur?.feedId === best.id) {
      if (cur.score !== fields.score || cur.up !== fields.up || cur.down !== fields.down) tx.update(topRef, fields);
      return;
    }
    const next: TopPost = cur?.feedId
      ? { feedId: best.id, ...fields, since: stamp, previousFeedId: cur.feedId, previousSince: cur.since ?? null }
      : { feedId: best.id, ...fields, since: stamp, previousFeedId: cur?.previousFeedId ?? null, previousSince: cur?.previousSince ?? null };
    tx.set(topRef, next);
  });
}

/** The reaction trigger: recount the post, then (votes packs) settle the top entry. */
export async function handleReactionWritten(db: Db, feedId: string, now: Date, pack: GamePack): Promise<void> {
  await recountReactions(db, feedId);
  if (pack.reactions === 'votes') await recomputeTop(db, now);
}
