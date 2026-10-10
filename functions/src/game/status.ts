import type { GameState, GameStatus } from '../shared/types.js';
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

    const next: GameState = { ...state, status: target };
    let text = target === 'paused' ? 'The game is paused' : 'The game has resumed';
    if (state.status === 'lobby') {
      // First start: the festival begins and the first side quest is scheduled.
      const settings = await loadSettings(db, tx);
      next.startedAt = toTs(ctx.now);
      next.nextGlobalQuestAt = toTs(nextGlobalTime(ctx.now, settings, rng));
      text = 'The game has started!';
    }
    tx.set(db.doc('game/state'), next);
    addFeed(tx, db, ctx.now, { type: 'status', text, uid: null, ref: null });
    return { status: target };
  });
}
