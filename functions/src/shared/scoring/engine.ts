// The engine side of scoring: picking the rule set, resolving its params, checking and rounding what it
// returns, and planning the ledger entries (with the zero floor) before anything is written.
import type { GamePack } from '../packs/types.ts';
import type { LedgerReason, Settings } from '../types.ts';
import { getRules, RULESETS } from './index.ts';
import type { ScoreContext, ScoreEvent, ScoreLine, ScoringRules } from './types.ts';

/** The uids an event names; a rule set may only return lines for these. */
export function participants(event: ScoreEvent): string[] {
  switch (event.kind) {
    case 'questApproved':
      return event.approver === null ? [event.uid] : [event.uid, event.approver];
    case 'guessRight':
    case 'guessWrong':
      return [event.guesser, event.target];
    case 'rewardFrame':
      return [event.uid, event.target];
    default:
      return [event.uid];
  }
}

/** Rounds half away from zero (2.5 → 3, -2.5 → -3). Throws a RangeError on NaN or ±Infinity. */
export function roundPoints(n: number): number {
  if (!Number.isFinite(n)) throw new RangeError(`Points must be finite, got ${n}`);
  // Math.round sends .5 up; mirror it for negatives. `+ 0` turns -0 into 0.
  return (n < 0 ? -Math.round(-n) : Math.round(n)) + 0;
}

/**
 * The change that actually applies. The floor only ever stops a loss from taking a player below zero; it never
 * lifts an already-negative total or trims a gain.
 */
export function appliedDelta(current: number, delta: number, floorZero: boolean): number {
  // `+ 0` turns a stray -0 (from negating a zero setting) into 0.
  if (!floorZero || delta >= 0) return delta + 0;
  return Math.max(delta, Math.min(current, 0) - current) + 0;
}

/**
 * Runs the rule set and checks its answer: every amount must be finite (else an Error), every uid a participant
 * (else an Error), and transfer amounts not negative (else an Error). Amounts are rounded with roundPoints, and
 * lines that round to 0 are dropped.
 */
export function scoreEvent(rules: ScoringRules, event: ScoreEvent, ctx: ScoreContext): ScoreLine[] {
  const allowed = new Set(participants(event));
  const checkUid = (uid: string) => {
    if (!allowed.has(uid)) throw new Error(`Scoring rule set ${rules.id} returned a line for ${uid}, who is not in the event`);
  };
  const out: ScoreLine[] = [];
  for (const line of rules.score(event, ctx)) {
    if (line.kind === 'points') {
      if (!Number.isFinite(line.delta)) throw new Error(`Scoring rule set ${rules.id} returned a delta that is not finite`);
      checkUid(line.uid);
      const delta = roundPoints(line.delta);
      if (delta !== 0) out.push({ ...line, delta });
    } else {
      if (!Number.isFinite(line.amount)) throw new Error(`Scoring rule set ${rules.id} returned an amount that is not finite`);
      checkUid(line.from);
      checkUid(line.to);
      if (line.amount < 0) throw new Error(`Scoring rule set ${rules.id} returned a negative transfer`);
      const amount = roundPoints(line.amount);
      if (amount !== 0) out.push({ ...line, amount });
    }
  }
  return out;
}

/** One ledger entry to write: `requested` is what the line asked for, `delta` what the floor let through. */
export interface PlannedEntry {
  uid: string;
  reason: LedgerReason;
  requested: number;
  delta: number;
}

/**
 * Applies lines in order to a copy of `balances` (uid → points, players only). Lines for a uid with no balance
 * (not a player) are skipped; a transfer is skipped if either side is missing. A transfer's debit goes through
 * the floor and the receiver is credited exactly what was taken (`requested` is the nominal amount).
 */
export function planScore(
  lines: readonly ScoreLine[],
  balances: ReadonlyMap<string, number>,
  floorZero: boolean,
): { entries: PlannedEntry[]; balances: Map<string, number> } {
  const after = new Map(balances);
  const entries: PlannedEntry[] = [];
  for (const line of lines) {
    if (line.kind === 'points') {
      const current = after.get(line.uid);
      if (current === undefined || line.delta === 0) continue;
      const delta = appliedDelta(current, line.delta, floorZero);
      after.set(line.uid, current + delta);
      entries.push({ uid: line.uid, reason: line.reason, requested: line.delta, delta });
    } else {
      const from = after.get(line.from);
      const to = after.get(line.to);
      if (from === undefined || to === undefined || line.amount === 0) continue;
      const taken = -appliedDelta(from, -line.amount, floorZero) + 0;
      after.set(line.from, from - taken);
      after.set(line.to, to + taken);
      entries.push({ uid: line.from, reason: line.fromReason, requested: -line.amount, delta: -taken + 0 });
      entries.push({ uid: line.to, reason: line.toReason, requested: line.amount, delta: taken });
    }
  }
  return { entries, balances: after };
}

/** settings.scoring if it is a known rule set, else the pack's default, else classic. */
export function resolveRules(settings: Pick<Settings, 'scoring'>, pack: Pick<GamePack, 'scoring'>): ScoringRules {
  return getRules(settings.scoring) ?? getRules(pack.scoring) ?? RULESETS.classic!;
}

/** The rule set's params from `raw` (settings.scoringParams): defaults for missing or non-finite values, clamped to min/max. */
export function resolveParams(rules: ScoringRules, raw: unknown): Record<string, number> {
  const source = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const p of rules.params) {
    const v = source[p.key];
    out[p.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  }
  return out;
}

/** Every param default of the given rule sets, by key. */
export function paramDefaults(rules: readonly ScoringRules[]): Record<string, number> {
  return Object.fromEntries(rules.flatMap((r) => r.params.map((p) => [p.key, p.default])));
}
