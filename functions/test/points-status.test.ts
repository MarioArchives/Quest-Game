// Edge cases 32 (adjustPoints, + its feed post, Revision 3 V18) and 33 (setGameStatus).
import { describe, expect, it } from 'vitest';
import { adjustPoints } from '../src/game/points.js';
import { setGameStatus } from '../src/game/status.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  getData,
  getPlayer,
  ledgerFor,
  MIN,
  seededRng,
  seedAdmin,
  seedGame,
  seedPlayer,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-points-status');

describe('adjustPoints', () => {
  async function setup(settings = {}) {
    await seedGame(db(), { status: 'active', settings });
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice', { points: 100 });
  }

  it('applies a positive or negative change and records it with the GM and reason', async () => {
    await setup();
    expect(await adjustPoints(db(), ctx('gm'), { uid: 'alice', delta: 30, reason: '  Best costume  ' })).toEqual({ points: 130 });
    expect(await adjustPoints(db(), ctx('gm'), { uid: 'alice', delta: -20, reason: 'Heckling' })).toEqual({ points: 110 });
    expect((await getPlayer(db(), 'alice')).points).toBe(110);
    const ledger = await ledgerFor(db(), 'alice');
    expect(ledger).toHaveLength(2);
    expect(ledger).toContainEqual(
      expect.objectContaining({ uid: 'alice', delta: 30, reason: 'adjust', note: 'Best costume', by: 'gm', ref: null }),
    );
  });

  it('posts the adjustment to the feed with the reason and the points (V18)', async () => {
    await setup();
    await adjustPoints(db(), ctx('gm'), { uid: 'alice', delta: 30, reason: 'Best costume' });
    const posts = (await allDocs(db(), 'feed')).filter((f) => f.type === 'adjust');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', actorUid: 'gm', note: 'Best costume', points: 30 });
  });

  it('refuses non-GMs', async () => {
    await setup();
    await expectCode(adjustPoints(db(), ctx('alice'), { uid: 'alice', delta: 1000, reason: 'because' }), 'permission-denied');
    await expectCode(adjustPoints(db(), ctx(null), { uid: 'alice', delta: 1, reason: 'x' }), 'unauthenticated');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 5],
  ])('requires a reason (%s)', async (_label, reason) => {
    await setup();
    await expectCode(adjustPoints(db(), ctx('gm'), { uid: 'alice', delta: 10, reason }), 'invalid-argument');
  });

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['a string', '10'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('requires a non-zero integer amount (%s)', async (_label, delta) => {
    await setup();
    await expectCode(adjustPoints(db(), ctx('gm'), { uid: 'alice', delta, reason: 'r' }), 'invalid-argument');
    expect(await ledgerFor(db(), 'alice')).toHaveLength(0);
  });

  it('returns not-found when the target is not a player', async () => {
    await setup();
    await expectCode(adjustPoints(db(), ctx('gm'), { uid: 'nobody', delta: 10, reason: 'r' }), 'not-found');
  });

  it('honours pointsFloorZero', async () => {
    await setup({ pointsFloorZero: true });
    expect(await adjustPoints(db(), ctx('gm'), { uid: 'alice', delta: -150, reason: 'r' })).toEqual({ points: 0 });
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: -100 })]);
  });
});

describe('setGameStatus', () => {
  const set = (status: unknown, by = 'gm', now = T0) => setGameStatus(db(), ctx(by, now, seededRng(2)), { status });

  async function setup(status: 'lobby' | 'active' | 'paused' | 'ended') {
    await seedGame(db(), { status, state: { startedAt: status === 'lobby' ? null : ts(addMin(T0, -60)), nextGlobalQuestAt: null } });
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
  }

  it('lobby → active sets startedAt and schedules the first global quest 60–120 min out', async () => {
    await setup('lobby');
    expect(await set('active')).toEqual({ status: 'active' });
    const state = await getData(db(), 'game/state');
    expect(state?.status).toBe('active');
    expect(toMillis(state!.startedAt)).toBe(T0.getTime());
    const next = toMillis(state!.nextGlobalQuestAt);
    expect(next).toBeGreaterThanOrEqual(T0.getTime() + 60 * MIN);
    expect(next).toBeLessThanOrEqual(T0.getTime() + 120 * MIN);
    expect((await allDocs(db(), 'feed')).filter((f) => f.type === 'status')).toHaveLength(1);
  });

  it('active → paused → active keeps the original startedAt', async () => {
    await setup('active');
    expect(await set('paused')).toEqual({ status: 'paused' });
    expect((await getData(db(), 'game/state'))?.status).toBe('paused');
    expect(await set('active', 'gm', addMin(T0, 10))).toEqual({ status: 'active' });
    const state = await getData(db(), 'game/state');
    expect(state?.status).toBe('active');
    expect(toMillis(state!.startedAt)).toBe(addMin(T0, -60).getTime());
  });

  it('refuses to pause a game that has not started', async () => {
    await setup('lobby');
    await expectCode(set('paused'), 'failed-precondition');
    expect((await getData(db(), 'game/state'))?.status).toBe('lobby');
  });

  it.each(['ended', 'lobby', 'party', undefined])('refuses to set status %s directly', async (status) => {
    await setup('active');
    await expectCode(set(status), 'invalid-argument');
    expect((await getData(db(), 'game/state'))?.status).toBe('active');
  });

  it.each(['active', 'paused'])('cannot leave ended for %s (only a reset can)', async (status) => {
    await setup('ended');
    await expectCode(set(status), 'failed-precondition');
    expect((await getData(db(), 'game/state'))?.status).toBe('ended');
  });

  it('refuses non-GMs', async () => {
    await setup('lobby');
    await expectCode(set('active', 'alice'), 'permission-denied');
    await expectCode(setGameStatus(db(), ctx(null), { status: 'active' }), 'unauthenticated');
  });
});
