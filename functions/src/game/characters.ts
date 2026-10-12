// Characters and motives (packs with characters): the GM sets who each player is playing (public, on the player
// doc) and their secret motive (motives/{uid}, readable by that player and the GM only).
import type { Ctx, Db } from './context.js';
import { fail, requireGM } from './guards.js';
import { asId, toTs } from './util.js';

const NAME_MAX = 40;
const ROLE_MAX = 60;
const MOTIVE_MAX = 500;

/** A trimmed optional text field (missing → ''), at most `max` characters. */
function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) fail('invalid-argument', `The ${field} must be text of at most ${max} characters.`);
  return value.trim();
}

export async function setCharacter(
  db: Db,
  ctx: Ctx,
  data: { uid?: unknown; name?: unknown; role?: unknown; motive?: unknown },
): Promise<{ ok: true }> {
  if (!ctx.pack.features.characters) fail('failed-precondition', 'Characters are not part of this game.');
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const uid = asId(data.uid, 'uid');
    if (typeof data.name !== 'string' || data.name.trim().length < 1 || data.name.trim().length > NAME_MAX) {
      fail('invalid-argument', `The name must be 1 to ${NAME_MAX} characters.`);
    }
    const name = data.name.trim();
    const role = optionalText(data.role, 'role', ROLE_MAX);
    const motive = optionalText(data.motive, 'motive', MOTIVE_MAX);

    const playerRef = db.doc(`players/${uid}`);
    if (!(await tx.get(playerRef)).exists) fail('not-found', 'No such player.');
    tx.update(playerRef, { character: { name, role } });
    tx.set(db.doc(`motives/${uid}`), { text: motive, updatedAt: toTs(ctx.now) });
    return { ok: true as const };
  });
}
