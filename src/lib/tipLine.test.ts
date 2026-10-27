// The tip line on the points chip: hidden, ready, cooling down or locked, with the edges at the line and the clock.
import { describe, expect, it } from 'vitest';
import { accusedPreview, tipLineState, tipWaitMs, waitMinutes, type TipLineInput } from './tipLine';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 17, 20, 24);

const input = (over: Partial<TipLineInput> = {}, me: Partial<NonNullable<TipLineInput['me']>> = {}): TipLineInput => ({
  police: true,
  status: 'active',
  me: { points: 14, left: false, lastSnitchedMs: null, ...me },
  settings: { confidantAbove: 10, poiBelow: -10, policeTipEveryMin: 60 },
  nowMs: NOW,
  ...over,
});

describe('tipLineState', () => {
  it('is hidden without police, a player doc, a running game, or a confidant line', () => {
    expect(tipLineState(input({ police: false })).kind).toBe('hidden');
    expect(tipLineState(input({ me: null })).kind).toBe('hidden');
    expect(tipLineState(input({}, { left: true })).kind).toBe('hidden');
    for (const status of ['lobby', 'paused', 'ended'] as const) expect(tipLineState(input({ status })).kind).toBe('hidden');
    expect(tipLineState(input({ settings: { confidantAbove: null, poiBelow: -10, policeTipEveryMin: 60 } })).kind).toBe('hidden');
  });

  it('is ready for a confidant who has never tipped', () => {
    expect(tipLineState(input())).toEqual({ kind: 'ready', period: 'never' });
  });

  it('is strict at the line: exactly +10 is locked, +11 is ready', () => {
    expect(tipLineState(input({}, { points: 10 }))).toEqual({ kind: 'locked', need: 11, points: 10 });
    expect(tipLineState(input({}, { points: 11 })).kind).toBe('ready');
  });

  it('is locked below the line, persons of interest included, and says what it takes', () => {
    expect(tipLineState(input({}, { points: 4 }))).toEqual({ kind: 'locked', need: 11, points: 4 });
    expect(tipLineState(input({}, { points: -15 }))).toEqual({ kind: 'locked', need: 11, points: -15 });
  });

  it('works out the score to reach from a line at or below zero', () => {
    const settings = { confidantAbove: -5, poiBelow: null, policeTipEveryMin: 60 };
    expect(tipLineState(input({ settings }, { points: -5 }))).toEqual({ kind: 'locked', need: -4, points: -5 });
    expect(tipLineState(input({ settings }, { points: -4 })).kind).toBe('ready');
    expect(tipLineState(input({ settings: { ...settings, confidantAbove: 0 } }, { points: 0 }))).toMatchObject({ need: 1 });
  });

  it('ignores the person of interest line when it is off', () => {
    const settings = { confidantAbove: 10, poiBelow: null, policeTipEveryMin: 60 };
    expect(tipLineState(input({ settings }, { points: 11 })).kind).toBe('ready');
    expect(tipLineState(input({ settings }, { points: -50 })).kind).toBe('locked');
  });

  it('cools down after a tip, with the wait, the share of it left and when it opens', () => {
    const state = tipLineState(input({}, { lastSnitchedMs: NOW - 37 * MIN }));
    expect(state).toEqual({ kind: 'cooldown', waitMs: 23 * MIN, fullMs: 60 * MIN, remaining: 23 / 60, opensAtMs: NOW + 23 * MIN });
  });

  it('opens exactly when the cooldown has run, not a millisecond before', () => {
    expect(tipLineState(input({}, { lastSnitchedMs: NOW - 60 * MIN }))).toEqual({ kind: 'ready', period: String(NOW - 60 * MIN) });
    expect(tipLineState(input({}, { lastSnitchedMs: NOW - 60 * MIN + 1 }))).toMatchObject({ kind: 'cooldown', waitMs: 1 });
  });

  it('never waits longer than the full cooldown when the clock lags the server stamp', () => {
    const state = tipLineState(input({}, { lastSnitchedMs: NOW + 12_000 }));
    expect(state).toEqual({ kind: 'cooldown', waitMs: 60 * MIN, fullMs: 60 * MIN, remaining: 1, opensAtMs: NOW + 60 * MIN });
  });

  it('is always ready with no cooldown', () => {
    const settings = { confidantAbove: 10, poiBelow: -10, policeTipEveryMin: 0 };
    expect(tipLineState(input({ settings }, { lastSnitchedMs: NOW })).kind).toBe('ready');
    expect(tipLineState(input({ settings }, { lastSnitchedMs: NOW + 5_000 })).kind).toBe('ready');
  });

  it('a new tip starts a new ready period; the same tip keeps the same one', () => {
    const first = tipLineState(input({ nowMs: NOW + 2 * 60 * MIN }, { lastSnitchedMs: NOW }));
    const later = tipLineState(input({ nowMs: NOW + 3 * 60 * MIN }, { lastSnitchedMs: NOW }));
    const next = tipLineState(input({ nowMs: NOW + 5 * 60 * MIN }, { lastSnitchedMs: NOW + 3 * 60 * MIN }));
    expect(first).toEqual(later);
    expect(next).not.toEqual(first);
    expect(next.kind).toBe('ready');
  });

  it('a lapsed confidant who is back above the line is ready in the same period', () => {
    const before = tipLineState(input({}, { points: 12, lastSnitchedMs: NOW - 90 * MIN }));
    expect(tipLineState(input({}, { points: 9, lastSnitchedMs: NOW - 90 * MIN })).kind).toBe('locked');
    expect(tipLineState(input({}, { points: 15, lastSnitchedMs: NOW - 90 * MIN }))).toEqual(before);
  });
});

