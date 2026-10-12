// Small helpers shared by the game logic modules.
import { Stamp } from '../shared/store/stamp.js';
import type { Settings, TS } from '../shared/types.js';
import { fail } from './guards.js';

export const MIN_MS = 60_000;

export const toTs = (d: Date): Stamp => Stamp.fromDate(d);

/** Epoch ms of a Stamp (or Date); NaN for anything else. */
export function millis(value: TS): number {
  if (value instanceof Stamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.NaN;
}

/** True when the value can be used as a single Firestore document id. */
export function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value)
  );
}

/** Validates an id argument from the client. */
export function asId(value: unknown, field: string): string {
  if (!isId(value)) fail('invalid-argument', `${field} must be a valid id.`);
  return value;
}

/** When the next timer-driven global quest should open: a random whole number of minutes in [min, max]. */
export function nextGlobalTime(now: Date, settings: Settings, rng: () => number): Date {
  const lo = Math.max(0, Math.floor(settings.globalIntervalMin));
  const hi = Math.max(lo, Math.floor(settings.globalIntervalMax));
  const minutes = lo + Math.floor(rng() * (hi - lo + 1));
  return new Date(now.getTime() + minutes * MIN_MS);
}
