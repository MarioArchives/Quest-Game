import { describe, expect, it } from 'vitest';
import { hashText, makePrint, seeded } from './fingerprint';

describe('makePrint', () => {
  it('is the same every time for the same player', () => {
    expect(makePrint('demo-maya')).toEqual(makePrint('demo-maya'));
  });

  it('differs from player to player', () => {
    expect(makePrint('demo-maya').ridges).not.toEqual(makePrint('demo-sam').ridges);
  });

  it('is a loop or a whorl of ridge paths, with readout numbers in range', () => {
    const patterns = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']) {
      const print = makePrint(seed);
      patterns.add(print.pattern);
      expect(print.ridges.length).toBeGreaterThan(print.ridgeCount);
      for (const d of print.ridges) expect(d).toMatch(/^M[\d.-]+ [\d.-]+/);
      expect(print.ridgeCount).toBeGreaterThan(15);
      expect(print.minutiae).toBeGreaterThanOrEqual(6);
      expect(print.quality).toBeGreaterThanOrEqual(91);
      expect(print.quality).toBeLessThanOrEqual(98);
    }
    expect([...patterns].sort()).toEqual(['loop', 'whorl']);
  });

  it('an empty seed still makes a print', () => {
    expect(makePrint('').ridges.length).toBeGreaterThan(0);
  });
});

describe('the seeds', () => {
  it('hashText ignores case and spaces at the ends', () => {
    expect(hashText(' Maya ')).toBe(hashText('maya'));
    expect(hashText('maya')).not.toBe(hashText('sam'));
  });

  it('seeded gives the same numbers in [0, 1) for the same seed', () => {
    const a = seeded(42);
    const b = seeded(42);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
