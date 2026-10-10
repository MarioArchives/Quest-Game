// Edge case 44: guess cooldown computed from your own guesses, per target.
import { describe, expect, it } from 'vitest';
import { guessCooldownRemaining } from './guess';

const now = Date.parse('2026-10-10T14:00:00Z');
const MIN = 60_000;

describe('guessCooldownRemaining', () => {
  it('is 0 with no guesses', () => {
    expect(guessCooldownRemaining([], 'bob', now, 30)).toBe(0);
  });

  it('counts down from the latest guess at that target', () => {
    const mine = [
      { targetUid: 'bob', createdAt: now - 25 * MIN },
      { targetUid: 'bob', createdAt: now - 10 * MIN },
    ];
    expect(guessCooldownRemaining(mine, 'bob', now, 30)).toBe(20 * MIN);
  });

  it('ignores guesses at other targets', () => {
    expect(guessCooldownRemaining([{ targetUid: 'carol', createdAt: now - MIN }], 'bob', now, 30)).toBe(0);
  });

  it('is 0 at exactly the cooldown', () => {
    expect(guessCooldownRemaining([{ targetUid: 'bob', createdAt: now - 30 * MIN }], 'bob', now, 30)).toBe(0);
  });
});
