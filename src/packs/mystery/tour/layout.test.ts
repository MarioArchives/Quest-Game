// Torch tour plan edge cases 14–15: where the tag hangs. On every phone it stays on the screen, never under the badge's
// strip or the dock, and clear of what's lit (only the last resort on a screen too short for both may cover it); a
// page scrolls as little as it can to bring a lit element and its tag into view.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planPlacement, scrollEnd, TAG_SIDE, whenStill, type Limits, type Lit, type Placement, type View } from './layout';
import { overlap, type Box } from './marks';

/** The tour's frame on a phone: the badge's strip on top, the dock (48px) under it, the frame as wide as the app. */
function phone(w: number, h: number) {
  const width = Math.min(w, 480);
  const frame = h - 48;
  const lim: Limits = { top: 36, bottom: frame - 6, width, floor: frame };
  const page = (scrollHeight: number, now = 0): View => ({ x: 0, top: 0, h: frame, now, max: Math.max(0, scrollHeight - frame) });
  return { lim, page };
}

const SIZES: [number, number][] = [
  [360, 640],
  [390, 844],
  [414, 896],
  [480, 800],
  [640, 360],
];
/** A tag as the tour hangs it: 220 wide, about 1.16 times as tall (more with words; compact on a short screen). */
const tagFor = (h: number) => ({ w: 220, h: h <= 500 ? 210 : 280 });
const lit = (x: number, y: number, w: number, h: number, scrolled = true): Lit => ({ box: { x, y, w, h }, scrolled });

/** The tag's box as placed. */
const tagBox = (p: Placement, tag: { w: number; h: number }): Box => ({ x: p.tag.x, y: p.tag.y, w: tag.w, h: tag.h });

function expectOnScreen(p: Placement, tag: { w: number; h: number }, lim: Limits) {
  expect(p.tag.x).toBeGreaterThanOrEqual(TAG_SIDE);
  expect(p.tag.x + tag.w).toBeLessThanOrEqual(lim.width - TAG_SIDE);
  expect(p.tag.y).toBeGreaterThanOrEqual(lim.top);
  expect(p.tag.y + tag.h).toBeLessThanOrEqual(lim.bottom + 2);
}

describe('14. the tag on every phone', () => {
  // What the stops light, as they sit on a page 1600px long: near the top, mid-page, low, wide and tall, and the tab
  // bar at the foot (not in the page).
  const shapes = (w: number, frame: number) => [
    { name: 'near the top', lits: [lit(8, 80, w - 16, 180)] },
    { name: 'mid-page', lits: [lit(20, 640, w - 40, 120)] },
    { name: 'low on the page', lits: [lit(20, 1400, w - 40, 160)] },
    { name: 'tall', lits: [lit(8, 300, w - 16, 520)], core: [lit(8, 300, w - 16, 150)] },
    { name: 'the tab bar', lits: [lit(0, frame - 68, w, 68, false)], growTop: 130 },
    { name: 'a sheet low down', lits: [lit(16, frame - 180, w - 32, 120, false)] },
  ];

  for (const [w, h] of SIZES) {
    it(`${w}×${h}: on screen, and clear of what's lit unless squeezed`, () => {
      const { lim, page } = phone(w, h);
      const tag = tagFor(h);
      for (const s of shapes(lim.width, lim.floor)) {
        const p = planPlacement({ lit: s.lits, core: s.core }, page(1600), tag, lim, s.growTop ?? 0);
        expect(p, s.name).not.toBeNull();
        expectOnScreen(p!, tag, lim);
        const o = overlap(tagBox(p!, tag), p!.spot);
        if (!p!.squeezed) expect(o.w * o.h, `${w}×${h} ${s.name}`).toBe(0);
      }
    });
  }

  it('a turned-over tag hangs above what sits at the foot, its twine down to the spot', () => {
    const { lim, page } = phone(390, 844);
    const p = planPlacement({ lit: [lit(0, lim.floor - 68, 390, 68, false)] }, page(1600), { w: 220, h: 280 }, lim, 130)!;
    expect(p.flip).toBe(true);
    expect(p.tag.y + 280).toBeLessThan(p.spot.y);
    expect(p.cord.y2).toBe(p.tacks[0]!.y);
  });

  it('on a phone on its side, the last resort keeps the tag between the strip and the dock', () => {
    const { lim, page } = phone(640, 360);
    const tag = tagFor(360);
    const p = planPlacement({ lit: [lit(8, 200, 460, 300)] }, page(1600), tag, lim)!;
    expect(p.squeezed).toBe(true);
    expectOnScreen(p, tag, lim);
  });
});

