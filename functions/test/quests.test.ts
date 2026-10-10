// Edge case 16 (rerollQuest).
import { describe, expect, it } from 'vitest';
import { rerollQuest } from '../src/game/quests.js';
import {
  ctx,
  expectCode,
  getPlayer,
  getQuests,
  hand,
  seededRng,
  seedGame,
  seedGlobalTemplate,
  seedPersonalTemplates,
  seedPlayer,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-quests');

const FIVE = ['p01', 'p02', 'p03', 'p04', 'p05'];

describe('rerollQuest', () => {
  it('replaces the quest with a fresh active one and counts the reroll', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });

    const { questId } = await rerollQuest(db(), ctx('alice', undefined, seededRng(1)), { questId: 'q1' });

    const quests = await getQuests(db(), 'alice');
    const old = quests.find((q) => q.id === 'q1')!;
    const fresh = quests.find((q) => q.id === questId)!;
    expect(old.status).toBe('replaced');
    expect(fresh).toBeDefined();
    expect(fresh.status).toBe('active');
    expect(FIVE).not.toContain(fresh.templateId);
    expect(quests.filter((q) => q.status === 'active')).toHaveLength(5);
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(1);
  });

  it('allows the 10th reroll and refuses the 11th', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 40);
    await seedPlayer(db(), 'alice', { rerollsUsed: 9, quests: hand(FIVE) });

    await rerollQuest(db(), ctx('alice', undefined, seededRng(2)), { questId: 'q1' });
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(10);

    await expectCode(rerollQuest(db(), ctx('alice', undefined, seededRng(3)), { questId: 'q2' }), 'resource-exhausted');
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(10);
    expect((await getQuests(db(), 'alice')).find((q) => q.id === 'q2')!.status).toBe('active');
  });

  it('respects a custom rerollLimit', async () => {
    await seedGame(db(), { settings: { rerollLimit: 2 } });
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { rerollsUsed: 2, quests: hand(FIVE) });
    await expectCode(rerollQuest(db(), ctx('alice'), { questId: 'q1' }), 'resource-exhausted');
  });

  it.each(['submitted', 'done', 'exposed', 'replaced'] as const)('refuses to reroll a %s quest', async (status) => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { quests: [{ id: 'q1', templateId: 'p01', status }, { id: 'q2', templateId: 'p02' }] });
    await expectCode(rerollQuest(db(), ctx('alice'), { questId: 'q1' }), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(0);
  });

  it("returns not-found for someone else's quest id", async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });
    await seedPlayer(db(), 'bob', { quests: [{ id: 'bobq', templateId: 'p06' }] });
    await expectCode(rerollQuest(db(), ctx('alice'), { questId: 'bobq' }), 'not-found');
    expect((await getQuests(db(), 'bob'))[0].status).toBe('active');
  });

  it.each([0, 1, 2])('never deals a template the player has held before, whatever the randomness (seed %i)', async (seed) => {
    await seedGame(db());
    // p01..p08 exist. Alice holds p01-p05 and has previously held p06 (done) and p07 (replaced),
    // so p08 is the only fresh template.
    await seedPersonalTemplates(db(), 8);
    await seedPlayer(db(), 'alice', {
      quests: [
        ...hand(FIVE),
        { id: 'old1', templateId: 'p06', status: 'done' },
        { id: 'old2', templateId: 'p07', status: 'replaced' },
      ],
    });
    const { questId } = await rerollQuest(db(), ctx('alice', undefined, seededRng(seed)), { questId: 'q1' });
    const fresh = (await getQuests(db(), 'alice')).find((q) => q.id === questId)!;
    expect(fresh.templateId).toBe('p08');
  });

  it('never deals a global or retired template', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 7, { retired: ['p06'] });
    await seedGlobalTemplate(db(), 'g01');
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });
    const { questId } = await rerollQuest(db(), ctx('alice', undefined, seededRng(9)), { questId: 'q1' });
    const fresh = (await getQuests(db(), 'alice')).find((q) => q.id === questId)!;
    expect(fresh.templateId).toBe('p07');
  });

  it('fails with failed-precondition and does not spend a reroll when no fresh template is left', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 5);
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });
    await expectCode(rerollQuest(db(), ctx('alice'), { questId: 'q1' }), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(0);
    expect((await getQuests(db(), 'alice')).find((q) => q.id === 'q1')!.status).toBe('active');
  });

  it.each(['lobby', 'paused', 'ended'] as const)('refuses rerolls while the game is %s', async (status) => {
    await seedGame(db(), { status });
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });
    await expectCode(rerollQuest(db(), ctx('alice'), { questId: 'q1' }), 'failed-precondition');
  });

  it('refuses non-players and signed-out callers', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await expectCode(rerollQuest(db(), ctx(null), { questId: 'q1' }), 'unauthenticated');
    await expectCode(rerollQuest(db(), ctx('stranger'), { questId: 'q1' }), 'permission-denied');
  });

  it('lets exactly one of two concurrent rerolls of the same quest succeed', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 30);
    await seedPlayer(db(), 'alice', { quests: hand(FIVE) });

    const results = await Promise.allSettled([
      rerollQuest(db(), ctx('alice', undefined, seededRng(11)), { questId: 'q1' }),
      rerollQuest(db(), ctx('alice', undefined, seededRng(12)), { questId: 'q1' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'failed-precondition' });
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(1);
    const quests = await getQuests(db(), 'alice');
    expect(quests.filter((q) => q.status === 'active')).toHaveLength(5);
    expect(quests).toHaveLength(6);
  });
});
