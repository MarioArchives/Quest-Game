// GM extra rerolls (plan edge cases 2-9 and 11): grantRerolls, the shared allowance helpers, and
// rerollQuest honouring the extras.
import { describe, expect, it } from 'vitest';
import { rerollQuest } from '../src/game/quests.js';
import { grantRerolls } from '../src/game/rerolls.js';
import { rerollAllowance, rerollsLeft } from '../src/shared/rerolls.js';
import type { GameState } from '../src/shared/types.js';
import {
  ctx,
  expectCode,
  getPlayer,
  hand,
  seededRng,
  seedAdmin,
  seedGame,
  seedPersonalTemplates,
  seedPlayer,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-rerolls');

const FIVE = ['p01', 'p02', 'p03', 'p04', 'p05'];

describe('rerollAllowance / rerollsLeft', () => {
  it('adds GM extras to the base limit; a missing field counts as 0', () => {
    expect(rerollAllowance(10, {})).toBe(10);
    expect(rerollAllowance(10, { extraRerolls: null })).toBe(10);
    expect(rerollAllowance(10, { extraRerolls: 3 })).toBe(13);
    expect(rerollAllowance(0, { extraRerolls: 2 })).toBe(2);
  });

  it('counts what is left, never below zero, with missing fields as defaults (edge 11)', () => {
    expect(rerollsLeft(10, {})).toBe(10);
    expect(rerollsLeft(10, { rerollsUsed: 4 })).toBe(6);
    expect(rerollsLeft(10, { rerollsUsed: 10, extraRerolls: 2 })).toBe(2);
    // A take-back after the extras were spent: more used than allowed.
    expect(rerollsLeft(10, { rerollsUsed: 12, extraRerolls: 1 })).toBe(0);
    expect(rerollsLeft(2, { rerollsUsed: 5, extraRerolls: null })).toBe(0);
  });
});

describe('grantRerolls', () => {
  async function setup(opts: { status?: GameState['status']; extraRerolls?: number; rerollsUsed?: number } = {}) {
    await seedGame(db(), { status: opts.status ?? 'active' });
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice', { extraRerolls: opts.extraRerolls, rerollsUsed: opts.rerollsUsed });
  }

  it('gives a player extra rerolls and reports the new totals', async () => {
    await setup();
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 })).toEqual({ extraRerolls: 1, rerollsLeft: 11 });
    expect((await getPlayer(db(), 'alice')).extraRerolls).toBe(1);
  });

  it('reports rerollsLeft from the rerolls already used', async () => {
    await setup({ rerollsUsed: 10 });
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 2 })).toEqual({ extraRerolls: 2, rerollsLeft: 2 });
  });

  it('adds up across grants (edge 3)', async () => {
    await setup();
    await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 });
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 2 })).toMatchObject({ extraRerolls: 3 });
    expect((await getPlayer(db(), 'alice')).extraRerolls).toBe(3);
  });

  it('counts two grants made at the same moment (edge 3)', async () => {
    await setup();
    await Promise.all([
      grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 }),
      grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 }),
    ]);
    expect((await getPlayer(db(), 'alice')).extraRerolls).toBe(2);
  });

  it('takes back a mis-tapped grant (edge 4)', async () => {
    await setup({ extraRerolls: 2 });
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: -1 })).toMatchObject({ extraRerolls: 1 });
    expect((await getPlayer(db(), 'alice')).extraRerolls).toBe(1);
  });

  it('refuses to take extras below zero and changes nothing (edge 4)', async () => {
    await setup({ extraRerolls: 1 });
    await expectCode(grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: -2 }), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).extraRerolls).toBe(1);
  });

  it('refuses a take-back on a player doc without the field, leaving it absent (edges 4, 5)', async () => {
    await setup();
    await expectCode(grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: -1 }), 'failed-precondition');
    expect(await getPlayer(db(), 'alice')).not.toHaveProperty('extraRerolls');
  });

  it('treats a player doc without the field as 0 extras (edge 5)', async () => {
    await setup();
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 2 })).toEqual({ extraRerolls: 2, rerollsLeft: 12 });
  });

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['string', '1'],
    ['missing', undefined],
    ['NaN', Number.NaN],
    ['more than 10', 11],
    ['less than -10', -11],
  ])('rejects a %s delta and changes nothing (edge 6)', async (_label, delta) => {
    await setup();
    await expectCode(grantRerolls(db(), ctx('gm'), { uid: 'alice', delta }), 'invalid-argument');
    expect(await getPlayer(db(), 'alice')).not.toHaveProperty('extraRerolls');
  });

  it('accepts the boundary deltas 10 and -10', async () => {
    await setup();
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 10 })).toMatchObject({ extraRerolls: 10 });
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: -10 })).toMatchObject({ extraRerolls: 0 });
  });

  it('refuses non-GMs and signed-out callers (edge 7)', async () => {
    await setup();
    await expectCode(grantRerolls(db(), ctx('alice'), { uid: 'alice', delta: 1 }), 'permission-denied');
    await expectCode(grantRerolls(db(), ctx(null), { uid: 'alice', delta: 1 }), 'unauthenticated');
    expect(await getPlayer(db(), 'alice')).not.toHaveProperty('extraRerolls');
  });

  it('returns not-found when the target is not a player (edge 7)', async () => {
    await setup();
    await expectCode(grantRerolls(db(), ctx('gm'), { uid: 'nobody', delta: 1 }), 'not-found');
  });

  it('lets a GM who also plays grant rerolls to themselves (edge 8)', async () => {
    await setup();
    await seedPlayer(db(), 'gm');
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'gm', delta: 1 })).toEqual({ extraRerolls: 1, rerollsLeft: 11 });
  });

  it.each(['lobby', 'active', 'paused'] as const)('works while the game is %s (edge 9)', async (status) => {
    await setup({ status });
    expect(await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 })).toMatchObject({ extraRerolls: 1 });
  });

  it('is refused once the game has ended (edge 9)', async () => {
    await setup({ status: 'ended' });
    await expectCode(grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 }), 'failed-precondition');
    expect(await getPlayer(db(), 'alice')).not.toHaveProperty('extraRerolls');
  });
});

describe('rerollQuest with GM extras (edges 2, 5)', () => {
  it('a player at the base limit gets exactly one more reroll per extra, then is refused again', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 40);
    await seedPlayer(db(), 'alice', { rerollsUsed: 10, quests: hand(FIVE) });
    await expectCode(rerollQuest(db(), ctx('alice', undefined, seededRng(1)), { questId: 'q1' }), 'resource-exhausted');

    await grantRerolls(db(), ctx('gm'), { uid: 'alice', delta: 1 });
    await rerollQuest(db(), ctx('alice', undefined, seededRng(2)), { questId: 'q1' });
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(11);

    await expectCode(rerollQuest(db(), ctx('alice', undefined, seededRng(3)), { questId: 'q2' }), 'resource-exhausted');
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(11);
  });

  it('extras work on top of a custom limit of 0', async () => {
    await seedGame(db(), { settings: { rerollLimit: 0 } });
    await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { extraRerolls: 1, quests: hand(FIVE) });
    await rerollQuest(db(), ctx('alice', undefined, seededRng(4)), { questId: 'q1' });
    await expectCode(rerollQuest(db(), ctx('alice', undefined, seededRng(5)), { questId: 'q2' }), 'resource-exhausted');
    expect((await getPlayer(db(), 'alice')).rerollsUsed).toBe(1);
  });
});
