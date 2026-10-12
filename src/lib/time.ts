export const STALE_AFTER_MIN = 15;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** "just now" (< 1 min, or in the future), "N min ago", "N h ago". */
export function formatAgo(thenMs: number, nowMs: number): string {
  const diff = nowMs - thenMs;
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} min ago`;
  return `${Math.floor(diff / HOUR_MS)} h ago`;
}

/** Player markers hide once a position is this many minutes old (inclusive). */
export function isStale(updatedAtMs: number, nowMs: number, staleMin = STALE_AFTER_MIN): boolean {
  return nowMs - updatedAtMs >= staleMin * MINUTE_MS;
}

/** "mm:ss" until endsAt (rounded up to the second), "h:mm:ss" past an hour, "closed" at or after it. */
export function formatCountdown(endsAtMs: number, nowMs: number): string {
  const remaining = endsAtMs - nowMs;
  if (remaining <= 0) return 'closed';
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Where and how times are shown: the pack's IANA time zone and locale. */
export interface Zone {
  timeZone: string;
  locale: string;
}

const fmt = (zone: Zone, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(zone.locale, { ...opts, timeZone: zone.timeZone });

/** "20:30", 24-hour, in the zone. */
export function clockTime(ms: number, zone: Zone): string {
  return fmt(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

/** "Sat 20:30" in the zone. */
export function dayAndTime(ms: number, zone: Zone): string {
  return `${fmt(zone, { weekday: 'short' }).format(ms)} ${clockTime(ms, zone)}`;
}

/** "Thu 8 Oct" in the zone. */
export function dayDate(ms: number, zone: Zone): string {
  return fmt(zone, { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
}

/** "Saturday" in the zone. */
export function dayName(ms: number, zone: Zone): string {
  return fmt(zone, { weekday: 'long' }).format(ms);
}
