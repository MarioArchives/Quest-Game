import { termForms } from '../shared/packs/terms.js';
import { rerollsLeft } from '../shared/rerolls.js';
import type { Quest } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { dealReplacement, readDealing } from './deal.js';
import { fail, loadSettings, loadState, requirePlayer } from './guards.js';
import { asId } from './util.js';

/** Swap one active quest for a template the player has never held. Returns the new quest id. */
export async function rerollQuest(db: Db, ctx: Ctx, data: { questId?: unknown }): Promise<{ questId: string }> {
  const rng = ctx.rng ?? Math.random;
  const t = termForms(ctx.pack.terms);
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Rerolls are only possible while the game is running.');

    const questId = asId(data.questId, 'questId');
    const questRef = db.doc(`players/${uid}/quests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', `That ${t.quest.one} is not in your hand.`);
    if ((questSnap.data() as Quest).status !== 'active') fail('failed-precondition', `That ${t.quest.one} can no longer be rerolled.`);

    const settings = await loadSettings(db, tx);
    if (rerollsLeft(settings.rerollLimit, player) <= 0) fail('resource-exhausted', 'You have used all your rerolls.');

    const dealing = await readDealing(tx, db, uid);
    if (dealing.pool.length === 0) fail('failed-precondition', `No fresh ${t.quest.many} are left to deal.`);
    // Swapping never takes a hand above its five slots; nothing changes if no replacement can be dealt.
    if (dealing.open - 1 >= settings.starterQuestCount) {
      fail('failed-precondition', `You already hold as many ${t.quest.many} as the game allows.`);
    }

    tx.update(questRef, { status: 'replaced' });
    dealing.open -= 1;
    const newId = dealReplacement(tx, db, ctx.now, rng, uid, dealing, settings.starterQuestCount) as string;
    tx.update(db.doc(`players/${uid}`), { rerollsUsed: player.rerollsUsed + 1 });
    return { questId: newId };
  });
}
