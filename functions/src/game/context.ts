import type { Store } from '../shared/store/types.js';
import type { GamePack } from '../shared/packs/types.js';

export type Db = Store;

/**
 * Who is calling, when, and for which game. Game logic never reads the wall clock, Math.random or
 * process.env directly, so tests can pin time, randomness and the pack.
 */
export interface Ctx {
  /** Verified caller uid, or null when signed out. */
  uid: string | null;
  email?: string | null;
  now: Date;
  /** Returns a float in [0, 1). Defaults to Math.random. */
  rng?: () => number;
  /** The game pack this deployment runs (its words, features, time zone and default scoring). */
  pack: GamePack;
}
