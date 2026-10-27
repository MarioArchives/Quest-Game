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

/** The zone's offset from UTC at an instant, in ms (what the wall clock shows minus the instant). */
function offsetAt(ms: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(ms)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  return Date.UTC(p.year!, p.month! - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock 'YYYY-MM-DD' and 'HH:MM' in the zone as an instant; null if either is not a real date or time. */
export function zonedMs(date: string, hhmm: string, zone: Pick<Zone, 'timeZone'>): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [number, number, number, number, number];
  if (h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, da, h, mi);
  const back = new Date(asUtc);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  // Settle on the offset that holds at the answer (two passes cover a clock change nearby).
  let guess = asUtc - offsetAt(asUtc, zone.timeZone);
  guess = asUtc - offsetAt(guess, zone.timeZone);
  return guess;
}

/** Today and the next n dates ('YYYY-MM-DD') in the zone, each once (a 25-hour day is still one day). */
export function dayChoices(nowMs: number, zone: Pick<Zone, 'timeZone'>, n: number): string[] {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowMs);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
