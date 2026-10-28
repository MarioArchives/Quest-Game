import { describe, expect, it } from 'vitest';
import type { CaseLine } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { chartDomain, lastLine, pointsAt, seriesOf, signed, spreadLabels, stepPath, swings, tableAt } from './chart';

const MIN = 60_000;
const l = (uid: string, min: number, delta: number, reason: CaseLine['reason'] = 'cleared'): CaseLine => ({ uid, t: min * MIN, delta, reason, note: null });
const TIMELINE = [l('sam', 10, 5), l('maya', 12, 5), l('sam', 20, -5, 'exposed'), l('sam', 24, -5, 'framed'), l('maya', 30, 5), l('sam', 60, 8)];

describe('points through the night', () => {
  it('steps each player from 0, ignoring everyone else', () => {
    expect(seriesOf(TIMELINE, 'sam', 0)).toEqual([
      { t: 0, points: 0 },
      { t: 10 * MIN, points: 5 },
      { t: 20 * MIN, points: 0 },
      { t: 24 * MIN, points: -5 },
      { t: 60 * MIN, points: 3 },
    ]);
    expect(seriesOf([], 'sam', 0)).toEqual([{ t: 0, points: 0 }]);
  });

  it('reads anyone’s points at any minute, a line counting from its own minute', () => {
    expect(pointsAt(TIMELINE, 'sam', 19 * MIN)).toBe(5);
    expect(pointsAt(TIMELINE, 'sam', 20 * MIN)).toBe(0);
    expect(pointsAt(TIMELINE, 'nobody', 99 * MIN)).toBe(0);
  });

  it('draws flat-then-vertical steps out to the end', () => {
    const d = stepPath(seriesOf([l('a', 1, 5)], 'a', 0), (t) => t / MIN, (v) => -v, 4 * MIN);
    expect(d).toBe('M0.0 0.0H1.0V-5.0H4.0');
  });
});

describe('the chart’s span', () => {
  it('holds every value and both standing lines with room to spare, in whole tens', () => {
    expect(chartDomain([34, -13], { confidantAbove: 10, poiBelow: -10 })).toEqual([-30, 40]);
    expect(chartDomain([], { confidantAbove: 10, poiBelow: -10 })).toEqual([-30, 30]);
    expect(chartDomain([3], { confidantAbove: null, poiBelow: null })).toEqual([-10, 10]);
  });
});

describe('your biggest swings', () => {
  it('runs lines within ten minutes into one swing and keeps the biggest, in time order', () => {
    // sam: +5 at 10, then −5 −5 within 4 minutes (one −10 swing), then +8.
    expect(swings(TIMELINE, 'sam', 2)).toEqual([
      { t: 24 * MIN, points: -5, delta: -10 },
      { t: 60 * MIN, points: 3, delta: 8 },
    ]);
  });

  it('never runs a rise into a fall, and breaks ties to the earlier', () => {
    expect(swings([l('a', 0, 5), l('a', 5, -5), l('a', 30, 3), l('a', 50, -3)], 'a', 1)).toEqual([{ t: 0, points: 5, delta: 5 }]);
    expect(swings([l('a', 0, 3), l('a', 5, -3)], 'a', 1)).toEqual([{ t: 0, points: 3, delta: 3 }]);
    expect(swings([], 'a')).toEqual([]);
  });
});

describe('the race', () => {
  const players = [{ uid: 'sam', name: 'Sam' }, { uid: 'maya', name: 'Maya' }, { uid: 'jo', name: 'Jo' }];

  it('orders the table at a minute by points, then by name', () => {
    expect(tableAt(TIMELINE, players, 15 * MIN)).toEqual([{ uid: 'maya', points: 5 }, { uid: 'sam', points: 5 }, { uid: 'jo', points: 0 }]);
    expect(tableAt(TIMELINE, players, 0).map((r) => r.uid)).toEqual(['jo', 'maya', 'sam']);
  });

  it('says what happened last at a minute', () => {
    expect(lastLine(TIMELINE, 21 * MIN)).toEqual(l('sam', 20, -5, 'exposed'));
    expect(lastLine(TIMELINE, 5 * MIN)).toBeNull();
  });
});

describe('labels and signs', () => {
  it('pushes line-end names apart, top to bottom', () => {
    expect(spreadLabels([{ y: 50, n: 'a' }, { y: 10, n: 'b' }, { y: 55, n: 'c' }], 11).map((x) => [x.n, x.y])).toEqual([['b', 10], ['a', 50], ['c', 61]]);
  });

  it('prints points with their sign', () => {
    expect([signed(5), signed(-13), signed(0)]).toEqual(['+5', '−13', '±0']);
  });
});
