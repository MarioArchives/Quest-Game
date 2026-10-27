// Edge case 41: "last seen" labels, staleness and countdowns.
import { describe, expect, it } from 'vitest';
import { clockTime, dayAndTime, dayChoices, dayDate, dayName, formatAgo, formatCountdown, isStale, zonedMs } from './time';

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

describe('zonedMs: a wall-clock date and time in a zone (countdown plan edge case 19)', () => {
  const LONDON = { timeZone: 'Europe/London' };

  it('reads a winter evening in London as GMT', () => {
    expect(zonedMs('2026-11-07', '19:00', LONDON)).toBe(Date.parse('2026-11-07T19:00:00Z'));
  });

  it('reads a summer evening in London as BST', () => {
    expect(zonedMs('2026-10-24', '19:00', LONDON)).toBe(Date.parse('2026-10-24T18:00:00Z'));
  });

  it('is right on both sides of the clocks going back (02:00 BST on 25 Oct 2026)', () => {
    expect(zonedMs('2026-10-25', '00:30', LONDON)).toBe(Date.parse('2026-10-24T23:30:00Z'));
    expect(zonedMs('2026-10-25', '12:00', LONDON)).toBe(Date.parse('2026-10-25T12:00:00Z'));
  });

  it('works for any zone', () => {
    expect(zonedMs('2026-11-07', '19:00', { timeZone: 'America/New_York' })).toBe(Date.parse('2026-11-08T00:00:00Z'));
  });

  it.each([
    ['no date', '', '19:00'],
    ['month 13', '2026-13-01', '19:00'],
    ['30 February', '2026-02-30', '12:00'],
    ['hour 25', '2026-11-07', '25:00'],
    ['minute 60', '2026-11-07', '19:60'],
    ['words', '2026-11-07', '7pm'],
  ])('is null for %s', (_label, date, hhmm) => {
    expect(zonedMs(date, hhmm, LONDON)).toBeNull();
  });
});

describe('dayChoices: today and the next days in the zone (countdown plan edge case 20)', () => {
  const LONDON = { timeZone: 'Europe/London' };

  it('lists today and the next n days', () => {
    expect(dayChoices(Date.parse('2026-11-07T12:00:00Z'), LONDON, 3)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it("rolls over at London's midnight, not UTC's", () => {
    // 23:30 UTC on Sat 10 Oct is 00:30 on Sunday in London (BST).
    expect(dayChoices(Date.parse('2026-10-10T23:30:00Z'), LONDON, 1)).toEqual(['2026-10-11', '2026-10-12']);
    // 23:30 UTC on Sat 7 Nov is still Saturday in London (GMT).
    expect(dayChoices(Date.parse('2026-11-07T23:30:00Z'), LONDON, 1)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('never lists a day twice across the 25-hour day when the clocks go back', () => {
    // 00:30 BST on Sun 25 Oct.
    expect(dayChoices(Date.parse('2026-10-24T23:30:00Z'), LONDON, 3)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
  });
});
