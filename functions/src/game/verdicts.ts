import { agreedWith, isVotableAbout, verdictOf } from '../shared/feedVotes.js';
import type { GamePack } from '../shared/packs/types.js';
import type { FeedItem, FeedVerdict, Player } from '../shared/types.js';
import type { Db } from './context.js';
import { loadSettings, loadState } from './guards.js';
import { applyScore, scoringFor } from './ledger.js';
import { MIN_MS, millis, toTs } from './util.js';

/** How many of the newest posts the timer looks through for verdicts due (a night's log book is far fewer). */
const VERDICT_SCAN = 500;

/** A post that takes votes and has no verdict yet (overruled entries never get one). */
const awaitsVerdict = (post: FeedItem) => isVotableAbout(post) && !post.verdict && !post.flagged;

/**
 * The timer's verdicts (votes packs with settings.verdictPoints on): every entry posted at least `verdictWindowMin`
 * ago gets its verdict once, from its votes then (`verdictOf`): the side with more votes, with at least
 * `verdictMinVotes` of them, or none. Each player still in the game whose eye or heart matches it scores the
 * `verdictAgreed` event. Only while the game is active or paused. Idempotent: a post with a verdict is never looked at
 * again, so a second run pays nothing twice.
 */
export async function runVerdicts(db: Db, now: Date, pack: GamePack): Promise<{ settled: string[] }> {
  const settled: string[] = [];
  if (pack.reactions !== 'votes') return { settled };
  const settings = await loadSettings(db);
  const state = await loadState(db);
  if (settings.verdictPoints <= 0 || (state.status !== 'active' && state.status !== 'paused')) return { settled };

  const due = now.getTime() - settings.verdictWindowMin * MIN_MS;
  const recent = await db.collection('feed').orderBy('createdAt', 'desc').limit(VERDICT_SCAN).get();
  const ids = recent.docs.filter((d) => awaitsVerdict(d.data() as FeedItem) && millis((d.data() as FeedItem).createdAt) <= due).map((d) => d.id);

  for (const id of ids) {
    const ref = db.doc(`feed/${id}`);
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const post = snap.data() as FeedItem;
      if (!awaitsVerdict(post)) return false;
      const txState = await loadState(db, tx);
      const txSettings = await loadSettings(db, tx);
      if (txSettings.verdictPoints <= 0 || (txState.status !== 'active' && txState.status !== 'paused')) return false;

      const votes = post.votes ?? {};
      const result = verdictOf(votes, txSettings.verdictMinVotes);
      const agreed = agreedWith(votes, result);
      // Reads first: the players who agreed.
      const players = new Map<string, Player>();
      for (const uid of agreed) {
        const p = await tx.get(db.doc(`players/${uid}`));
        if (p.exists) players.set(uid, p.data() as Player);
      }

      const scoring = scoringFor(pack, txSettings, txState, now);
      const paid: string[] = [];
      for (const uid of agreed) {
        const player = players.get(uid);
        if (!player || player.left) continue;
        applyScore(tx, db, now, scoring, { kind: 'verdictAgreed', uid, points: txSettings.verdictPoints }, new Map([[uid, player.points]]), { ref: id, by: 'system' });
        paid.push(uid);
      }
      const up = Object.values(votes).filter((v) => v === 1).length;
      const verdict: FeedVerdict = { result, up, down: Object.keys(votes).length - up, agreed: paid, at: toTs(now) };
      tx.update(ref, { verdict });
      return true;
    });
    if (done) settled.push(id);
  }
  return { settled };
}
