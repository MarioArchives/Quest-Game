// Edge case 41: "last seen" labels, staleness and countdowns.
import { describe, expect, it } from 'vitest';
import { formatAgo, formatCountdown, isStale } from './time';

const now = Date.parse('2026-10-10T14:00:00Z');
const MIN = 60_000;

describe('formatAgo', () => {
  it.each([
    [10_000, 'just now'],
    [59_000, 'just now'],
    [MIN, '1 min ago'],
    [5 * MIN, '5 min ago'],
    [59 * MIN, '59 min ago'],
    [60 * MIN, '1 h ago'],
    [150 * MIN, '2 h ago'],
  ])('%i ms ago → %s', (ago, label) => {
    expect(formatAgo(now - ago, now)).toBe(label);
  });

  it('shows future timestamps (clock skew) as just now', () => {
    expect(formatAgo(now + 5 * MIN, now)).toBe('just now');
  });
});

describe('isStale', () => {
  it('hides positions that are 15 or more minutes old', () => {
    expect(isStale(now - 14 * MIN - 59_000, now)).toBe(false);
    expect(isStale(now - 15 * MIN, now)).toBe(true);
    expect(isStale(now - 60 * MIN, now)).toBe(true);
  });

  it('treats future timestamps as fresh', () => {
    expect(isStale(now + MIN, now)).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('shows mm:ss, rounding up to the next second', () => {
    expect(formatCountdown(now + 125_000, now)).toBe('02:05');
    expect(formatCountdown(now + 999, now)).toBe('00:01');
    expect(formatCountdown(now + 45 * MIN, now)).toBe('45:00');
  });

  it('shows h:mm:ss past an hour', () => {
    expect(formatCountdown(now + 61 * MIN, now)).toBe('1:01:00');
  });

  it('says closed at or after the end', () => {
    expect(formatCountdown(now, now)).toBe('closed');
    expect(formatCountdown(now - 1, now)).toBe('closed');
  });
});
