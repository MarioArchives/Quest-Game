// Onboarding (packs with `look.screens.onboarding`): once the GM has let a player in, the pack's screen takes their
// particulars, and `bookIn` saves them and marks the onboarding done (`bookedAt`), which lets the app into the game.
import { checkParticulars } from '../shared/booking.js';
import { termForms } from '../shared/packs/terms.js';
import type { Player } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, requireUid } from './guards.js';
import { toTs } from './util.js';

/**
 * Callable: the caller's own particulars (height, relation, marks; each optional) onto their player doc, and `bookedAt`
 * the first time. Only a player (so not before the GM's approval) still in the game; booking in again just updates them.
 */
export async function bookIn(db: Db, ctx: Ctx, data: { particulars?: unknown }): Promise<{ booked: true }> {
  const uid = requireUid(ctx);
  const checked = checkParticulars(data?.particulars, ctx.pack.booking);
  if ('problem' in checked) fail('invalid-argument', checked.problem);
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`players/${uid}`);
    const player = (await tx.get(ref)).data() as Player | undefined;
    if (!player) fail('permission-denied', `Only players can do that. Wait for the ${termForms(ctx.pack.terms).gm.one} to let you in.`);
    if (player.left) fail('permission-denied', 'You have left the game.');
    tx.update(ref, { particulars: checked.particulars, bookedAt: player.bookedAt ?? toTs(ctx.now) });
    return { booked: true as const };
  });
}
