import type { Firestore } from 'firebase-admin/firestore';

export type Db = Firestore;

/**
 * Who is calling and when. Game logic never reads the wall clock or Math.random
 * directly, so tests can pin time and randomness.
 */
export interface Ctx {
  /** Verified caller uid, or null when signed out. */
  uid: string | null;
  email?: string | null;
  now: Date;
  /** Returns a float in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}
