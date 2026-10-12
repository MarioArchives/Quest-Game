import { termForms } from '../shared/packs/terms.js';
import type { GuessCooldown, QuestTemplate } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { dealReplacement, readDealing } from './deal.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, loadState, requirePlayer } from './guards.js';
import { applyScore, scoringFor } from './ledger.js';
import { isId, MIN_MS, millis, toTs } from './util.js';

/**
 * Guess that targetUid currently holds templateId as an active quest.
 * Cooldown violations throw GameError('resource-exhausted', ..., { retryAt: <epoch ms> }).
 */
export async function guessQuest(
  db: Db,
  ctx: Ctx,
  data: { targetUid?: unknown; templateId?: unknown },
): Promise<{ correct: boolean }> {
  if (!ctx.pack.features.guesses) fail('failed-precondition', 'Guessing is switched off in this game.');
  const t = termForms(ctx.pack.terms);
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    const { uid: guesserUid, player: guesser } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Guessing is only possible while the game is running.');

    const targetUid = data.targetUid;
    if (!isId(targetUid) || targetUid === guesserUid) fail('invalid-argument', 'Pick another player to guess about.');
    const targetSnap = await tx.get(db.doc(`players/${targetUid}`));
    if (!targetSnap.exists) fail('not-found', 'No such player.');
    const target = targetSnap.data() as { displayName: string; photoURL?: string | null; points: number; left?: string | null };
    if (target.left) fail('failed-precondition', `${target.displayName} has left the game, so their ${t.quest.many} can't be guessed.`);

    const templateId = data.templateId;
    if (!isId(templateId)) fail('invalid-argument', `Pick a ${t.quest.one} to guess.`);
    const templateSnap = await tx.get(db.doc(`questTemplates/${templateId}`));
    if (!templateSnap.exists || (templateSnap.data() as QuestTemplate).scope !== 'personal') {
      fail('invalid-argument', `That is not a personal ${t.quest.one}.`);
    }

    const settings = await loadSettings(db, tx);
    const scoring = scoringFor(ctx.pack, settings, state, ctx.now);
    const cooldownRef = db.doc(`guessCooldowns/${guesserUid}_${targetUid}`);
    const cooldown = (await tx.get(cooldownRef)).data() as GuessCooldown | undefined;
    if (cooldown) {
      const retryAt = millis(cooldown.lastAt) + settings.guessCooldownMin * MIN_MS;
      if (ctx.now.getTime() < retryAt) {
        fail('resource-exhausted', 'You guessed about that player too recently.', { retryAt });
      }
    }

    // Only a quest still in the target's hand can be exposed; submitted/done ones are safe.
    const hit = await tx.get(
      db
        .collection(`players/${targetUid}/quests`)
        .where('templateId', '==', templateId)
        .where('status', '==', 'active')
        .limit(1),
    );
    const quest = hit.docs[0];
    const correct = quest !== undefined;
    const dealing = correct ? await readDealing(tx, db, targetUid) : { pool: [], open: 0 };

    const balances = new Map([
      [guesserUid, guesser.points],
      [targetUid, target.points],
    ]);
    const guessRef = db.collection('guesses').doc();
    const now = toTs(ctx.now);
    if (quest) {
      tx.update(quest.ref, { status: 'exposed', exposedBy: guesserUid, exposedAt: now });
      // The exposed quest leaves the hand; its replacement only comes if the hand is below five.
      dealing.open -= 1;
      dealReplacement(tx, db, ctx.now, rng, targetUid, dealing, settings.starterQuestCount);
      const { applied } = applyScore(
        tx,
        db,
        ctx.now,
        scoring,
        { kind: 'guessRight', guesser: guesserUid, target: targetUid },
        balances,
        { ref: guessRef.id, by: 'system' },
      );
      addFeed(tx, db, ctx.now, {
        type: 'exposed',
        text: `${guesser.displayName} exposed ${target.displayName}'s secret ${t.quest.one}: "${quest.get('title')}"`,
        uid: targetUid,
        ref: guessRef.id,
        actorUid: guesserUid,
        points: applied.get(targetUid) ?? 0,
        questTitle: quest.get('title') as string,
        photoURL: target.photoURL ?? null,
      });
    } else {
      applyScore(
        tx,
        db,
        ctx.now,
        scoring,
        { kind: 'guessWrong', guesser: guesserUid, target: targetUid },
        balances,
        { ref: guessRef.id, by: 'system' },
      );
    }

    tx.create(guessRef, { guesserUid, targetUid, templateId, correct, createdAt: now });
    tx.set(cooldownRef, { lastAt: now });
    return { correct };
  });
}
