// Data-layer plan edge case 19: a live query is plain data with a stable key, so hooks re-subscribe only when
// the query really changes.
import { describe, expect, it } from 'vitest';
import { querySpecKey } from './query';
import type { QuerySpec } from './types';

describe('querySpecKey', () => {
  it('is the same for the same query, whatever order the object keys are in', () => {
    const a: QuerySpec = { path: 'submissions', where: [['status', '==', 'pending']], orderBy: ['createdAt', 'desc'], limit: 50 };
    const b = { limit: 50, orderBy: ['createdAt', 'desc'], where: [['status', '==', 'pending']], path: 'submissions' } as QuerySpec;
    expect(querySpecKey(a)).toBe(querySpecKey(b));
  });

  it('differs when the path, a filter, the order or the limit differs', () => {
    const base: QuerySpec = { path: 'submissions', where: [['uid', '==', 'a']], orderBy: ['createdAt', 'desc'], limit: 10 };
    const keys = [
      base,
      { ...base, path: 'feed' },
      { ...base, where: [['uid', '==', 'b']] },
      { ...base, where: [['witnessUid', '==', 'a']] },
      { ...base, where: [['uid', '==', 'a'], ['status', '==', 'pending']] },
      { ...base, orderBy: ['createdAt', 'asc'] },
      { ...base, orderBy: ['startsAt', 'desc'] },
      { ...base, limit: 11 },
      { path: 'submissions' },
    ].map((spec) => querySpecKey(spec as QuerySpec));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tells values of different types apart', () => {
    const one = querySpecKey({ path: 't', where: [['active', '==', true]] });
    const other = querySpecKey({ path: 't', where: [['active', '==', 'true']] });
    expect(one).not.toBe(other);
  });

  it('keeps filter order significant only as far as results go: the same filters in another order give the same key', () => {
    const a = querySpecKey({ path: 't', where: [['a', '==', 1], ['b', '==', 2]] });
    const b = querySpecKey({ path: 't', where: [['b', '==', 2], ['a', '==', 1]] });
    expect(a).toBe(b);
  });
});
