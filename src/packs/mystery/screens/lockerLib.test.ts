import { describe, expect, it } from 'vitest';
import { lockerSummary, runningFor, tagNumber } from './lockerLib';

describe('tagNumber', () => {
  it('is stable and four digits', () => {
    expect(tagNumber('abc123')).toBe(tagNumber('abc123'));
    expect(tagNumber('abc123')).toMatch(/^\d{4}$/);
    expect(tagNumber('')).toBe('1000');
  });
});

describe('lockerSummary', () => {
  it('says nothing sealed for no rewards', () => expect(lockerSummary([])).toBe('Nothing sealed yet'));
  it('lists the non-zero parts', () => {
    expect(lockerSummary([{ status: 'framed' }, { status: 'framed' }, { status: 'cleaned' }])).toBe('2 frames and 1 destroyed exhibit');
    expect(lockerSummary([{ status: 'pending' }])).toBe('1 reward unused');
    expect(lockerSummary([{ status: 'framed' }, { status: 'cleaned' }, { status: 'pending' }, { status: 'void' }])).toBe(
      '1 frame, 1 destroyed exhibit and 1 reward unused',
    );
  });
});

describe('runningFor', () => {
  it('reads minutes under an hour, then hours and minutes', () => {
    expect(runningFor(0)).toBe('0m');
    expect(runningFor(45 * 60_000 + 59_000)).toBe('45m');
    expect(runningFor(2 * 3_600_000)).toBe('2h');
    expect(runningFor(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
  });
  it('never goes negative (a clock a little behind the server)', () => {
    expect(runningFor(-90_000)).toBe('0m');
  });
});
