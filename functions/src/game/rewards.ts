// Reward choice (packs with rewardChoice): a confirmed personal quest earns its owner one choice, either clear their
// name (points to themselves) or frame another player (points off them). Framing is anonymous: only the owner and
// the GM can read rewards/{id}; the target's ledger and the feed never name the framer.
import type { DocRef, Txn } from '../shared/store/types.js';
import type { Player, Reward } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, loadState, requirePlayer } from './guards.js';
import { applyScore, scoringFor } from './ledger.js';
import { asId, isId, toTs } from './util.js';

/** A fresh pending reward for an approved personal claim (written with the approval). */
export function createReward(tx: Txn, db: Db, now: Date, uid: string, submissionId: string): void {
  const reward: Reward = { uid, submissionId, status: 'pending', createdAt: toTs(now) };
  tx.create(db.doc(`rewards/${submissionId}`), reward);
}

export async function resolveReward(
  db: Db,
  ctx: Ctx,
  data: { rewardId?: unknown; choice?: unknown; targetUid?: unknown },
): Promise<{ status: 'cleaned' | 'framed'; points: number }> {
  if (!ctx.pack.features.rewardChoice) fail('failed-precondition', 'Rewards are not part of this game.');
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const rewardId = asId(data.rewardId, 'rewardId');
    const rewardRef: DocRef = db.doc(`rewards/${rewardId}`);
    const rewardSnap = await tx.get(rewardRef);
    if (!rewardSnap.exists) fail('not-found', 'No such reward.');
    const reward = rewardSnap.data() as Reward;
    if (reward.uid !== uid) fail('permission-denied', 'That reward is not yours.');
    if (reward.status !== 'pending') fail('failed-precondition', 'That reward has already been used.');
    const choice = data.choice;
    if (choice !== 'clean' && choice !== 'frame') fail('invalid-argument', "choice must be 'clean' or 'frame'.");

    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const settings = await loadSettings(db, tx);
    const scoring = scoringFor(ctx.pack, settings, state, ctx.now);
    const resolvedAt = toTs(ctx.now);

    if (choice === 'clean') {
      const { applied } = applyScore(tx, db, ctx.now, scoring, { kind: 'rewardClean', uid }, new Map([[uid, player.points]]), { ref: rewardId, by: 'system' });
      const points = applied.get(uid) ?? 0;
      tx.update(rewardRef, { status: 'cleaned', applied: points, resolvedAt, targetUid: null });
      return { status: 'cleaned' as const, points };
    }

    const targetUid = data.targetUid;
    if (!isId(targetUid) || targetUid === uid) fail('invalid-argument', 'Pick another player to frame.');
    const targetSnap = await tx.get(db.doc(`players/${targetUid}`));
    if (!targetSnap.exists) fail('not-found', 'No such player.');
    const target = targetSnap.data() as Player;
    if (target.left) fail('failed-precondition', `${target.displayName} has left the game.`);

    // No ref and no actor: nothing public may lead back to the framer or the claim.
    const { applied } = applyScore(tx, db, ctx.now, scoring, { kind: 'rewardFrame', uid, target: targetUid }, new Map([[targetUid, target.points]]), { ref: null, by: 'system' });
    const points = applied.get(targetUid) ?? 0;
    tx.update(rewardRef, { status: 'framed', targetUid, applied: points, resolvedAt });
    addFeed(tx, db, ctx.now, {
      type: 'framed',
      text: `Someone framed ${target.displayName}`,
      uid: targetUid,
      ref: null,
      points,
      photoURL: target.photoURL ?? null,
    });
    return { status: 'framed' as const, points };
  });
}
