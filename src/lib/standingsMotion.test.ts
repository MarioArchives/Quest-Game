import { describe, expect, it } from 'vitest';
import { easeOutCubic, parseSeen, pointDeltas, rankUids, tweenPoints } from './standingsMotion';

describe('easeOutCubic', () => {
  it('runs from 0 to 1, fast at first, and clamps outside that', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('tweenPoints', () => {
  const from = { a: 10, b: -5 };
  const to = { a: 20, b: 5, c: -10 };
  it('starts where they were (someone new at 0), ends where they are, and is part way between', () => {
    expect(tweenPoints(from, to, 0)).toEqual({ a: 10, b: -5, c: 0 });
    expect(tweenPoints(from, to, 0.5)).toEqual({ a: 15, b: 0, c: -5 });
    expect(tweenPoints(from, to, 1)).toEqual(to);
  });
  it('drops players who are gone', () => {
    expect(Object.keys(tweenPoints({ gone: 5, a: 1 }, { a: 2 }, 0.5))).toEqual(['a']);
  });
});

describe('pointDeltas', () => {
  it('lists only real changes for players seen before', () => {
    expect(pointDeltas({ a: 10, b: 0, c: 5 }, { a: 15, b: 0, c: -5, d: 20 })).toEqual({ a: 5, c: -10 });
  });
  it('is empty the first time', () => {
    expect(pointDeltas(null, { a: 15 })).toEqual({});
  });
});

describe('parseSeen', () => {
  it('reads an object of whole numbers', () => {
    expect(parseSeen('{"a":10,"b":-5}')).toEqual({ a: 10, b: -5 });
    expect(parseSeen('{}')).toEqual({});
  });
  it('turns anything else into null', () => {
    for (const raw of [null, '', 'nope', '[1,2]', 'null', '5', '{"a":"10"}', '{"a":1.5}']) expect(parseSeen(raw)).toBeNull();
  });
});

describe('rankUids', () => {
  it('ranks highest first, ties by name, missing scores as 0', () => {
    const players = [
      { uid: 'z', name: 'Zed' },
      { uid: 'a', name: 'Ann' },
      { uid: 'm', name: 'Mo' },
    ];
    expect(rankUids(players, { z: 5, a: 5, m: 10 })).toEqual(['m', 'a', 'z']);
    expect(rankUids(players, { z: -5 })).toEqual(['a', 'm', 'z']);
  });
});
