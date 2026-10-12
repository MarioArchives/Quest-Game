// Turns the engine's Stamp times into Firestore Timestamps, deep, so demo data (plain data with Stamps) can be
// written with the Admin SDK. (functions/src/firebase/store.ts does the same but can't be run directly by Node.)
import { Timestamp } from 'firebase-admin/firestore';
import { Stamp } from '../../functions/src/shared/store/stamp.ts';

export function toFirestore(value) {
  if (value instanceof Stamp) return Timestamp.fromMillis(value.toMillis());
  if (Array.isArray(value)) return value.map(toFirestore);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestore(v)]));
  }
  return value;
}
