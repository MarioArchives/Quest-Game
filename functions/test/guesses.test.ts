// Edge cases 23–27 (guessQuest, cooldowns, points floor).
import { describe, expect, it } from 'vitest';
import { guessQuest } from '../src/game/guesses.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  getPlayer,
  getQuests,
  hand,
  ledgerFor,
  MIN,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalTemplate,
  seedPersonalTemplates,
  seedPlayer,
  T0,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-guesses');

const BOB_HAND = ['p06', 'p07', 'p08', 'p09', 'p10'];

async function setup(opts: { settings?: Partial<Settings>; alicePoints?: number; bobPoints?: number } = {}) {
  await seedGame(db(), { status: 'active', settings: opts.settings });
  await seedPersonalTemplates(db(), 20);
  await seedGlobalTemplate(db(), 'g01');
  await seedPlayer(db(), 'alice', { points: opts.alicePoints ?? 100, quests: hand(['p01', 'p02', 'p03', 'p04', 'p05']) });
  await seedPlayer(db(), 'bob', {
    points: opts.bobPoints ?? 200,
    quests: hand(BOB_HAND).map((q) => ({ ...q, id: `b${q.id}` })),
  });
  await seedPlayer(db(), 'carol', { quests: hand(['p11', 'p12', 'p13', 'p14', 'p15']).map((q) => ({ ...q, id: `c${q.id}` })) });
}

const guess = (guesser: string | null, targetUid: unknown, templateId: unknown, now = T0) =>
  guessQuest(db(), ctx(guesser, now, seededRng(3)), { targetUid, templateId });

describe('guessQuest: correct guesses', () => {
  it('exposes the quest, moves points both ways, replaces the quest for free and announces it', async () => {
    await setup();
    expect(await guess('alice', 'bob', 'p06')).toEqual({ correct: true });

    expect((await getPlayer(db(), 'bob')).points).toBe(150);
    expect((await getPlayer(db(), 'alice')).points).toBe(125);
    expect(await ledgerFor(db(), 'bob')).toEqual([expect.objectContaining({ delta: -50, reason: 'exposed' })]);
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: 25, reason: 'guess-correct' })]);

    const bobQuests = await getQuests(db(), 'bob');
    expect(bobQuests.find((q) => q.id === 'bq1')).toMatchObject({ status: 'exposed', exposedBy: 'alice' });
    const active = bobQuests.filter((q) => q.status === 'active');
    expect(active).toHaveLength(5);
    const fresh = active.find((q) => !BOB_HAND.includes(q.templateId))!;
    expect(fresh).toBeDefined();
    expect((await getPlayer(db(), 'bob')).rerollsUsed).toBe(0);

    const feed = (await allDocs(db(), 'feed')).filter((f) => f.type === 'exposed');
    expect(feed).toHaveLength(1);
    expect(feed[0].text).toContain('Personal quest p06');
    // V18: the post is about the exposed player, names the guesser, and shows what it cost them.
    expect(feed[0]).toMatchObject({ uid: 'bob', actorUid: 'alice', points: -50, questTitle: 'Personal quest p06' });

    const guesses = await allDocs(db(), 'guesses');
    expect(guesses).toHaveLength(1);
    expect(guesses[0]).toMatchObject({ guesserUid: 'alice', targetUid: 'bob', templateId: 'p06', correct: true });
  });

  it('uses the exposePenalty and correctGuessReward settings', async () => {
    await setup({ settings: { exposePenalty: 70, correctGuessReward: 0 } });
    await guess('alice', 'bob', 'p07');
    expect((await getPlayer(db(), 'bob')).points).toBe(130);
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });
});

describe('guessQuest: wrong guesses', () => {
  it('charges only the guesser and reveals nothing else', async () => {
    await setup();
    const res = await guess('alice', 'bob', 'p15');
    expect(res).toEqual({ correct: false });
    expect((await getPlayer(db(), 'alice')).points).toBe(90);
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: -10, reason: 'guess-wrong' })]);
    expect((await getPlayer(db(), 'bob')).points).toBe(200);
    expect(await ledgerFor(db(), 'bob')).toHaveLength(0);
    expect((await getQuests(db(), 'bob')).every((q) => q.status === 'active')).toBe(true);
    expect((await allDocs(db(), 'feed')).filter((f) => f.type === 'exposed')).toHaveLength(0);
    expect((await allDocs(db(), 'guesses'))[0]).toMatchObject({ correct: false, templateId: 'p15' });
  });

  it.each(['submitted', 'done'] as const)('treats a %s quest as safe (counts as a wrong guess)', async (status) => {
    await setup();
    await db().doc('players/bob/quests/bq1').update({ status });
    expect(await guess('alice', 'bob', 'p06')).toEqual({ correct: false });
    expect((await getPlayer(db(), 'alice')).points).toBe(90);
    expect((await getPlayer(db(), 'bob')).points).toBe(200);
    expect((await getQuests(db(), 'bob')).find((q) => q.id === 'bq1')!.status).toBe(status);
  });

  it('a template the target held earlier but rerolled away is a wrong guess', async () => {
    await setup();
    await db().doc('players/bob/quests/bq1').update({ status: 'replaced' });
    expect(await guess('alice', 'bob', 'p06')).toEqual({ correct: false });
  });
});

