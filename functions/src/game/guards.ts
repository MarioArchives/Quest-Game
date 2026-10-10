// Shared guards and loaders for the game logic. Callers inside a transaction pass `tx`
// so the reads join it (all transaction reads must happen before any writes).
import type { Transaction } from 'firebase-admin/firestore';
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';
import { DEFAULT_SETTINGS } from '../shared/settings.js';
import type { GameState, Player, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';

export function fail(code: FunctionsErrorCode, message: string, details?: unknown): never {
  throw new HttpsError(code, message, details);
}

/** The caller's uid, or an `unauthenticated` error. */
export function requireUid(ctx: Ctx): string {
  if (!ctx.uid) fail('unauthenticated', 'Sign in first.');
  return ctx.uid;
}

export async function isGM(db: Db, uid: string, tx?: Transaction): Promise<boolean> {
  const ref = db.doc(`admins/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists;
}

/** The caller's uid if they are listed in admins/{uid}; otherwise `permission-denied`. */
export async function requireGM(db: Db, ctx: Ctx, tx?: Transaction): Promise<string> {
  const uid = requireUid(ctx);
  if (!(await isGM(db, uid, tx))) fail('permission-denied', 'Game masters only.');
  return uid;
}

/** The caller's uid and player doc; `permission-denied` if they have not joined. */
export async function requirePlayer(db: Db, ctx: Ctx, tx?: Transaction): Promise<{ uid: string; player: Player }> {
  const uid = requireUid(ctx);
  const ref = db.doc(`players/${uid}`);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) fail('permission-denied', 'Only players can do that.');
  return { uid, player: snap.data() as Player };
}

/** game/settings merged over the defaults, so a partial or missing doc still works. */
export async function loadSettings(db: Db, tx?: Transaction): Promise<Settings> {
  const ref = db.doc('game/settings');
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) };
}

/** game/state, treating a missing doc as a fresh lobby. */
export async function loadState(db: Db, tx?: Transaction): Promise<GameState> {
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
