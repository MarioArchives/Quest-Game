// Dealing each player another player (plan "Mystery pack: minimal notifications, Bob's story arc…", edge case 15):
// derange() is a shuffle where nobody gets themself, and everybody is somebody's.
import { describe, expect, it } from 'vitest';
import { derange } from '../src/shared/derange.js';
import { constRng, seededRng } from './helpers.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('derange', () => {
  it.each([2, 3, 4, 7, 12])('with %i players: each gets exactly one other, and each is dealt to exactly one', (n) => {
    for (let seed = 1; seed <= 40; seed++) {
      const players = ids(n);
      const dealt = derange(players, seededRng(seed));
      expect(Object.keys(dealt).sort()).toEqual([...players].sort());
      for (const [giver, target] of Object.entries(dealt)) expect(target, `seed ${seed}`).not.toBe(giver);
      expect(Object.values(dealt).sort()).toEqual([...players].sort());
    }
  });

  it('two players swap', () => {
    expect(derange(['alice', 'bob'], seededRng(3))).toEqual({ alice: 'bob', bob: 'alice' });
  });

  it('is the same for the same random numbers, and works with a constant one', () => {
    expect(derange(ids(6), seededRng(9))).toEqual(derange(ids(6), seededRng(9)));
    const constant = derange(ids(5), constRng(0));
    for (const [giver, target] of Object.entries(constant)) expect(target).not.toBe(giver);
    expect(derange(ids(5), constRng(0.999))).toEqual(derange(ids(5), constRng(0.999)));
  });

  it('does not depend on the order it is given the ids in', () => {
    const players = ids(6);
    expect(derange([...players].reverse(), seededRng(5))).toEqual(derange(players, seededRng(5)));
  });

  it('varies with the random numbers (not always the same deal)', () => {
    const deals = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) deals.add(JSON.stringify(derange(ids(5), seededRng(seed))));
    expect(deals.size).toBeGreaterThan(5);
  });

  it('refuses fewer than two players, or the same player twice', () => {
    expect(() => derange([], seededRng(1))).toThrow();
    expect(() => derange(['alice'], seededRng(1))).toThrow();
    expect(() => derange(['alice', 'alice'], seededRng(1))).toThrow();
  });
});
