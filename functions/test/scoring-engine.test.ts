// Engine plan edge cases 14-20 through the real game functions: per-quest points, fraud reversal after a rule
// change, a broken rule set writing nothing, transfers and the floor, fallbacks, countdown and heist.
import { afterEach, describe, expect, it } from 'vitest';
import { guessQuest } from '../src/game/guesses.js';
import { rerollQuest } from '../src/game/quests.js';
import { handleSubmissionCreated, reviewSubmission } from '../src/game/submissions.js';
import { RULESETS } from '../src/shared/scoring/index.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  getData,
  getPlayer,
  getQuests,
  hand,
  ledgerFor,
  seededRng,
  seedAdmin,
  seedGame,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { testPack } from './packs.js';
import type { GamePack } from '../src/shared/packs/types.js';

const db = useEmulatorDb('demo-fq-scoring');

const FIVE = ['p01', 'p02', 'p03', 'p04', 'p05'];
const BOB_HAND = ['p06', 'p07', 'p08', 'p09', 'p10'];

async function setup(opts: { settings?: Partial<Settings>; alicePoints?: number; bobPoints?: number; templates?: number } = {}) {
  await seedGame(db(), { status: 'active', settings: opts.settings });
  await seedPersonalTemplates(db(), opts.templates ?? 20);
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { points: opts.alicePoints ?? 0, quests: hand(FIVE) });
  await seedPlayer(db(), 'bob', { points: opts.bobPoints ?? 0, quests: hand(BOB_HAND).map((q) => ({ ...q, id: `b${q.id}` })) });
  await seedPlayer(db(), 'carol');
}

async function claim(id: string, uid: string, questId: string, witnessUid?: string | null, pack?: GamePack) {
  await seedSubmission(db(), id, { uid, questId, createdAt: T0, witnessUid });
  await handleSubmissionCreated(db(), id, T0, seededRng(5), pack);
}

const review = (id: string, approve: boolean, by: string, now = addMin(T0, 5), pack?: GamePack) =>
  reviewSubmission(db(), ctx(by, now, seededRng(6), undefined, pack), { submissionId: id, approve });

const guess = (guesser: string, targetUid: string, templateId: string, pack?: GamePack) =>
  guessQuest(db(), ctx(guesser, T0, seededRng(3), undefined, pack), { targetUid, templateId });

const reasons = async (uid: string) => (await ledgerFor(db(), uid)).map((l) => [l.reason, l.delta]);

describe("E14. a quest's own points", () => {
  it('a dealt quest copies its template points and approval pays them', async () => {
    // Alice holds p01-p05; p06 is the only template left, worth 30.
    await setup({ templates: 6 });
    await db().doc('questTemplates/p06').update({ points: 30 });
    const { questId } = await rerollQuest(db(), ctx('alice', T0, seededRng(1)), { questId: 'q1' });
    const dealt = (await getQuests(db(), 'alice')).find((q) => q.id === questId)!;
    expect(dealt).toMatchObject({ templateId: 'p06', points: 30 });

    // A later catalogue edit does not change the quest already held.
    await db().doc('questTemplates/p06').update({ points: 60 });
    await claim('s1', 'alice', questId);
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(30);
    expect(await reasons('alice')).toEqual([['quest', 30]]);
    expect((await getData(db(), 'submissions/s1'))?.pointsAwarded).toBe(30);
  });

  it('a dealt quest from a template without points has none, and pays questPoints', async () => {
    await setup({ templates: 6, settings: { questPoints: 70 } });
    const { questId } = await rerollQuest(db(), ctx('alice', T0, seededRng(1)), { questId: 'q1' });
    const dealt = (await getQuests(db(), 'alice')).find((q) => q.id === questId)!;
    expect(dealt.points ?? null).toBeNull();
    await claim('s1', 'alice', questId);
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(70);
  });
});

describe('E15. fraud reversal takes back what was awarded', () => {
  it('even after the GM changes the rule set and the numbers', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);

    await db().doc('game/settings').update({ scoring: 'countdown', questPoints: 999 });
    await review('s1', false, 'gm', addMin(T0, 10));

    const ledger = await reasons('alice');
    expect(ledger).toEqual(expect.arrayContaining([['quest', 100], ['reversal', -100], ['fraud', -50]]));
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
  });
});

