// Countdown plan edge cases 16–18: the countdown to the GM's start time, in parts, on the chip and by stage.
import { describe, expect, it } from 'vitest';
import { chipCountdown, countdownParts, countdownStage, spokenCountdown } from './countdown';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('chipCountdown', () => {
  it.each([
    ['9 days 4 h 12 min', 9 * DAY + 4 * HOUR + 12 * MIN, '9d 4h'],
    ['exactly a day', DAY, '1d 0h'],
    ['a second under a day', DAY - SEC, '23:59:59'],
    ['3 h 25 min 48 s', 3 * HOUR + 25 * MIN + 48 * SEC, '3:25:48'],
    ['exactly an hour', HOUR, '1:00:00'],
    ['59 min 59.2 s, rounded up', HOUR - 800, '1:00:00'],
    ['4 min 37 s', 4 * MIN + 37 * SEC, '04:37'],
    ['under a second', 400, '00:01'],
    ['zero', 0, '00:00'],
    ['past zero', -5 * SEC, '00:00'],
  ])('%s reads %s', (_label, ms, want) => {
    expect(chipCountdown(ms)).toBe(want);
  });
});

describe('countdownStage', () => {
  it.each([
    ['more than a day', DAY + 1, 'days'],
    ['exactly a day', DAY, 'today'],
    ['ten minutes and a bit', 10 * MIN + 1, 'today'],
    ['exactly ten minutes', 10 * MIN, 'final'],
    ['a second', SEC, 'final'],
    ['zero', 0, 'zero'],
    ['past zero', -1, 'zero'],
  ])('%s is %s', (_label, ms, want) => {
    expect(countdownStage(ms)).toBe(want);
  });
});

describe('countdownParts', () => {
  it('splits days, hours, minutes and seconds, rounding a part second up', () => {
    expect(countdownParts(9 * DAY + 4 * HOUR + 12 * MIN + 5.5 * SEC)).toEqual({ days: 9, hours: 4, minutes: 12, seconds: 6 });
    expect(countdownParts(4 * MIN + 37 * SEC)).toEqual({ days: 0, hours: 0, minutes: 4, seconds: 37 });
    expect(countdownParts(DAY - 1)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('is all zeros at and past zero', () => {
    const zero = { days: 0, hours: 0, minutes: 0, seconds: 0 };
    expect(countdownParts(0)).toEqual(zero);
    expect(countdownParts(-HOUR)).toEqual(zero);
  });
});

describe('spokenCountdown (the chip read aloud)', () => {
  it('says the two biggest units, singular when one', () => {
    expect(spokenCountdown(9 * DAY + 4 * HOUR + 12 * MIN)).toBe('9 days 4 hours');
    expect(spokenCountdown(DAY + HOUR)).toBe('1 day 1 hour');
    expect(spokenCountdown(3 * HOUR + 25 * MIN + 48 * SEC)).toBe('3 hours 25 minutes');
    expect(spokenCountdown(4 * MIN + 37 * SEC)).toBe('4 minutes 37 seconds');
    expect(spokenCountdown(0)).toBe('0 minutes 0 seconds');
  });
});
