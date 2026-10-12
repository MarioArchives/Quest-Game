import { useEffect, useMemo, useState } from 'react';
import { zone } from '../../pack';
import { clockTime, dayName as zoneDayName } from '../../lib/time';
import { eventStatus, nowAndNext, venueStatus, type VenueStatus } from './schedule';
import type { ScheduleEvent, Venue } from '../../shared';

const HOUR_MS = 60 * 60 * 1000;

let cached: Promise<ScheduleEvent[] | null> | null = null;

/** public/data/events.json, fetched once. null = it could not be loaded. */
function loadEvents(): Promise<ScheduleEvent[] | null> {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/events.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then((json) => (Array.isArray(json) ? (json as ScheduleEvent[]) : null))
    .catch(() => null);
  // Allow another try next time if it failed.
  cached.then((value) => {
    if (value === null) cached = null;
  });
  return cached;
}

export interface EventsState {
  status: 'loading' | 'ready' | 'error';
  events: ScheduleEvent[];
}

export function useEvents(): EventsState {
  const [state, setState] = useState<EventsState>({ status: 'loading', events: [] });
  useEffect(() => {
    let live = true;
    loadEvents().then((events) => {
      if (live) setState(events ? { status: 'ready', events } : { status: 'error', events: [] });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export const startMs = (event: ScheduleEvent): number => Date.parse(event.start);

/** End time in ms; a missing or unusable end means start + 1 h (same rule as src/lib/schedule.ts). */
export function endMs(event: ScheduleEvent): number {
  const start = startMs(event);
  const end = event.end ? Date.parse(event.end) : NaN;
  return Number.isNaN(end) || end <= start ? start + HOUR_MS : end;
}

/** "20:30" in the pack's time zone. */
export const clock = (ms: number): string => clockTime(ms, zone);
/** "Saturday" in the pack's time zone. */
export const dayName = (ms: number): string => zoneDayName(ms, zone);

export interface VenueSchedule {
  venue: Venue;
  status: VenueStatus;
  now: ScheduleEvent | null;
  next: ScheduleEvent | null;
  /** Everything not yet finished, soonest first. */
  upcoming: ScheduleEvent[];
}

/** Per-venue schedule at `nowMs`, in the same order as `venues`. */
export function useVenueSchedules(venues: Venue[], events: ScheduleEvent[], nowMs: number): VenueSchedule[] {
  const byVenue = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const event of events) {
      const list = map.get(event.venueId);
      if (list) list.push(event);
      else map.set(event.venueId, [event]);
    }
    for (const list of map.values()) list.sort((a, b) => startMs(a) - startMs(b));
    return map;
  }, [events]);

  return useMemo(
    () =>
      venues.map((venue) => {
        const list = byVenue.get(venue.id) ?? [];
        const { now, next } = nowAndNext(list, venue.id, nowMs);
        return {
          venue,
          status: venueStatus(list, venue.id, nowMs),
          now,
          next,
          upcoming: list.filter((event) => eventStatus(event, nowMs) !== 'finished'),
        };
      }),
    [venues, byVenue, nowMs],
  );
}
