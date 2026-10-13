import type { Doc, Stop } from '../../shared';
import { clockTime, dayAndTime, dayDate, type Zone } from '../../lib/time';

/** Epoch ms from a Stamp (or anything with toMillis); 0 when missing. */
function tsMs(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis();
  }
  return 0;
}

/** A stop with the numbers the map needs: its place on the route and its times in epoch ms. */
export interface RouteStop {
  id: string;
  /** 1..n among the stops this viewer sees, by `order`. */
  number: number;
  /** The stored route order (the GM's), which may have gaps. */
  order: number;
  name: string;
  lat: number;
  lng: number;
  /** False for a stop only the GM can see yet. */
  revealed: boolean;
  /** When the group arrives; null while the GM has not set it. */
  startMs: number | null;
  /** The explicit leave time, or null. */
  endMs: number | null;
  /** The bar's address, for directions; null for a bare pin. */
  address: string | null;
  /** The bar's own name, for Google Maps (the stop's name may be the GM's own); null for a bare pin. */
  placeName: string | null;
}

/**
 * Stops in route order (by `order`, then creation, then id), numbered from 1 among the ones this viewer sees.
 * Players pass `viewAll: false`, which also drops any unrevealed stop (the rules never send them anyway).
 * Skips stops with no usable place.
 */
export function orderStops(docs: Doc<Stop>[], viewAll = false): RouteStop[] {
  return docs
    .filter((d) => (viewAll || d.revealed === true) && Number.isFinite(d.lat) && Number.isFinite(d.lng))
    .map((d) => ({ d, order: Number.isFinite(d.order) ? d.order : Number.MAX_SAFE_INTEGER, createdMs: tsMs(d.createdAt) }))
    .sort((a, b) => a.order - b.order || a.createdMs - b.createdMs || a.d.id.localeCompare(b.d.id))
    .map(({ d }, i) => ({
      id: d.id,
      number: i + 1,
      order: Number.isFinite(d.order) ? d.order : 0,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      revealed: d.revealed === true,
      startMs: tsMs(d.startsAt) || null,
      endMs: tsMs(d.endsAt) || null,
      address: d.address ?? null,
      placeName: d.placeName ?? null,
    }));
}

/** When the group leaves: the stop's own leave time, else when the next revealed stop with a time starts, else never (null). */
export function leaveMs(stops: RouteStop[], index: number): number | null {
  const stop = stops[index];
  if (stop.endMs !== null) return stop.endMs;
  for (const next of stops.slice(index + 1)) if (next.revealed && next.startMs !== null) return next.startMs;
  return null;
}

export interface StopNowNext {
  /** The stop the group is at. */
  now: RouteStop | null;
  /** When the group leaves it; null if that is open ended or unknown. */
  nowUntilMs: number | null;
  /** The stop after it: the first revealed one yet to start, or (GM view) the first hidden one. */
  next: RouteStop | null;
}

/**
 * `stops` must be in route order (orderStops).
 * - If the last revealed stop has no time, the group is there (the GM revealed it, so they have moved on).
 * - Otherwise, "now" is the latest revealed stop that has started and not yet been left; between stops there is none.
 * - "Next" is the first revealed stop with a time still to come, or, for the GM (`viewAll`), the first hidden stop;
 *   both only count after the "now" stop in route order. Players never get a hidden stop.
 */
export function nowNext(stops: RouteStop[], nowMs: number, viewAll = false): StopNowNext {
  const lastRevealed = stops.reduce((last, s, i) => (s.revealed ? i : last), -1);
  let nowIndex = -1;
  let nowUntilMs: number | null = null;
  if (lastRevealed >= 0 && stops[lastRevealed].startMs === null) {
    nowIndex = lastRevealed;
  } else {
    // The latest stop that has started and not ended wins (ties: the later in route order).
    stops.forEach((stop, i) => {
      if (!stop.revealed || stop.startMs === null || stop.startMs > nowMs) return;
      const until = leaveMs(stops, i);
      if (until !== null && until <= nowMs) return;
      nowIndex = i;
      nowUntilMs = until;
    });
  }
  const next =
    stops.find((s, i) => i > nowIndex && (s.revealed ? s.startMs !== null && s.startMs > nowMs : viewAll)) ?? null;
  return { now: nowIndex >= 0 ? stops[nowIndex] : null, nowUntilMs, next };
}

/** How a stop looks on the map: where it sits relative to the group, or hidden (GM view only). */
export type RouteStopState = 'now' | 'next' | 'later' | 'past' | 'hidden';

/** Each stop's state given the now/next result. Hidden stops (GM view) are always 'hidden', whatever the clock says. */
export function stopStates(stops: RouteStop[], nn: StopNowNext, nowMs: number): Map<string, RouteStopState> {
  const nowIndex = nn.now ? stops.findIndex((s) => s.id === nn.now?.id) : -1;
  const lastRevealed = stops.reduce((last, s, i) => (s.revealed ? i : last), -1);
  const states = new Map<string, RouteStopState>();
  stops.forEach((s, i) => {
    let state: RouteStopState;
    if (!s.revealed) state = 'hidden';
    else if (s.id === nn.now?.id) state = 'now';
    else if (s.id === nn.next?.id) state = 'next';
    else if (i < nowIndex) state = 'past';
    // A timed stop is past once it has started; an untimed one once a later stop has been revealed.
    else state = (s.startMs !== null ? s.startMs <= nowMs : i < lastRevealed) ? 'past' : 'later';
    states.set(s.id, state);
  });
  return states;
}

/** The first stop in route order that is still hidden, or null. */
export function firstHidden(stops: RouteStop[]): RouteStop | null {
  return stops.find((s) => !s.revealed) ?? null;
}

/**
 * Moving a stop one place up or down: the `order` values to write (only the stops whose order changes),
 * renumbering the whole route to 1..n so gaps and ties are cleaned up. Empty when it cannot move.
 */
export function moveStop(stops: RouteStop[], id: string, direction: -1 | 1): Array<{ id: string; order: number }> {
  const from = stops.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= stops.length) return [];
  const ids = stops.map((s) => s.id);
  [ids[from], ids[to]] = [ids[to], ids[from]];
  const byId = new Map(stops.map((s) => [s.id, s]));
  return ids.flatMap((sid, i) => (byId.get(sid)?.order === i + 1 ? [] : [{ id: sid, order: i + 1 }]));
}

/** The order for a stop added at the end of the route (stored orders, so hidden ones count); capped at 999. */
export function nextOrder(stops: RouteStop[]): number {
  return Math.min(999, stops.reduce((max, s) => Math.max(max, s.order), 0) + 1);
}

/** `<input type="datetime-local">` value ("2026-10-10T20:30") for an instant, in the device's local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The instant for a datetime-local value, read as the device's local time; null when empty or invalid. */
export function fromLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const ms = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** "22:30" when it is today in the zone, else "Sat 22:30". */
export function whenLabel(ms: number, nowMs: number, zone: Zone): string {
  return dayDate(ms, zone) === dayDate(nowMs, zone) ? clockTime(ms, zone) : dayAndTime(ms, zone);
}
