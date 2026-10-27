import type { Txn } from '../shared/store/types.js';
import type { GameState, GameStatus, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, loadState, requireGM } from './guards.js';
import { nextGlobalTime, toTs } from './util.js';

/** GM start / pause / resume. Ending goes through endGame; leaving 'ended' only through resetGame. */
export async function setGameStatus(db: Db, ctx: Ctx, data: { status?: unknown }): Promise<{ status: GameStatus }> {
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const target = data.status;
    if (target !== 'active' && target !== 'paused') fail('invalid-argument', "status must be 'active' or 'paused'.");

    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    if (state.status === target) return { status: target };
    if (state.status === 'lobby' && target === 'paused') fail('failed-precondition', 'The game has not started yet.');

    if (state.status === 'lobby') {
      // Opened by hand: any start time goes, so the timer never opens it a second time.
      const settings = await loadSettings(db, tx);
      openGame(tx, db, ctx.now, settings, rng, { ...state, opensAt: null, opensMoved: null });
      return { status: target };
    }
    const next: GameState = { ...state, status: target };
    const text = target === 'paused' ? 'The game is paused' : 'The game has resumed';
    tx.set(db.doc('game/state'), next);
    addFeed(tx, db, ctx.now, { type: 'status', text, uid: null, ref: null });
    return { status: target };
  });
}

/** First start, from the lobby: the game begins, the first side quest is scheduled and the players are told. */
export function openGame(tx: Txn, db: Db, now: Date, settings: Settings, rng: () => number, state: GameState): void {
  const next: GameState = {
    ...state,
    status: 'active',
    startedAt: toTs(now),
    nextGlobalQuestAt: toTs(nextGlobalTime(now, settings, rng)),
  };
  tx.set(db.doc('game/state'), next);
  addFeed(tx, db, now, { type: 'status', text: 'The game has started!', uid: null, ref: null });
}