describe('E16. the engine never writes a broken score', () => {
  afterEach(() => {
    delete RULESETS.broken;
  });

  it('a rule set that returns NaN fails the approval and nothing is written', async () => {
    RULESETS.broken = {
      id: 'broken',
      name: 'Broken',
      summary: 'Test only',
      params: [],
      score: () => [{ kind: 'points', uid: 'alice', delta: Number.NaN, reason: 'quest' }],
      describe: () => [],
    };
    await setup({ settings: { scoring: 'broken' } });
    await claim('s1', 'alice', 'q1');
    await expect(review('s1', true, 'bob')).rejects.toBeDefined();

    expect((await getPlayer(db(), 'alice')).points).toBe(0);
    expect(await allDocs(db(), 'pointsLedger')).toEqual([]);
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('pending');
    expect((await getQuests(db(), 'alice')).find((q) => q.id === 'q1')?.status).toBe('submitted');
    expect((await allDocs(db(), 'feed')).filter((p) => p.type === 'approved')).toEqual([]);
  });

  it('a rule set that pays someone the event does not name fails the approval and nothing is written', async () => {
    RULESETS.broken = {
      id: 'broken',
      name: 'Broken',
      summary: 'Test only',
      params: [],
      score: () => [{ kind: 'points', uid: 'carol', delta: 10, reason: 'quest' }],
      describe: () => [],
    };
    await setup({ settings: { scoring: 'broken' } });
    await claim('s1', 'alice', 'q1');
    await expect(review('s1', true, 'bob')).rejects.toBeDefined();
    expect(await allDocs(db(), 'pointsLedger')).toEqual([]);
    expect((await getPlayer(db(), 'carol')).points).toBe(0);
  });
});

describe('E18. an unknown rule set falls back', () => {
  it("to the pack's default (lancaster: classic)", async () => {
    await setup({ settings: { scoring: 'nope' } });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it("to the pack's default when that is countdown", async () => {
    const pack = testPack({ scoring: 'countdown' });
    // The game started 2 h before T0 (seedGame); approved at T0 → 2 h × 5% → 90.
    await setup({ settings: { scoring: 'nope' } });
    await claim('s1', 'alice', 'q1', undefined, pack);
    await review('s1', true, 'bob', T0, pack);
    expect((await getPlayer(db(), 'alice')).points).toBe(90);
  });
});

describe('E19. countdown in play', () => {
  it('pays less the longer the game has been running, using its params', async () => {
    await setup({ settings: { scoring: 'countdown', scoringParams: { decayPctPerHour: 10, floorPct: 25 } } });
    await db().doc('game/state').update({ startedAt: ts(addMin(T0, -180)) });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob', T0);
    // 3 h × 10% → 70.
    expect((await getPlayer(db(), 'alice')).points).toBe(70);
    expect((await getData(db(), 'submissions/s1'))?.pointsAwarded).toBe(70);
  });
});

describe('E17/E20. heist in play', () => {
  const heist = { scoring: 'heist', scoringParams: { witnessReward: 15 } };

  it('the witness who approves earns witnessReward', async () => {
    await setup({ settings: heist });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    expect(await reasons('alice')).toEqual([['quest', 100]]);
    expect(await reasons('bob')).toEqual([['witness', 15]]);
    expect((await getPlayer(db(), 'bob')).points).toBe(15);
  });

  it('a GM who is not playing approves: no witness reward for anyone', async () => {
    await setup({ settings: heist });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'gm');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
    expect((await allDocs(db(), 'pointsLedger')).filter((l) => l.reason === 'witness')).toEqual([]);
  });

  it('a right guess steals the exposure fine (floor off: the full amount)', async () => {
    await setup({ settings: heist, alicePoints: 100, bobPoints: 20 });
    expect(await guess('alice', 'bob', 'p06')).toEqual({ correct: true });
    expect((await getPlayer(db(), 'bob')).points).toBe(-30);
    expect((await getPlayer(db(), 'alice')).points).toBe(150);
    expect(await reasons('bob')).toEqual([['exposed', -50]]);
    expect(await reasons('alice')).toEqual([['guess-correct', 50]]);
  });

  it('with the floor on, the guesser only gets what the target had', async () => {
    await setup({ settings: { ...heist, pointsFloorZero: true }, alicePoints: 100, bobPoints: 20 });
    await guess('alice', 'bob', 'p06');
    expect((await getPlayer(db(), 'bob')).points).toBe(0);
    expect((await getPlayer(db(), 'alice')).points).toBe(120);
    expect(await reasons('bob')).toEqual([['exposed', -20]]);
    expect(await reasons('alice')).toEqual([['guess-correct', 20]]);
  });

  it('a wrong guess pays the target a bounty', async () => {
    await setup({ settings: heist, alicePoints: 100, bobPoints: 0 });
    expect(await guess('alice', 'bob', 'p11')).toEqual({ correct: false });
    expect((await getPlayer(db(), 'alice')).points).toBe(90);
    expect((await getPlayer(db(), 'bob')).points).toBe(10);
    expect(await reasons('alice')).toEqual([['guess-wrong', -10]]);
    expect(await reasons('bob')).toEqual([['bounty', 10]]);
  });
});
