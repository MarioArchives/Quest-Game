// Helpers for QuerySpec.
import type { QuerySpec } from './types';

/** A stable key for a spec: the same query always gives the same key, whatever order its object keys or filters are in. */
export function querySpecKey(spec: QuerySpec): string {
  const where = (spec.where ?? []).map((filter) => JSON.stringify(filter)).sort();
  // JSON keeps value types apart (true vs "true"), and the fixed array layout makes object key order irrelevant.
  return JSON.stringify([spec.path, where, spec.orderBy ?? null, spec.limit ?? null]);
}
