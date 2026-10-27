// The GM's start time (countdown plan edge cases 1–13): setting, moving and clearing it, telling the players,
// and the game opening itself at zero, from the timer or from a player's app.
import { describe, expect, it } from 'vitest';
import { resetGame } from '../src/game/reset.js';
import { openOnTime, runOpening, setStartTime } from '../src/game/startTime.js';
import { setGameStatus } from '../src/game/status.js';
import { getPack } from '../src/shared/packs/index.js';
import type { GameState } from '../src/shared/types.js';
import {
  addMin,
  ctx,
  expectCode,
  feedOf,
  getData,
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

const db = useEmulatorDb('demo-fq-start-time');

const mystery = getPack('mystery');
/** Saturday 7 November 2026, 19:00 in London (GMT, so 19:00Z). */
const NIGHT = new Date('2026-11-07T19:00:00Z');
const NIGHT_LATER = new Date('2026-11-07T19:30:00Z');
/** Saturday 24 October 2026, 19:00 in London (BST, so 18:00Z). */
const BST_NIGHT = new Date('2026-10-24T18:00:00Z');
const DAY = 24 * 60 * MIN;

const gm = (now: Date = T0) => ctx('gm', now, seededRng(), undefined, mystery);
const as = (uid: string | null, now: Date = T0) => ctx(uid, now, seededRng(), undefined, mystery);

async function lobby(state: Partial<GameState> = {}) {
  await seedGame(db(), { status: 'lobby', state: { startedAt: null, ...state } });
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice');
}

async function state(): Promise<Record<string, any>> {
  return (await getData(db(), 'game/state'))!;
}

const ms = (v: unknown) => (v == null ? null : toMillis(v));
const statusTexts = async () => (await feedOf(db(), 'status')).map((p) => p.text as string);

describe('setStartTime: who and when (edge cases 1, 2)', () => {
  it('refuses a player and a signed-out caller, and writes nothing', async () => {
    await lobby();
    await expectCode(setStartTime(db(), as('alice'), { at: NIGHT.getTime() }), 'permission-denied');
    await expectCode(setStartTime(db(), as(null), { at: NIGHT.getTime() }), 'unauthenticated');
    expect((await state()).opensAt ?? null).toBeNull();
  });

  it.each(['active', 'paused', 'ended'] as const)('refuses once the game is %s', async (status) => {
    await seedGame(db(), { status });
    await seedAdmin(db(), 'gm');
    await expectCode(setStartTime(db(), gm(), { at: NIGHT.getTime() }), 'failed-precondition');
    expect((await state()).opensAt ?? null).toBeNull();
  });
});

describe('setStartTime: a bad time (edge case 3)', () => {
  it.each([
    ['missing', undefined],
    ['a string', '2026-11-07T19:00:00Z'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['not a whole minute', NIGHT.getTime() + 30_000],
    ['now', T0.getTime()],
    ['in the past', addMin(T0, -60).getTime()],
    ['more than 366 days ahead', T0.getTime() + 366 * DAY + MIN],
  ])('refuses %s, and writes nothing', async (_label, at) => {
    await lobby();
    await expectCode(setStartTime(db(), gm(), { at, tell: true }), 'invalid-argument');
    expect((await state()).opensAt ?? null).toBeNull();
    expect(await feedOf(db(), 'status')).toEqual([]);
  });

  it('takes a time exactly 366 days ahead, and one a minute from now', async () => {
    await lobby();
    await setStartTime(db(), gm(), { at: T0.getTime() + 366 * DAY });
    expect(ms((await state()).opensAt)).toBe(T0.getTime() + 366 * DAY);
    await setStartTime(db(), gm(), { at: addMin(T0, 1).getTime() });
    expect(ms((await state()).opensAt)).toBe(addMin(T0, 1).getTime());
  });
});

describe('setStartTime: setting, moving and clearing (edge cases 4–6)', () => {
  it('a first time is stored with no move, and returned', async () => {
    await lobby();
    expect(await setStartTime(db(), gm(), { at: NIGHT.getTime() })).toEqual({ opensAt: NIGHT.getTime() });
    const s = await state();
    expect(ms(s.opensAt)).toBe(NIGHT.getTime());
    expect(s.opensMoved ?? null).toBeNull();
    expect(s.status).toBe('lobby');
  });

  it('telling the players posts once; not telling posts nothing', async () => {
    await lobby();
    await setStartTime(db(), gm(), { at: NIGHT.getTime() });
    expect(await feedOf(db(), 'status')).toEqual([]);
    await setStartTime(db(), gm(), { at: null });
    await setStartTime(db(), gm(), { at: NIGHT.getTime(), tell: true });
    expect(await statusTexts()).toEqual(['Starts at 19:00, Sat 7 Nov.']);
  });

  it('moving it records the old time and when it moved, and the post says so', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    const when = addMin(T0, 5);
    expect(await setStartTime(db(), gm(when), { at: NIGHT_LATER.getTime(), tell: true })).toEqual({ opensAt: NIGHT_LATER.getTime() });
    const s = await state();
    expect(ms(s.opensAt)).toBe(NIGHT_LATER.getTime());
    expect(ms(s.opensMoved?.from)).toBe(NIGHT.getTime());
    expect(ms(s.opensMoved?.at)).toBe(when.getTime());
    expect(await statusTexts()).toEqual(['Start moved to 19:30, Sat 7 Nov.']);
  });

  it('moving it quietly still records the move, with no post', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await setStartTime(db(), gm(), { at: NIGHT_LATER.getTime(), tell: false });
    expect(ms((await state()).opensMoved?.from)).toBe(NIGHT.getTime());
    expect(await feedOf(db(), 'status')).toEqual([]);
  });

  it('the same time again changes nothing: no post and no move', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await setStartTime(db(), gm(), { at: NIGHT.getTime(), tell: true });
    const s = await state();
    expect(ms(s.opensAt)).toBe(NIGHT.getTime());
    expect(s.opensMoved ?? null).toBeNull();
    expect(await feedOf(db(), 'status')).toEqual([]);
  });

  it('clearing it nulls the time and the move, and tells the players the GM opens it by hand', async () => {
    await lobby({ opensAt: ts(NIGHT_LATER), opensMoved: { from: ts(NIGHT), at: ts(T0) } });
    expect(await setStartTime(db(), gm(), { at: null, tell: true })).toEqual({ opensAt: null });
    const s = await state();
    expect(s.opensAt ?? null).toBeNull();
    expect(s.opensMoved ?? null).toBeNull();
    expect(await statusTexts()).toEqual(['No start time for now: the GM opens it by hand.']);
  });

  it('clearing when nothing is set changes nothing, even when told to tell', async () => {
    await lobby();
    expect(await setStartTime(db(), gm(), { at: null, tell: true })).toEqual({ opensAt: null });
    expect((await state()).opensAt ?? null).toBeNull();
    expect(await feedOf(db(), 'status')).toEqual([]);
  });
});

