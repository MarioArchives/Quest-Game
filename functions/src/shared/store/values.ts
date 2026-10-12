// Value handling for the in-memory store: validating and copying what is written, and Firestore's ordering.
import { StoreError } from './errors.ts';
import { Stamp } from './stamp.ts';
import type { DocData } from './types.ts';

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A validated deep copy for storing: Dates become Stamps, undefined and foreign class instances are refused. */
export function toStored(value: unknown, where = 'value'): unknown {
  if (value === undefined) throw new StoreError('invalid-argument', `Cannot store undefined (at ${where}).`);
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return value;
  if (value instanceof Stamp) return value;
  if (value instanceof Date) return Stamp.fromDate(value);
  if (Array.isArray(value)) return value.map((item, i) => toStored(item, `${where}[${i}]`));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toStored(item, `${where}.${key}`)]));
  }
  throw new StoreError('invalid-argument', `Cannot store a ${typeof value} value (at ${where}).`);
}

/** A validated document body. */
export function toStoredDoc(data: unknown): DocData {
  if (!isPlainObject(data)) throw new StoreError('invalid-argument', 'Document data must be a plain object.');
  return toStored(data, 'data') as DocData;
}

/** A deep copy of an already-stored value (Stamps are immutable, so they are shared). */
export function cloneStored<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneStored) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneStored(item)])) as T;
  }
  return value;
}

/** Deep-merges maps; arrays, Stamps and scalars in `incoming` replace what is there. */
export function mergeDocs(base: DocData, incoming: DocData): DocData {
  const out: DocData = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? mergeDocs(current, value) : value;
  }
  return out;
}

/** A top-level field, or a dotted path into maps. */
export function getField(data: DocData, field: string): unknown {
  if (Object.hasOwn(data, field)) return data[field];
  if (!field.includes('.')) return undefined;
  let current: unknown = data;
  for (const part of field.split('.')) {
    if (!isPlainObject(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/** Firestore's type order: null < booleans < numbers < timestamps < strings < arrays < maps. */
function typeRank(value: unknown): number {
  if (value === null) return 0;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 2;
  if (value instanceof Stamp) return 3;
  if (typeof value === 'string') return 4;
  if (Array.isArray(value)) return 5;
  return 6;
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

function compareNumbers(a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : -1) : 1;
  return sign(a - b);
}

/** Total order over stored values; 0 means equal (same type and value). */
export function compareValues(a: unknown, b: unknown): number {
  const rank = typeRank(a) - typeRank(b);
  if (rank !== 0) return sign(rank);
  if (typeof a === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'number') return compareNumbers(a, b as number);
  if (a instanceof Stamp) return sign(a.toMillis() - (b as Stamp).toMillis());
  if (typeof a === 'string') return a < (b as string) ? -1 : a > (b as string) ? 1 : 0;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    for (let i = 0; i < Math.min(a.length, other.length); i++) {
      const c = compareValues(a[i], other[i]);
      if (c !== 0) return c;
    }
    return sign(a.length - other.length);
  }
  if (isPlainObject(a)) {
    const left = Object.entries(a).sort(([x], [y]) => compareValues(x, y));
    const right = Object.entries(b as PlainObject).sort(([x], [y]) => compareValues(x, y));
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const c = compareValues(left[i]![0], right[i]![0]) || compareValues(left[i]![1], right[i]![1]);
      if (c !== 0) return c;
    }
    return sign(left.length - right.length);
  }
  return 0;
}

export const valuesEqual = (a: unknown, b: unknown): boolean => compareValues(a, b) === 0;

/** Orders paths segment by segment, so "a/b" sorts before "a-c/d" like Firestore document names. */
export function comparePaths(a: string, b: string): number {
  const left = a.split('/');
  const right = b.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const c = compareValues(left[i], right[i]);
    if (c !== 0) return c;
  }
  return sign(left.length - right.length);
}
