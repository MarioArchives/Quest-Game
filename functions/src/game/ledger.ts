// Points changes: every change to players/{uid}.points goes through here so the ledger stays complete.
import type { Transaction } from 'firebase-admin/firestore';
import type { LedgerReason, Settings } from '../shared/types.js';
import type { Db } from './context.js';
import { toTs } from './util.js';

export interface PointsChange {
  uid: string;
  /** The player's points as read in this transaction (thread the returned total through repeated changes). */
  current: number;
  delta: number;
  reason: LedgerReason;
  ref: string | null;
  /** GM uid, 'auto' or 'system'. */
  by: string;
  note?: string;
}

/**
 * The change that actually applies. The floor only ever stops a loss from taking a player below
 * zero; it never lifts an already-negative total or trims a gain.
 */
export function appliedDelta(current: number, delta: number, floorZero: boolean): number {
  // `+ 0` turns a stray -0 (from negating a zero setting) into 0.
  if (!floorZero || delta >= 0) return delta + 0;
  return Math.max(delta, Math.min(current, 0) - current) + 0;
}

/**
 * Updates the player's points (plus any `extra` player fields) and writes the ledger entry for the
 * applied change. A requested change of 0 writes no ledger entry. Returns the new total and the
 * change that was actually applied.
 */
export function applyPoints(
  tx: Transaction,
  db: Db,
  now: Date,
  settings: Pick<Settings, 'pointsFloorZero'>,
  change: PointsChange,
  extra: Record<string, unknown> = {},
): { total: number; applied: number } {
  const applied = appliedDelta(change.current, change.delta, settings.pointsFloorZero);
  const total = change.current + applied;
  if (applied !== 0 || Object.keys(extra).length > 0) {
    tx.update(db.doc(`players/${change.uid}`), { points: total, ...extra });
  }
  if (change.delta !== 0) {
    tx.create(db.collection('pointsLedger').doc(), {
      uid: change.uid,
      delta: applied,
      reason: change.reason,
      ref: change.ref,
      by: change.by,
      ...(change.note !== undefined ? { note: change.note } : {}),
      createdAt: toTs(now),
    });
  }
  return { total, applied };
}
