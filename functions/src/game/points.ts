import { termForms } from '../shared/packs/terms.js';
import type { Player } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, requireGM } from './guards.js';
import { applyPoints } from './ledger.js';
import { asId } from './util.js';

/** GM manual adjustment with a reason; written to the ledger. Returns the player's new total. */
export async function adjustPoints(
  db: Db,
  ctx: Ctx,
  data: { uid?: unknown; delta?: unknown; reason?: unknown },
): Promise<{ points: number }> {
  return db.runTransaction(async (tx) => {
    const by = await requireGM(db, ctx, tx);
    const uid = asId(data.uid, 'uid');
    const delta = data.delta;
    if (typeof delta !== 'number' || !Number.isSafeInteger(delta) || delta === 0) {
      fail('invalid-argument', 'The change must be a non-zero whole number.');
    }
    if (typeof data.reason !== 'string' || data.reason.trim() === '') fail('invalid-argument', 'Give a reason for the adjustment.');
    const reason = data.reason.trim();

    const playerSnap = await tx.get(db.doc(`players/${uid}`));
    if (!playerSnap.exists) fail('not-found', 'No such player.');
    const settings = await loadSettings(db, tx);
    const player = playerSnap.data() as Player;
    const { total, applied } = applyPoints(tx, db, ctx.now, settings, {
      uid,
      current: player.points,
      delta,
      reason: 'adjust',
      ref: null,
      by,
      note: reason,
    });
    addFeed(tx, db, ctx.now, {
      type: 'adjust',
      text: `The ${termForms(ctx.pack.terms).gm.one} adjusted ${player.displayName}'s points (${applied >= 0 ? '+' : ''}${applied}): ${reason}`,
      uid,
      ref: null,
      actorUid: by,
      note: reason,
      points: applied,
      photoURL: player.photoURL ?? null,
    });
    return { points: total };
  });
}