describe('guessQuest: cooldown', () => {
  it('blocks a second guess at the same target within 30 minutes and reports when to retry', async () => {
    await setup();
    await guess('alice', 'bob', 'p15', T0);
    const second = guess('alice', 'bob', 'p06', addMin(T0, 29));
    await expect(second).rejects.toMatchObject({ code: 'resource-exhausted', details: { retryAt: T0.getTime() + 30 * MIN } });
    expect((await getPlayer(db(), 'alice')).points).toBe(90);
    expect((await getPlayer(db(), 'bob')).points).toBe(200);
    expect(await allDocs(db(), 'guesses')).toHaveLength(1);
  });

  it('allows the next guess at exactly 30 minutes', async () => {
    await setup();
    await guess('alice', 'bob', 'p15', T0);
    expect(await guess('alice', 'bob', 'p06', addMin(T0, 30))).toEqual({ correct: true });
  });

  it('starts the cooldown after a correct guess too', async () => {
    await setup();
    await guess('alice', 'bob', 'p06', T0);
    await expectCode(guess('alice', 'bob', 'p07', addMin(T0, 10)), 'resource-exhausted');
  });

  it('lets the guesser try a different target immediately', async () => {
    await setup();
    await guess('alice', 'bob', 'p15', T0);
    expect(await guess('alice', 'carol', 'p11', addMin(T0, 1))).toEqual({ correct: true });
  });

  it('cooldowns are per guesser: another player can guess the same target', async () => {
    await setup();
    await guess('alice', 'bob', 'p15', T0);
    expect(await guess('carol', 'bob', 'p06', addMin(T0, 1))).toEqual({ correct: true });
  });

  it('uses the guessCooldownMin setting', async () => {
    await setup({ settings: { guessCooldownMin: 5 } });
    await guess('alice', 'bob', 'p15', T0);
    expect(await guess('alice', 'bob', 'p06', addMin(T0, 5))).toEqual({ correct: true });
  });
});

describe('guessQuest: invalid guesses', () => {
  it('refuses guessing yourself', async () => {
    await setup();
    await expectCode(guess('alice', 'alice', 'p01'), 'invalid-argument');
  });

  it('returns not-found for a target who is not a player', async () => {
    await setup();
    await expectCode(guess('alice', 'nobody', 'p01'), 'not-found');
  });

  it.each([
    ['unknown', 'p99'],
    ['global', 'g01'],
    ['not a string', 7],
  ])('refuses a %s template id', async (_label, templateId) => {
    await setup();
    await expectCode(guess('alice', 'bob', templateId), 'invalid-argument');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it.each(['lobby', 'paused', 'ended'] as const)('refuses guesses while the game is %s', async (status) => {
    await setup();
    await db().doc('game/state').update({ status });
    await expectCode(guess('alice', 'bob', 'p06'), 'failed-precondition');
  });

  it('refuses callers who are not players, and signed-out callers', async () => {
    await setup();
    await expectCode(guess('stranger', 'bob', 'p06'), 'permission-denied');
    await expectCode(guess(null, 'bob', 'p06'), 'unauthenticated');
  });

  it('lets a GM who also plays guess', async () => {
    await setup();
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'gm', { quests: [] });
    expect(await guess('gm', 'bob', 'p06')).toEqual({ correct: true });
  });
});

describe('points floor', () => {
  it('with pointsFloorZero on, clamps at 0 and records the change actually applied', async () => {
    await setup({ settings: { pointsFloorZero: true }, alicePoints: 5, bobPoints: 30 });
    await guess('alice', 'carol', 'p01'); // wrong: -10 requested, -5 applied
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: -5, reason: 'guess-wrong' })]);

    await guess('carol', 'bob', 'p06'); // correct: bob -50 requested, -30 applied
    expect((await getPlayer(db(), 'bob')).points).toBe(0);
    expect(await ledgerFor(db(), 'bob')).toEqual([expect.objectContaining({ delta: -30, reason: 'exposed' })]);
  });

  it('with pointsFloorZero off (default), scores can go negative', async () => {
    await setup({ alicePoints: 5, bobPoints: 30 });
    await guess('alice', 'carol', 'p01');
    expect((await getPlayer(db(), 'alice')).points).toBe(-5);
    await guess('carol', 'bob', 'p06');
    expect((await getPlayer(db(), 'bob')).points).toBe(-20);
  });
});