describe('setStartTime: words in the pack’s zone and locale (edge case 7)', () => {
  it('reads a summer-time evening as London wall time, not UTC', async () => {
    await lobby();
    await setStartTime(db(), gm(), { at: BST_NIGHT.getTime(), tell: true });
    expect(await statusTexts()).toEqual(['Starts at 19:00, Sat 24 Oct.']);
  });

  it('and a winter one too', async () => {
    await lobby({ opensAt: ts(BST_NIGHT) });
    await setStartTime(db(), gm(), { at: NIGHT.getTime(), tell: true });
    expect(await statusTexts()).toEqual(['Start moved to 19:00, Sat 7 Nov.']);
  });
});

describe('runOpening: the game opens itself at zero (edge cases 8–10)', () => {
  it('does nothing before the time', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    expect(await runOpening(db(), addMin(NIGHT, -1), seededRng(), mystery)).toEqual({ opened: false });
    const s = await state();
    expect(s.status).toBe('lobby');
    expect(s.startedAt).toBeNull();
    expect(await feedOf(db(), 'status')).toEqual([]);
  });

  it.each([
    ['exactly at the time', 0],
    ['after it', 7],
  ])('opens the game %s, keeping the start time', async (_label, late) => {
    await lobby({ opensAt: ts(NIGHT) });
    const now = addMin(NIGHT, late);
    expect(await runOpening(db(), now, seededRng(), mystery)).toEqual({ opened: true });
    const s = await state();
    expect(s.status).toBe('active');
    expect(ms(s.startedAt)).toBe(now.getTime());
    expect(ms(s.nextGlobalQuestAt)).toBeGreaterThan(now.getTime());
    expect(ms(s.opensAt)).toBe(NIGHT.getTime());
    expect(await statusTexts()).toEqual(['The game has started!']);
  });

  it('opens it once, however many times it runs', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await runOpening(db(), NIGHT, seededRng(), mystery);
    expect(await runOpening(db(), addMin(NIGHT, 5), seededRng(), mystery)).toEqual({ opened: false });
    expect(ms((await state()).startedAt)).toBe(NIGHT.getTime());
    expect(await feedOf(db(), 'status')).toHaveLength(1);
  });

  it('opens it once when the timer and a player’s app arrive together', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await Promise.all([runOpening(db(), NIGHT, seededRng(), mystery), openOnTime(db(), as('alice', NIGHT), {})]);
    expect((await state()).status).toBe('active');
    expect(await feedOf(db(), 'status')).toHaveLength(1);
  });

  it('does nothing with no start time', async () => {
    await lobby();
    expect(await runOpening(db(), NIGHT, seededRng(), mystery)).toEqual({ opened: false });
    expect((await state()).status).toBe('lobby');
  });

  it.each(['active', 'paused', 'ended'] as const)('does nothing once the game is %s', async (status) => {
    await seedGame(db(), { status, state: { opensAt: ts(NIGHT) } });
    const before = await state();
    expect(await runOpening(db(), addMin(NIGHT, 5), seededRng(), mystery)).toEqual({ opened: false });
    expect((await state()).status).toBe(status);
    expect(ms((await state()).startedAt)).toBe(ms(before.startedAt));
    expect(await feedOf(db(), 'status')).toEqual([]);
  });
});