describe('15. as little scrolling as it takes', () => {
  const { lim, page } = phone(390, 844);
  const tag = { w: 220, h: 280 };

  it('nothing scrolls when the lit element and its tag already fit', () => {
    const p = planPlacement({ lit: [lit(8, 80, 374, 180)] }, page(1600), tag, lim)!;
    expect(p.scrollTop).toBeNull();
    expect(p.flip).toBe(false);
  });

  it('a lit element low on the page scrolls up just far enough for its tag below it', () => {
    const p = planPlacement({ lit: [lit(20, 900, 350, 120)] }, page(1600), tag, lim)!;
    expect(p.scrollTop).not.toBeNull();
    expect(p.tag.y + tag.h).toBe(lim.bottom); // the tag just fits: one pixel less and it wouldn't
    const less = planPlacement({ lit: [lit(20, 900, 350, 120)] }, page(1600, p.scrollTop! - 40), tag, lim)!;
    expect(less.scrollTop).toBe(p.scrollTop);
  });

  it('a page already scrolled past stays where it is when everything fits there', () => {
    const p = planPlacement({ lit: [lit(20, 500, 350, 120)] }, page(1600, 300), tag, lim)!;
    expect(p.scrollTop).toBeNull();
  });

  it('what is lit never scrolls up under the badge', () => {
    const p = planPlacement({ lit: [lit(20, 900, 350, 120)] }, page(1600, 1000), tag, lim)!;
    expect(p.spot.y).toBeGreaterThanOrEqual(lim.top - 8);
  });
});

describe('a hop measures once the page is still', () => {
  /** Frames on demand, 16 ms apart: `frame(move)` moves the page (or not), then runs what waits for the next frame. */
  function frames() {
    const waiting = new Map<number, FrameRequestCallback>();
    let id = 0;
    let t = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (waiting.set(++id, cb), id));
    vi.stubGlobal('cancelAnimationFrame', (n: number) => waiting.delete(n));
    return (move?: () => void) => {
      t += 16;
      move?.();
      const now = [...waiting.values()];
      waiting.clear();
      now.forEach((cb) => cb(t));
    };
  }
  afterEach(() => vi.unstubAllGlobals());

  it('a scroll it asked for: done when the page gets there, not before, however slow the phone', () => {
    const frame = frames();
    const page = { scrollTop: 0 };
    const seen: number[] = [];
    whenStill(page, () => seen.push(page.scrollTop), 200);
    for (let i = 0; i < 70; i++) frame(() => (page.scrollTop = Math.min(200, page.scrollTop + 4))); // over a second's glide
    expect(seen).toEqual([200]);
  });

  it('waits out a scroll already under way, then a few frames at rest', () => {
    const frame = frames();
    const page = { scrollTop: 300 };
    const then = vi.fn();
    whenStill(page, then);
    for (let i = 0; i < 8; i++) frame(() => (page.scrollTop -= 20));
    expect(then).not.toHaveBeenCalled();
    frame();
    frame();
    expect(then).not.toHaveBeenCalled();
    frame();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('a scroll that never sets off (nowhere further to go) still lets the hop go on', () => {
    const frame = frames();
    const then = vi.fn();
    whenStill({ scrollTop: 0 }, then, 120);
    for (let i = 0; i < 9; i++) frame();
    expect(then).not.toHaveBeenCalled();
    frame();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('gives up waiting after the longest a scroll should take', () => {
    const frame = frames();
    const page = { scrollTop: 0 };
    const then = vi.fn();
    whenStill(page, then, null, 500);
    for (let i = 0; i < 40 && !then.mock.calls.length; i++) frame(() => (page.scrollTop += 10)); // a page that never stops
    expect(then).toHaveBeenCalledTimes(1);
    expect(page.scrollTop).toBeLessThanOrEqual(340);
  });

  it('a hop overtaken (Next, Back, End tour) cancels the wait', () => {
    const frame = frames();
    const then = vi.fn();
    const cancel = whenStill({ scrollTop: 0 }, then);
    frame();
    cancel();
    for (let i = 0; i < 20; i++) frame();
    expect(then).not.toHaveBeenCalled();
  });

  it('a scroll ends where the page does', () => {
    const page = { scrollTop: 100, scrollHeight: 1000, clientHeight: 600 };
    expect(scrollEnd(page, 50)).toBe(150);
    expect(scrollEnd(page, -300)).toBe(0);
    expect(scrollEnd(page, 500)).toBe(400);
  });
});
