// Edge case 41: "last seen" labels, staleness and countdowns.
import { describe, expect, it } from 'vitest';
import { clockTime, dayAndTime, dayDate, dayName, formatAgo, formatCountdown, isStale } from './time';

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

describe("times in the pack's zone and locale (engine plan E8)", () => {
  // 02:30 UTC on Sat 10 Oct 2026: 03:30 Saturday in London (BST), 22:30 Friday in New York (EDT).
  const MS = Date.parse('2026-10-10T02:30:00Z');
  const LONDON = { timeZone: 'Europe/London', locale: 'en-GB' };
  const NEW_YORK = { timeZone: 'America/New_York', locale: 'en-GB' };

  it('clockTime', () => {
    expect(clockTime(MS, LONDON)).toBe('03:30');
    expect(clockTime(MS, NEW_YORK)).toBe('22:30');
  });

  it('dayAndTime', () => {
    expect(dayAndTime(MS, LONDON)).toBe('Sat 03:30');
    expect(dayAndTime(MS, NEW_YORK)).toBe('Fri 22:30');
  });

  it('dayDate', () => {
    expect(dayDate(MS, LONDON)).toBe('Sat 10 Oct');
    expect(dayDate(MS, NEW_YORK)).toBe('Fri 9 Oct');
  });

  it('dayName', () => {
    expect(dayName(MS, LONDON)).toBe('Saturday');
    expect(dayName(MS, NEW_YORK)).toBe('Friday');
  });

  it('follows the locale', () => {
    expect(dayName(MS, { timeZone: 'Europe/Paris', locale: 'fr-FR' })).toBe('samedi');
  });
});
