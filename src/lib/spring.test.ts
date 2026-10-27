// Plan "turn the page", edge case 5: the spring that carries a page turn home once the finger lets go.
import { describe, expect, it } from 'vitest';
import { springSettled, springStep, type Spring } from './spring';

const FRAME = 1 / 60;

/** Runs the spring at 60 fps until it settles (or gives up after `frames`), keeping every position. */
function run(from: Spring, target: number, frames = 240) {
  const xs: number[] = [];
  let s = from;
  for (let i = 0; i < frames && !springSettled(s, target); i++) {
    s = springStep(s, target, FRAME);
    xs.push(s.x);
  }
  return { end: s, xs };
}

describe('springStep', () => {
  it('goes from 0 to 1 and comes to rest within a second, without overshooting past 1.02', () => {
    const { end, xs } = run({ x: 0, v: 0 }, 1);
    expect(springSettled(end, 1)).toBe(true);
    expect(Math.abs(end.x - 1)).toBeLessThan(0.0005);
    expect(xs.length).toBeLessThanOrEqual(60);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1.02);
  });

  it('goes back to 0 the same way', () => {
    const { end, xs } = run({ x: 0.4, v: 0 }, 0);
    expect(springSettled(end, 0)).toBe(true);
    expect(xs.length).toBeLessThanOrEqual(60);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.02);
  });

  it('an initial velocity carries it further first', () => {
    const away = springStep({ x: 0.5, v: -3 }, 1, FRAME);
    expect(away.x).toBeLessThan(0.5);
    const still = springStep({ x: 0.5, v: 0 }, 1, FRAME);
    const towards = springStep({ x: 0.5, v: 3 }, 1, FRAME);
    expect(towards.x).toBeGreaterThan(still.x);
  });

  it('a frame longer than 50 ms counts as 50 ms, so a stall never makes it jump', () => {
    const from: Spring = { x: 0, v: 0 };
    expect(springStep(from, 1, 1)).toEqual(springStep(from, 1, 0.05));
    expect(springStep(from, 1, 0.2)).toEqual(springStep(from, 1, 0.05));
  });
});

describe('springSettled', () => {
  it('only when within 0.0005 of the target and slower than 0.005', () => {
    expect(springSettled({ x: 0.9996, v: 0.004 }, 1)).toBe(true);
    expect(springSettled({ x: 1, v: 0 }, 1)).toBe(true);
    expect(springSettled({ x: 0.999, v: 0 }, 1)).toBe(false);
    expect(springSettled({ x: 1, v: 0.01 }, 1)).toBe(false);
    expect(springSettled({ x: 1, v: -0.01 }, 1)).toBe(false);
  });
});
