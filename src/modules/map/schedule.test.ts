// Edge case 42: venue status, now/next, and Europe/London offsets.
import { describe, expect, it } from 'vitest';
import type { ScheduleEvent } from '../../../functions/src/shared/types';
import { eventStatus, nowAndNext, venueStatus } from './schedule';

const ev = (id: string, venueId: string, start: string, end: string | null): ScheduleEvent => ({
  id, act: `Act ${id}`, venueId, stage: null, day: 'Saturday', start, end, genre: null, type: 'Performance', description: null,
});

const at = (iso: string) => Date.parse(iso);

// 19:00–20:00 BST on Saturday = 18:00–19:00 UTC.
const gig = ev('e1', 'v1', '2026-10-10T19:00:00+01:00', '2026-10-10T20:00:00+01:00');

describe('eventStatus', () => {
  it.each([
    ['during the set', '2026-10-10T19:30:00+01:00', 'now'],
    ['at the exact start', '2026-10-10T19:00:00+01:00', 'now'],
    ['at the exact end', '2026-10-10T20:00:00+01:00', 'finished'],
    ['90 min before', '2026-10-10T17:30:00+01:00', 'soon'],
    ['exactly 2 h before', '2026-10-10T17:00:00+01:00', 'soon'],
    ['just over 2 h before', '2026-10-10T16:59:00+01:00', 'later'],
  ] as const)('%s → %s', (_label, now, status) => {
    expect(eventStatus(gig, at(now))).toBe(status);
  });

  it('parses the London offset: 18:30 UTC is during a 19:00 BST start', () => {
    expect(eventStatus(gig, at('2026-10-10T18:30:00Z'))).toBe('now');
    expect(eventStatus(gig, at('2026-10-10T17:59:00Z'))).toBe('soon');
  });

  it('handles GMT (+00:00) dates after the clocks change', () => {
    const late = ev('e2', 'v1', '2026-10-26T19:00:00+00:00', '2026-10-26T20:00:00+00:00');
    expect(eventStatus(late, at('2026-10-26T19:30:00Z'))).toBe('now');
  });

  it('counts a set that crosses midnight as now after midnight', () => {
    const lateSet = ev('e3', 'v1', '2026-10-10T23:30:00+01:00', '2026-10-11T01:00:00+01:00');
    expect(eventStatus(lateSet, at('2026-10-11T00:30:00+01:00'))).toBe('now');
  });

  it('assumes one hour when the end time is missing', () => {
    const open = ev('e4', 'v1', '2026-10-10T19:00:00+01:00', null);
    expect(eventStatus(open, at('2026-10-10T19:59:00+01:00'))).toBe('now');
    expect(eventStatus(open, at('2026-10-10T20:00:00+01:00'))).toBe('finished');
  });
});

const events = [
  ev('a', 'v1', '2026-10-10T21:00:00+01:00', '2026-10-10T22:00:00+01:00'),
  ev('b', 'v1', '2026-10-10T19:00:00+01:00', '2026-10-10T20:00:00+01:00'),
  ev('c', 'v1', '2026-10-10T15:00:00+01:00', '2026-10-10T16:00:00+01:00'),
  ev('d', 'v2', '2026-10-10T19:15:00+01:00', '2026-10-10T19:45:00+01:00'),
];

describe('venueStatus', () => {
  it('is now when something is playing, ignoring other venues', () => {
    expect(venueStatus(events, 'v1', at('2026-10-10T19:30:00+01:00'))).toBe('now');
  });

  it('is soon / later based on the next set when nothing is playing', () => {
    expect(venueStatus(events, 'v1', at('2026-10-10T20:15:00+01:00'))).toBe('soon');
    expect(venueStatus(events, 'v1', at('2026-10-10T16:30:00+01:00'))).toBe('later');
  });

  it("is none when the venue's sets are all finished or it has none", () => {
    expect(venueStatus(events, 'v1', at('2026-10-10T22:30:00+01:00'))).toBe('none');
    expect(venueStatus(events, 'v9', at('2026-10-10T19:30:00+01:00'))).toBe('none');
  });
});

describe('nowAndNext', () => {
  it('returns the current set and the next one by start time, whatever the input order', () => {
    const res = nowAndNext(events, 'v1', at('2026-10-10T19:30:00+01:00'));
    expect(res.now?.id).toBe('b');
    expect(res.next?.id).toBe('a');
  });

  it('returns only the next set between sets, and nothing once the day is done', () => {
    expect(nowAndNext(events, 'v1', at('2026-10-10T17:00:00+01:00'))).toEqual({ now: null, next: expect.objectContaining({ id: 'b' }) });
    expect(nowAndNext(events, 'v1', at('2026-10-10T23:00:00+01:00'))).toEqual({ now: null, next: null });
  });
});
