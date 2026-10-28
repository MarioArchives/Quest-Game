import { describe, expect, it } from 'vitest';
import type { CaseLine } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { pointsByStop, project, scaleBar, stopAt, yarnPath } from './crawl';

const MIN = 60_000;
// The mystery route's first and last bars: Big Hands on Oxford Road, The Mother of Invention on Oldham Street.
const BIG_HANDS = { lat: 53.46292, lng: -2.23041 };
const FLOK = { lat: 53.48276, lng: -2.23372 };
const MOTHER = { lat: 53.48332, lng: -2.23481 };

describe('the map', () => {
  it('fits every stop inside the padded box, north up, with metres the same both ways', () => {
    const p = project([BIG_HANDS, FLOK, MOTHER], 300, 400, 30);
    const pts = [BIG_HANDS, FLOK, MOTHER].map(p.at);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(29.9);
      expect(x).toBeLessThanOrEqual(270.1);
      expect(y).toBeGreaterThanOrEqual(29.9);
      expect(y).toBeLessThanOrEqual(370.1);
    }
    // Big Hands is south of the others, so lower on the page; the span north to south fills the height.
    expect(pts[0][1]).toBeCloseTo(370, 0);
    expect(pts[2][1]).toBeCloseTo(30, 0);
    // About 2.2 km north to south in 340 px.
    expect(p.k).toBeCloseTo(340 / ((53.48332 - 53.46292) * 111_320), 3);
  });

  it('puts a lone stop (or none) in the middle at street scale', () => {
    const p = project([FLOK], 300, 400, 30);
    expect(p.at(FLOK)).toEqual([150, 200]);
    expect(p.k).toBe(0.6);
    expect(project([], 300, 400, 30).at({ lat: 0, lng: 0 })).toEqual([150, 200]);
  });

  it('strings the yarn pin to pin with a sag between', () => {
    expect(yarnPath([[0, 0], [100, 0]])).toBe('M0.0 0.0 Q56.0 12.0 100.0 0.0');
    expect(yarnPath([[5, 5]])).toBe('M5.0 5.0');
    expect(yarnPath([])).toBe('');
  });

  it('picks the round distance that fits for the scale bar', () => {
    expect(scaleBar(0.194, 120)).toEqual({ metres: 500, px: 97, label: '500 m' });
    expect(scaleBar(0.05, 120).label).toBe('2 km');
  });
});

describe('the crawl', () => {
  const stops = [
    { startMs: 0, leaveMs: 60 * MIN },
    { startMs: 60 * MIN, leaveMs: 120 * MIN },
    { startMs: null, leaveMs: null },
    { startMs: 180 * MIN, leaveMs: null },
  ];
  const l = (min: number, delta: number, uid = 'sam'): CaseLine => ({ uid, t: min * MIN, delta, reason: 'cleared', note: null });

  it('adds your lines up per stop, from arriving until leaving; a stop with no time has none', () => {
    const timeline = [l(-5, 5), l(10, 5), l(60, -5), l(70, 5), l(100, 5, 'maya'), l(150, 8), l(200, -2)];
    expect(pointsByStop(timeline, 'sam', stops)).toEqual([5, 0, null, -2]);
  });

  it('says which stop the group was at at a minute', () => {
    expect(stopAt(stops, 30 * MIN)).toBe(stops[0]);
    expect(stopAt(stops, 60 * MIN)).toBe(stops[1]);
    expect(stopAt(stops, 150 * MIN)).toBeNull();
    expect(stopAt(stops, 999 * MIN)).toBe(stops[3]);
    expect(stopAt(stops, -1)).toBeNull();
  });
});
