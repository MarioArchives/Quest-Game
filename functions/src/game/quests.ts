import type { Quest } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { dealFrom, readFreshTemplates } from './deal.js';
import { fail, loadSettings, loadState, requirePlayer } from './guards.js';
import { asId } from './util.js';

/** Swap one active quest for a template the player has never held. Returns the new quest id. */
export async function rerollQuest(db: Db, ctx: Ctx, data: { questId?: unknown }): Promise<{ questId: string }> {
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Rerolls are only possible while the game is running.');

    const questId = asId(data.questId, 'questId');
    const questRef = db.doc(`players/${uid}/quests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', 'That quest is not in your hand.');
    if ((questSnap.data() as Quest).status !== 'active') fail('failed-precondition', 'That quest can no longer be rerolled.');

    const settings = await loadSettings(db, tx);
    if (player.rerollsUsed >= settings.rerollLimit) fail('resource-exhausted', 'You have used all your rerolls.');

    const pool = await readFreshTemplates(tx, db, uid);
    if (pool.length === 0) fail('failed-precondition', 'No fresh quests are left to deal.');

    tx.update(questRef, { status: 'replaced' });
    const [newId] = dealFrom(tx, db, ctx.now, rng, uid, pool, 1);
    tx.update(db.doc(`players/${uid}`), { rerollsUsed: player.rerollsUsed + 1 });
    return { questId: newId };
  });
}
