// Shared guards and loaders for the game logic. Callers inside a transaction pass `tx`
// so the reads join it (all transaction reads must happen before any writes).
import type { Txn } from '../shared/store/types.js';
import { GameError, type GameErrorCode } from '../shared/store/errors.js';
import { termForms } from '../shared/packs/terms.js';
import { DEFAULT_SETTINGS } from '../shared/settings.js';
import type { GameState, Player, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';

export function fail(code: GameErrorCode, message: string, details?: unknown): never {
  throw new GameError(code, message, details);
}

/** The caller's uid, or an `unauthenticated` error. */
export function requireUid(ctx: Ctx): string {
  if (!ctx.uid) fail('unauthenticated', 'Sign in first.');
  return ctx.uid;
}

export async function isGM(db: Db, uid: string, tx?: Txn): Promise<boolean> {
  const ref = db.doc(`admins/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists;
}

/** The caller's uid if they are listed in admins/{uid}; otherwise `permission-denied`. */
export async function requireGM(db: Db, ctx: Ctx, tx?: Txn): Promise<string> {
  const uid = requireUid(ctx);
  if (!(await isGM(db, uid, tx))) {
    fail('permission-denied', `Only the ${termForms(ctx.pack.terms).gm.one} can do that.`);
  }
  return uid;
}

/** The caller's uid and player doc; `permission-denied` if they have not joined, or the GM marked them as left. */
export async function requirePlayer(db: Db, ctx: Ctx, tx?: Txn): Promise<{ uid: string; player: Player }> {
  const uid = requireUid(ctx);
  const ref = db.doc(`players/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) fail('permission-denied', 'Only players can do that.');
  const player = snap.data() as Player;
  if (player.left) fail('permission-denied', `The ${termForms(ctx.pack.terms).gm.one} has marked you as having left the game. Ask them to bring you back.`);
  return { uid, player };
}

/** Still playing: not marked by the GM as having left (frozen or out). */
export const isPlaying = (player: Pick<Player, 'left'> | null | undefined): boolean => Boolean(player) && !player!.left;

/** game/settings merged over the defaults, so a partial or missing doc still works. */
export async function loadSettings(db: Db, tx?: Txn): Promise<Settings> {
  const ref = db.doc('game/settings');
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) };
}

/** game/state, treating a missing doc as a fresh lobby. */
export async function loadState(db: Db, tx?: Txn): Promise<GameState> {
  const ref = db.doc('game/state');
  const snap = tx ? await tx.get(ref) : await ref.get();
  return {
    status: 'lobby',
    startedAt: null,
    endedAt: null,
    nextGlobalQuestAt: null,
    announcement: null,
    ...(snap.data() as Partial<GameState> | undefined),
  };
}
