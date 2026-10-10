import { useEffect, useMemo, useState } from 'react';
import { eventStatus, nowAndNext, venueStatus, type VenueStatus } from '../../lib/schedule';
import type { FestivalEvent, Venue } from '../../shared';

/** Festival weekend starts Thursday 8 October; anything earlier is a pre-festival talk. */
const FESTIVAL_START_MS = Date.parse('2026-10-08T00:00:00+01:00');
const HOUR_MS = 60 * 60 * 1000;

let cached: Promise<FestivalEvent[] | null> | null = null;

/** public/data/events.json, fetched once. null = it could not be loaded. */
function loadEvents(): Promise<FestivalEvent[] | null> {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/events.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then((json) =>
      Array.isArray(json)
        ? (json as FestivalEvent[]).filter((event) => Date.parse(event.start) >= FESTIVAL_START_MS)
        : null,
    )
    .catch(() => null);
  // Allow another try next time if it failed.
  cached.then((value) => {
    if (value === null) cached = null;
  });
  return cached;
}

export interface EventsState {
  status: 'loading' | 'ready' | 'error';
  events: FestivalEvent[];
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

export const startMs = (event: FestivalEvent): number => Date.parse(event.start);

/** End time in ms; a missing or unusable end means start + 1 h (same rule as src/lib/schedule.ts). */
export function endMs(event: FestivalEvent): number {
  const start = startMs(event);
  const end = event.end ? Date.parse(event.end) : NaN;
  return Number.isNaN(end) || end <= start ? start + HOUR_MS : end;
}

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/London',
});
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' });

/** "20:30" in festival (Europe/London) time. */
export const clock = (ms: number): string => CLOCK.format(ms);
/** "Saturday" in festival time. */
export const dayName = (ms: number): string => DAY.format(ms);

export interface VenueSchedule {
  venue: Venue;
  status: VenueStatus;
  now: FestivalEvent | null;
  next: FestivalEvent | null;
  /** Everything not yet finished, soonest first. */
  upcoming: FestivalEvent[];
}

/** Per-venue schedule at `nowMs`, in the same order as `venues`. */
export function useVenueSchedules(venues: Venue[], events: FestivalEvent[], nowMs: number): VenueSchedule[] {
  const byVenue = useMemo(() => {
    const map = new Map<string, FestivalEvent[]>();
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
