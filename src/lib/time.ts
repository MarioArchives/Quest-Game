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
