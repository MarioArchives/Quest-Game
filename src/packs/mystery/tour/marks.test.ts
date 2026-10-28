// Torch tour plan edge cases 16–17: the red pen's arrows stay on the screen, stubs aren't drawn, a hop's arrow sets
// off from the right place, and the SPECIMEN NIGHT badge steps out of the torch's way.
import { describe, expect, it } from 'vitest';
import { arrowPaths, badgeLow, hopArrow, MIN_ARROW, overlap, type Box } from './marks';

const screen = { w: 390, h: 760 };
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** Points along the quadratic curve an arrow draws. */
function along(a: { p0: { x: number; y: number }; c: { x: number; y: number }; p1: { x: number; y: number } }) {
  return Array.from({ length: 26 }, (_, i) => {
    const t = i / 25;
    const u = 1 - t;
    return { x: u * u * a.p0.x + 2 * u * t * a.c.x + t * t * a.p1.x, y: u * u * a.p0.y + 2 * u * t * a.c.y + t * t * a.p1.y };
  });
}

describe('16. arrows', () => {
  it('stay on the screen, even from a box at its edge to the tab bar', () => {
    const cases: [Box, Box][] = [
      [box(8, 120, 374, 180), box(140, 700, 110, 50)],
      [box(4, 60, 120, 40), box(270, 60, 110, 40)],
      [box(300, 400, 86, 60), box(10, 700, 100, 50)],
    ];
    for (const [a, b] of cases) {
      const arrow = arrowPaths(a, b, screen);
      expect(arrow).not.toBeNull();
      for (const p of along(arrow!)) {
        expect(p.x).toBeGreaterThanOrEqual(3);
        expect(p.x).toBeLessThanOrEqual(screen.w - 3);
        expect(p.y).toBeGreaterThanOrEqual(3);
        expect(p.y).toBeLessThanOrEqual(screen.h - 3);
      }
    }
  });

  it('none when it would be a stub (the thing being right by the spot)', () => {
    expect(arrowPaths(box(100, 100, 100, 40), box(100, 150, 100, 30), screen)).toBeNull();
    const a = arrowPaths(box(100, 100, 100, 40), box(100, 100 + 40 + MIN_ARROW + 30, 100, 30), screen);
    expect(a).not.toBeNull();
  });

  it('from what was lit when the target is outside it', () => {
    const lit = box(20, 100, 350, 200);
    const to = box(150, 700, 90, 50);
    const h = hopArrow({ to, lit, spot: box(12, 92, 366, 216), tag: box(80, 340, 220, 260), elsewhere: false });
    expect(h).toMatchObject({ from: lit, inner: false });
  });

  it('from the tag’s side when the target is inside what is lit (the torch stays)', () => {
    const spot = box(10, 100, 370, 400);
    const tag = box(100, 540, 200, 240);
    const to = box(40, 120, 80, 40);
    const h = hopArrow({ to, lit: spot, spot, tag, elsewhere: false });
    expect(h.inner).toBe(true);
    expect(h.from.w).toBe(4); // a point on the tag's side, facing the target
    expect(h.from.x).toBeLessThan(tag.x + 1);
    expect(h.away).toEqual({ x: 200, y: 660 });
  });

  it('on another screen the target is never inside what the stop lit', () => {
    const spot = box(10, 100, 370, 400);
    const h = hopArrow({ to: box(40, 120, 80, 40), lit: null, spot, tag: null, elsewhere: true });
    expect(h.inner).toBe(false);
  });
});

describe('17. the SPECIMEN NIGHT badge', () => {
  it('steps down when the torch is on it at the top', () => {
    expect(badgeLow(box(170, 6, 200, 36), 390)).toBe(true);
  });

  it('stays when the torch is elsewhere, or on where it would step down to', () => {
    expect(badgeLow(box(10, 300, 370, 200), 390)).toBe(false);
    expect(badgeLow(box(0, 0, 390, 120), 390)).toBe(false);
  });
});

describe('boxes', () => {
  it('overlap measures both ways, nothing when apart', () => {
    expect(overlap(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual({ w: 5, h: 5 });
    expect(overlap(box(0, 0, 10, 10), box(20, 0, 10, 10))).toEqual({ w: 0, h: 0 });
  });
});
