import { rerollsLeft } from '../shared/rerolls.js';
import type { Player } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, loadSettings, loadState, requireGM } from './guards.js';
import { asId } from './util.js';

/** GM gives (or takes back) extra rerolls for a player. Quiet: no feed post, no ledger entry. */
export async function grantRerolls(
  db: Db,
  ctx: Ctx,
  data: { uid?: unknown; delta?: unknown },
): Promise<{ extraRerolls: number; rerollsLeft: number }> {
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const uid = asId(data.uid, 'uid');
    const delta = data.delta;
    if (typeof delta !== 'number' || !Number.isSafeInteger(delta) || delta === 0 || delta < -10 || delta > 10) {
      fail('invalid-argument', 'The change must be a non-zero whole number from -10 to 10.');
    }

    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const playerSnap = await tx.get(db.doc(`players/${uid}`));
    if (!playerSnap.exists) fail('not-found', 'No such player.');
    const settings = await loadSettings(db, tx);
    const player = playerSnap.data() as Player;

    const next = (player.extraRerolls ?? 0) + delta;
    if (next < 0) fail('failed-precondition', "That would take away more rerolls than they've been given.");
    tx.update(playerSnap.ref, { extraRerolls: next });
    return {
      extraRerolls: next,
      rerollsLeft: rerollsLeft(settings.rerollLimit, { rerollsUsed: player.rerollsUsed, extraRerolls: next }),
    };
  });
}
