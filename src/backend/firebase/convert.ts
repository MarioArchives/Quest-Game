// What crosses the adapter: Firestore Timestamps become Stamps on the way out, SERVER_TIME becomes
// serverTimestamp() on the way in, and the SDK's errors become BackendErrors.
import { FirebaseError } from 'firebase/app';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { Stamp } from '../../../functions/src/shared/store/stamp.ts';
import { BackendError, type BackendErrorSource } from '../errors';
import { SERVER_TIME } from '../types';

function isPlain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Every Timestamp in delivered data as a Stamp, however deep. */
export function fromFirestore<T>(value: T): T {
  if (value instanceof Timestamp) return Stamp.fromMillis(value.toMillis()) as T;
  if (Array.isArray(value)) return value.map(fromFirestore) as T;
  if (isPlain(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = fromFirestore(item);
    return out as T;
  }
  return value;
}

/** Data about to be written: SERVER_TIME becomes serverTimestamp() and a Stamp becomes a Timestamp, however deep. */
export function toFirestore(value: unknown): unknown {
  if (value === SERVER_TIME) return serverTimestamp();
  if (value instanceof Stamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(toFirestore);
  if (isPlain(value)) {
    if (value.__serverTime === true) return serverTimestamp();
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = toFirestore(item);
    return out;
  }
  return value;
}

export function toFirestoreData(data: Record<string, unknown>): Record<string, unknown> {
  return toFirestore(data) as Record<string, unknown>;
}

/** The SDK's error as a BackendError from `source`; callable codes lose their "functions/" prefix. */
export function toBackendError(err: unknown, source: BackendErrorSource): BackendError {
  if (err instanceof BackendError) return err;
  if (err instanceof FirebaseError) {
    const details = (err as FirebaseError & { details?: unknown }).details;
    const code = source === 'call' ? err.code.replace(/^functions\//, '') : err.code.replace(/^firestore\//, '');
    return new BackendError(source, code, err.message, details);
  }
  const message = err instanceof Error ? err.message : '';
  return new BackendError(source, 'unknown', message || 'Something went wrong.');
}
