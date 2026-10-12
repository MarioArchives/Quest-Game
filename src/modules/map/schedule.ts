import type { ScheduleEvent } from '../../../functions/src/shared/types';

export type EventStatus = 'now' | 'soon' | 'later' | 'finished';
export type VenueStatus = 'now' | 'soon' | 'later' | 'none';

export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function startMs(event: ScheduleEvent): number {
  return Date.parse(event.start);
}

/** End time in ms; a missing (or unusable) end means start + 1 h. */
function endMs(event: ScheduleEvent): number {
  const start = startMs(event);
  const end = event.end ? Date.parse(event.end) : NaN;
  return Number.isNaN(end) || end <= start ? start + DEFAULT_DURATION_MS : end;
}

/** now: start <= now < end; soon: starts within 2 h; later: further out; finished: ended. Missing end = start + 1 h. */
export function eventStatus(event: ScheduleEvent, nowMs: number): EventStatus {
  const start = startMs(event);
  if (nowMs >= endMs(event)) return 'finished';
  if (nowMs >= start) return 'now';
  return start - nowMs <= SOON_WINDOW_MS ? 'soon' : 'later';
}

const VENUE_RANK: Record<Exclude<EventStatus, 'finished'>, number> = { now: 0, soon: 1, later: 2 };

/** Best status across a venue's events ('none' when nothing is left). */
export function venueStatus(events: readonly ScheduleEvent[], venueId: string, nowMs: number): VenueStatus {
  let best: VenueStatus = 'none';
  for (const event of events) {
    if (event.venueId !== venueId) continue;
    const status = eventStatus(event, nowMs);
    if (status === 'finished') continue;
    if (best === 'none' || VENUE_RANK[status] < VENUE_RANK[best]) best = status;
  }
  return best;
}

/** What is playing now at a venue and the next act after it. */
export function nowAndNext(
  events: readonly ScheduleEvent[],
  venueId: string,
  nowMs: number,
): { now: ScheduleEvent | null; next: ScheduleEvent | null } {
  const sorted = events
    .filter((event) => event.venueId === venueId)
    .sort((a, b) => startMs(a) - startMs(b));
  const now = sorted.find((event) => eventStatus(event, nowMs) === 'now') ?? null;
  const next = sorted.find((event) => startMs(event) > nowMs) ?? null;
  return { now, next };
}