describe('openOnTime: a player’s app at zero (edge case 11)', () => {
  it('refuses a signed-out caller and someone not in the game', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await expectCode(openOnTime(db(), as(null, NIGHT), {}), 'unauthenticated');
    await expectCode(openOnTime(db(), as('stranger', NIGHT), {}), 'permission-denied');
    expect((await state()).status).toBe('lobby');
  });

  it('before the time, says how long is left and opens nothing', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    expect(await openOnTime(db(), as('alice', addMin(NIGHT, -5)), {})).toEqual({ opened: false, inMs: 5 * MIN });
    expect((await state()).status).toBe('lobby');
  });

  it('at the time, a player opens the game', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    expect(await openOnTime(db(), as('alice', NIGHT), {})).toEqual({ opened: true, inMs: null });
    expect((await state()).status).toBe('active');
  });

  it('the GM may call it too, without a player doc', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    expect(await openOnTime(db(), gm(addMin(NIGHT, 1)), {})).toEqual({ opened: true, inMs: null });
  });

  it('once the game is open, says so without posting again', async () => {
    await lobby({ opensAt: ts(NIGHT) });
    await runOpening(db(), NIGHT, seededRng(), mystery);
    expect(await openOnTime(db(), as('alice', addMin(NIGHT, 1)), {})).toEqual({ opened: true, inMs: null });
    expect(await feedOf(db(), 'status')).toHaveLength(1);
  });

  it('with no start time, has nothing to wait for', async () => {
    await lobby();
    expect(await openOnTime(db(), as('alice', NIGHT), {})).toEqual({ opened: false, inMs: null });
  });
});

describe('opening by hand, and a reset (edge cases 12, 13)', () => {
  it('Open case before the time clears the start time, so the timer never opens it again', async () => {
    await lobby({ opensAt: ts(NIGHT_LATER), opensMoved: { from: ts(NIGHT), at: ts(T0) } });
    await setGameStatus(db(), gm(addMin(NIGHT, -10)), { status: 'active' });
    const s = await state();
    expect(s.status).toBe('active');
    expect(s.opensAt ?? null).toBeNull();
    expect(s.opensMoved ?? null).toBeNull();
    expect(await runOpening(db(), NIGHT_LATER, seededRng(), mystery)).toEqual({ opened: false });
    expect(await feedOf(db(), 'status')).toHaveLength(1);
  });

  it('a reset leaves no start time and no move', async () => {
    await seedGame(db(), { status: 'active', state: { opensAt: ts(NIGHT), opensMoved: { from: ts(BST_NIGHT), at: ts(T0) } } });
    await seedAdmin(db(), 'gm');
    await resetGame(db(), gm(), { confirm: 'RESET' });
    const s = await state();
    expect(s.status).toBe('lobby');
    expect(s.opensAt ?? null).toBeNull();
    expect(s.opensMoved ?? null).toBeNull();
  });
});
