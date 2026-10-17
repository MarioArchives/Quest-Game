// Mystery plan edge case 19, revised: standings as bars from zero on a ±25 grid that widens when needed.
import { describe, expect, it } from 'vitest';
import type { Doc, Player } from '../shared';
import { scaleTicks, standingBars, standingRowSize, standingScale } from './standingBars';

const p = (id: string, points: number, extra: Partial<Player> = {}): Doc<Player> =>
  ({ id, displayName: id.charAt(0).toUpperCase() + id.slice(1), photoURL: `https://example.com/${id}.jpg`, points, ...extra }) as Doc<Player>;

describe('standingBars', () => {
  it('one bar per player, highest score first, ties by name', () => {
    const bars = standingBars([p('sam', -25), p('maya', 420), p('jonah', 0), p('priya', 210), p('ada', 210)], 'priya');
    expect(bars.map((b) => b.uid)).toEqual(['maya', 'ada', 'priya', 'jonah', 'sam']);
  });

  it('puts scores above 0 on the plus side, below 0 on the minus side, and 0 on the line', () => {
    const bars = standingBars([p('a', 5), p('b', 0), p('c', -5)], null);
    expect(bars.map((b) => b.side)).toEqual(['plus', 'zero', 'minus']);
  });

  it('labels scores with a sign: +420, a real minus sign for −25, and plain 0', () => {
    const bars = standingBars([p('a', 420), p('b', 0), p('c', -25)], null);
    expect(bars.map((b) => b.label)).toEqual(['+420', '0', '−25']);
  });

  it('flags you, and only you', () => {
    const bars = standingBars([p('a', 3), p('b', 2)], 'b');
    expect(bars.map((b) => b.me)).toEqual([false, true]);
    expect(standingBars([p('a', 3)], null)[0]!.me).toBe(false);
  });

  it('carries the name and photo, with null for no photo and 0 for no points', () => {
    const bars = standingBars([p('a', 5), { id: 'b', displayName: 'Bea' } as Doc<Player>], null);
    expect(bars[0]).toMatchObject({ uid: 'a', name: 'A', photoURL: 'https://example.com/a.jpg', points: 5 });
    expect(bars[1]).toMatchObject({ uid: 'b', name: 'Bea', photoURL: null, points: 0, label: '0', side: 'zero' });
  });

  it('leaves out players kicked out of the game, but keeps frozen ones', () => {
    const bars = standingBars([p('a', 5), p('b', 9, { left: 'out' }), p('c', 1, { left: 'frozen' })], null);
    expect(bars.map((b) => b.uid)).toEqual(['a', 'c']);
  });

  it('is empty with no players', () => {
    expect(standingBars([], 'me')).toEqual([]);
  });
});

describe('standingScale', () => {
  it('is ±25 in squares of 5 while everyone fits, including nobody and all zeros', () => {
    const base = { max: 25, step: 5, squares: 5 };
    expect(standingScale([])).toEqual(base);
    expect(standingScale([0, 0])).toEqual(base);
    expect(standingScale([25, -10, 5])).toEqual(base);
    expect(standingScale([-25])).toEqual(base);
  });

  it('stretches to the next whole square of 5 when someone goes past 25, either way', () => {
    expect(standingScale([26])).toEqual({ max: 30, step: 5, squares: 6 });
    expect(standingScale([10, -45])).toEqual({ max: 45, step: 5, squares: 9 });
    expect(standingScale([50])).toEqual({ max: 50, step: 5, squares: 10 });
  });

  it('makes the squares bigger past 10 squares a side: 10, 20, 25, 50… points', () => {
    expect(standingScale([51])).toEqual({ max: 60, step: 10, squares: 6 });
    expect(standingScale([101])).toEqual({ max: 120, step: 20, squares: 6 });
    expect(standingScale([-240])).toEqual({ max: 250, step: 25, squares: 10 });
    expect(standingScale([420, -340])).toEqual({ max: 450, step: 50, squares: 9 });
    expect(standingScale([12_345])).toEqual({ max: 14_000, step: 2_000, squares: 7 });
  });

  it('takes another base', () => {
    expect(standingScale([7], { max: 10, step: 2, maxSquares: 5 })).toEqual({ max: 10, step: 2, squares: 5 });
    // 2.5 isn't a whole number of points, so the next square up is 5.
    expect(standingScale([11], { max: 10, step: 2, maxSquares: 5 })).toEqual({ max: 15, step: 5, squares: 3 });
  });
});

describe('scaleTicks', () => {
  it('has a line per square edge from +max to −max, every one labelled up to 6 a side', () => {
    const ticks = scaleTicks({ max: 25, step: 5, squares: 5 });
    expect(ticks.map((t) => t.value)).toEqual([25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25]);
    expect(ticks.map((t) => t.label)).toEqual(['+25', '+20', '+15', '+10', '+5', '0', '−5', '−10', '−15', '−20', '−25']);
  });

  it('labels every other line past 6 squares a side, always including 0', () => {
    const ticks = scaleTicks({ max: 50, step: 5, squares: 10 });
    expect(ticks).toHaveLength(21);
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['+50', '+40', '+30', '+20', '+10', '0', '−10', '−20', '−30', '−40', '−50']);
  });
});

describe('standingRowSize', () => {
  it('shares the space between the rows', () => {
    expect(standingRowSize(640, 10)).toEqual({ row: 64, face: 44 });
    expect(standingRowSize(700, 10)).toEqual({ row: 70, face: 48 });
  });

  it('never goes below the smallest row, so a long list scrolls', () => {
    expect(standingRowSize(400, 12)).toEqual({ row: 58, face: 40 });
    expect(standingRowSize(580, 10)).toEqual({ row: 58, face: 40 });
  });

  it('grows to half as big again at most, for a few players', () => {
    expect(standingRowSize(450, 3)).toEqual({ row: 87, face: 60 });
    expect(standingRowSize(870, 10)).toEqual({ row: 87, face: 60 });
  });

  it('starts at the smallest row before the sheet is measured, or with nobody on it', () => {
    expect(standingRowSize(0, 4)).toEqual({ row: 58, face: 40 });
    expect(standingRowSize(Number.NaN, 4)).toEqual({ row: 58, face: 40 });
    expect(standingRowSize(500, 0)).toEqual({ row: 58, face: 40 });
  });

  it('takes another smallest row and growth', () => {
    expect(standingRowSize(1000, 2, { row: 50, face: 30 }, 2)).toEqual({ row: 100, face: 60 });
    expect(standingRowSize(150, 2, { row: 50, face: 30 }, 2)).toEqual({ row: 75, face: 45 });
  });
});
