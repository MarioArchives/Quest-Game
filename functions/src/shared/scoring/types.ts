// Scoring rule sets: pure functions from a game event to points changes. The engine (./engine.ts) checks and
// rounds what a rule set returns, and the functions apply it through the points ledger.
import type { TermForms } from '../packs/terms.ts';
import type { Features } from '../packs/types.ts';
import type { LedgerReason, Settings } from '../types.ts';

/** Something that can move points. Every uid named here is a "participant"; lines may only touch those. */
export type ScoreEvent =
  /** A witness (or GM) approved a personal claim. `questPoints` is the quest's own value, if it has one. */
  | { kind: 'questApproved'; uid: string; approver: string | null; questPoints: number | null }
  | { kind: 'claimRejected'; uid: string }
  /** The fine for a fraud override. Taking back the original award is engine logic, not scoring. */
  | { kind: 'fraudFine'; uid: string }
  | { kind: 'guessRight'; guesser: string; target: string }
  | { kind: 'guessWrong'; guesser: string; target: string }
  /** One winning entry of a side quest; `bonus` is the side quest's bonusPoints. */
  | { kind: 'sideQuestWon'; uid: string; bonus: number; votes: number }
  /** A player who could have entered a side quest and didn't, when its vote closes. */
  | { kind: 'sideQuestSkipped'; uid: string }
  /** Reward choice: the owner clears their name. */
  | { kind: 'rewardClean'; uid: string }
  /** Reward choice: the owner (`uid`) frames `target`. Only the target's points should change. */
  | { kind: 'rewardFrame'; uid: string; target: string };

export interface ScoreContext {
  settings: Settings;
  /** This rule set's params, already resolved (defaults filled, clamped). */
  params: Readonly<Record<string, number>>;
  now: Date;
  /** When the game started (game/state.startedAt), or null before it starts. */
  startedAt: Date | null;
}

/**
 * A points change. A transfer takes `amount` from one player and gives the receiver exactly what was taken,
 * so the zero floor (settings.pointsFloorZero) can shrink both sides but never creates points.
 */
export type ScoreLine =
  | { kind: 'points'; uid: string; delta: number; reason: LedgerReason }
  | { kind: 'transfer'; from: string; to: string; amount: number; fromReason: LedgerReason; toReason: LedgerReason };

/** A number a rule set needs beyond the shared settings, editable by the GM. Keys are unique across rule sets. */
export interface ParamSpec {
  key: string;
  label: string;
  hint: string;
  default: number;
  min: number;
  max: number;
}

export interface ScoringRules {
  id: string;
  /** Short name for the GM's picker. */
  name: string;
  /** One sentence on what is different about it. */
  summary: string;
  params: readonly ParamSpec[];
  score(event: ScoreEvent, ctx: ScoreContext): ScoreLine[];
  /** House-rules rows about points: [label, value]. Rows for features that are off are left out (default: all on). */
  describe(settings: Settings, params: Readonly<Record<string, number>>, t: TermForms, features?: Features): Array<[string, string]>;
}
