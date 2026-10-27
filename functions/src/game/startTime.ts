// The GM's start time: a countdown for everyone, and the game opens itself at zero.
import type { GamePack } from '../shared/packs/types.js';
import { startPost } from '../shared/startTime.js';
import type { Txn } from '../shared/store/types.js';
import type { GameState } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, isGM, loadSettings, loadState, requirePlayer, requireGM, requireUid } from './guards.js';
import { openGame } from './status.js';
import { millis, toTs } from './util.js';

const MINUTE = 60_000;
const MAX_AHEAD = 366 * 24 * 60 * MINUTE;

export async function setStartTime(db: Db, ctx: Ctx, data: { at?: unknown; tell?: unknown }): Promise<{ opensAt: number | null }> {
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'lobby') fail('failed-precondition', 'The game has already started.');

    const at = data?.at;
    const now = ctx.now.getTime();
    if (at !== null) {
      if (typeof at !== 'number' || !Number.isFinite(at)) fail('invalid-argument', 'Give the start time as a moment.');
      if (at % MINUTE !== 0) fail('invalid-argument', 'The start time must be a whole minute.');
      if (at <= now) fail('invalid-argument', 'The start time must be in the future.');
      if (at - now > MAX_AHEAD) fail('invalid-argument', 'The start time is too far ahead.');
    }

    const old = state.opensAt ? millis(state.opensAt) : null;
    if (at === old) return { opensAt: old };

    const next: GameState = { ...state };
    if (at === null) {
      next.opensAt = null;
      next.opensMoved = null;
    } else {
      next.opensAt = toTs(new Date(at));
      if (old !== null) next.opensMoved = { from: toTs(new Date(old)), at: toTs(ctx.now) };
    }
    tx.set(db.doc('game/state'), next);
    if (data.tell === true) addFeed(tx, db, ctx.now, { type: 'status', text: startPost(at, old, ctx.pack), uid: null, ref: null });
    return { opensAt: at };
  });
}

/** Opens a lobby game whose time has come; the state it read says what happened. Reads before writes. */
async function openIfDue(tx: Txn, db: Db, now: Date, rng: () => number): Promise<{ state: GameState; opened: boolean }> {
  const state = await loadState(db, tx);
  if (state.status !== 'lobby' || !state.opensAt || millis(state.opensAt) > now.getTime()) return { state, opened: false };
  const settings = await loadSettings(db, tx);
  openGame(tx, db, now, settings, rng, state);
  return { state, opened: true };
}

/** A player's app at zero (or the GM's): opens the game if the time has come, else says how long is left. */
export async function openOnTime(db: Db, ctx: Ctx, _data?: unknown): Promise<{ opened: boolean; inMs: number | null }> {
  requireUid(ctx);
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    if (!(await isGM(db, ctx.uid!, tx))) await requirePlayer(db, ctx, tx);
    const { state, opened } = await openIfDue(tx, db, ctx.now, rng);
    if (opened || state.status !== 'lobby') return { opened: true, inMs: null };
    if (!state.opensAt) return { opened: false, inMs: null };
    return { opened: false, inMs: millis(state.opensAt) - ctx.now.getTime() };
  });
}

/** The timer: opens the game once its start time has passed. Safe to run twice. */
export async function runOpening(db: Db, now: Date, rng: () => number, _pack?: GamePack): Promise<{ opened: boolean }> {
  return db.runTransaction(async (tx) => ({ opened: (await openIfDue(tx, db, now, rng)).opened }));
}
