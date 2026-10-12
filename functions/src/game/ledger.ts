// Points changes: every change to players/{uid}.points goes through here so the ledger stays complete.
import type { Txn } from '../shared/store/types.js';
import type { GamePack } from '../shared/packs/types.js';
import { appliedDelta, planScore, resolveParams, resolveRules, scoreEvent } from '../shared/scoring/engine.js';
import type { ScoreContext, ScoreEvent, ScoringRules } from '../shared/scoring/types.js';
import type { GameState, LedgerReason, Settings } from '../shared/types.js';
import type { Db } from './context.js';
import { millis, toTs } from './util.js';

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

export { appliedDelta };

/**
 * Updates the player's points (plus any `extra` player fields) and writes the ledger entry for the
 * applied change. A requested change of 0 writes no ledger entry. Returns the new total and the
 * change that was actually applied.
 */
export function applyPoints(
  tx: Txn,
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

/** The rule set in force and what it needs to score, resolved once per transaction. */
export interface Scoring {
  rules: ScoringRules;
  sctx: ScoreContext;
}

/** settings.scoring (falling back to the pack's default), its params, and the game's start time. */
export function scoringFor(pack: GamePack, settings: Settings, state: Pick<GameState, 'startedAt'>, now: Date): Scoring {
  const rules = resolveRules(settings, pack);
  const startMs = state.startedAt ? millis(state.startedAt) : Number.NaN;
  const startedAt = Number.isFinite(startMs) ? new Date(startMs) : null;
  return { rules, sctx: { settings, params: resolveParams(rules, settings.scoringParams), now, startedAt } };
}

/**
 * Scores a game event with the rule set and writes the result: each player's new points (plus any `extra`
 * fields for them) and one ledger entry per planned entry, with the zero floor applied and transfers crediting
 * only what was taken. `balances` holds the points, as read in this transaction, of every player the event names
 * who has a player doc; anyone missing (a GM who isn't playing) gets nothing. Throws before writing anything if
 * the rule set returns something invalid, so the whole transaction fails. Returns each player's applied change
 * (0 for players with only `extra`) and new totals.
 */
export function applyScore(
  tx: Txn,
  db: Db,
  now: Date,
  scoring: Scoring,
  event: ScoreEvent,
  balances: ReadonlyMap<string, number>,
  meta: { ref: string | null; by: string; note?: string },
  extra: Record<string, Record<string, unknown>> = {},
): { applied: Map<string, number>; totals: Map<string, number> } {
  const lines = scoreEvent(scoring.rules, event, scoring.sctx);
  const plan = planScore(lines, balances, scoring.sctx.settings.pointsFloorZero);
  const applied = new Map<string, number>();
  for (const entry of plan.entries) applied.set(entry.uid, (applied.get(entry.uid) ?? 0) + entry.delta);
  for (const uid of Object.keys(extra)) if (balances.has(uid) && !applied.has(uid)) applied.set(uid, 0);

  for (const [uid, delta] of applied) {
    const fields = extra[uid] ?? {};
    if (delta !== 0 || Object.keys(fields).length > 0) {
      tx.update(db.doc(`players/${uid}`), { points: plan.balances.get(uid)!, ...fields });
    }
  }
  for (const entry of plan.entries) {
    tx.create(db.collection('pointsLedger').doc(), {
      uid: entry.uid,
      delta: entry.delta,
      reason: entry.reason,
      ref: meta.ref,
      by: meta.by,
      ...(meta.note !== undefined ? { note: meta.note } : {}),
      createdAt: toTs(now),
    });
  }
  return { applied, totals: plan.balances };
}