describe('tipWaitMs', () => {
  it('is 0 with no tip yet or once the cooldown has run', () => {
    expect(tipWaitMs(null, 60, NOW)).toBe(0);
    expect(tipWaitMs(NOW - 61 * MIN, 60, NOW)).toBe(0);
  });

  it('clamps to the full cooldown', () => {
    expect(tipWaitMs(NOW + 30_000, 60, NOW)).toBe(60 * MIN);
    expect(tipWaitMs(NOW - MIN, 60, NOW)).toBe(59 * MIN);
  });
});

describe('waitMinutes', () => {
  it('rounds up, and never says 0', () => {
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(MIN)).toBe(1);
    expect(waitMinutes(MIN + 1)).toBe(2);
    expect(waitMinutes(23 * MIN)).toBe(23);
    expect(waitMinutes(0)).toBe(1);
  });
});

describe('accusedPreview', () => {
  it('shows the tipper what the police will say, as they type', () => {
    expect(accusedPreview(undefined, 'Being a silly patotie', 'Sam', 'Test Constabulary')).toBe('You have been accused of being a silly patotie.');
    expect(accusedPreview(undefined, '', 'Sam', 'X')).toBe('You have been accused of …');
    expect(accusedPreview('{name}, {caller} says you were caught {accusation}.', 'dancing!', 'Sam', 'Test Constabulary')).toBe(
      'Sam, Test Constabulary says you were caught dancing.',
    );
  });
});

describe("accusedPreview with a pack's variants", () => {
  it('shows the first variant, and an officer as "an officer"', () => {
    expect(accusedPreview(['We have been tipped off that you have been {accusation}.', 'Word is you have been {accusation}.'], 'hogging the jukebox', 'Sam', 'X')).toBe(
      'We have been tipped off that you have been hogging the jukebox.',
    );
    expect(accusedPreview('{officer} here: you have been {accusation}.', 'been hogging the jukebox', 'Sam', 'X')).toBe('an officer here: you have been hogging the jukebox.');
    expect(accusedPreview(['{accusation}, says {caller}.'], '', 'Sam', 'Test Constabulary')).toBe('…, says Test Constabulary.');
  });
});
