// A player's public record for the player view, worked out from their points ledger and approved submissions.
// Never from players/{uid}/quests: a player's hand is secret.
import type { LedgerEntry, LedgerReason, Submission } from '../shared';

export interface PlayerRecord {
  /** Quests their witness approved (player.questsCompleted, which a fraud override takes back). */
  completed: number;
  /** Quests that went wrong, by how. */
  failed: { total: number; exposed: number; rejected: number; fraud: number };
  sideQuests: { entered: number; won: number };
  guesses: { made: number; right: number; wrong: number };
}

type LedgerLine = Pick<LedgerEntry, 'uid' | 'reason'>;
type Entry = Pick<Submission, 'uid' | 'kind'>;

/**
 * Counts for one player. Failures, wins and guesses are counted from ledger lines, and a points change of 0 writes no
 * line: with a fine set to 0 (rejectPenalty, exposePenalty, fraudPenalty, wrongGuessCost) such a failure or guess
 * isn't counted, and neither is a reward set to 0. 'fraud' also covers a disqualified side-quest entry.
 * Side quests entered = their side-quest entries still approved (revealed for the vote and not thrown out).
 */
export function playerRecord(
  uid: string,
  ledger: readonly LedgerLine[],
  approved: readonly Entry[],
  questsCompleted?: number | null,
): PlayerRecord {
  const counts = new Map<LedgerReason, number>();
  for (const line of ledger) {
    if (line.uid === uid) counts.set(line.reason, (counts.get(line.reason) ?? 0) + 1);
  }
  const n = (reason: LedgerReason) => counts.get(reason) ?? 0;
  const exposed = n('exposed');
  const rejected = n('rejected');
  const fraud = n('fraud');
  const right = n('guess-correct');
  const wrong = n('guess-wrong');
  return {
    completed: Math.max(0, questsCompleted ?? 0),
    failed: { total: exposed + rejected + fraud, exposed, rejected, fraud },
    sideQuests: { entered: approved.filter((s) => s.uid === uid && s.kind === 'global').length, won: n('global-win') },
    guesses: { made: right + wrong, right, wrong },
  };
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "102nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

interface Standing {
  id: string;
  displayName: string;
  points?: number | null;
}

/**
 * One line on where a player stands on the leaderboard (best first): "35 behind Robin" (the nearest player with more
 * points), "40 ahead of Sam" for a clear leader, "Level with Sam" for a shared lead. Null when they aren't on it or
 * play alone.
 */
export function standingGap(board: readonly Standing[], uid: string): string | null {
  const me = board.find((p) => p.id === uid);
  if (!me) return null;
  const mine = me.points ?? 0;
  const above = board.filter((p) => (p.points ?? 0) > mine);
  if (above.length > 0) {
    const nearest = above.reduce((a, b) => ((b.points ?? 0) < (a.points ?? 0) ? b : a));
    return `${(nearest.points ?? 0) - mine} behind ${nearest.displayName}`;
  }
  const level = board.filter((p) => p.id !== uid && (p.points ?? 0) === mine);
  if (level.length > 0) return `Level with ${level[0].displayName}${level.length > 1 ? ` and ${level.length - 1} more` : ''}`;
  const below = board.filter((p) => p.id !== uid);
  if (below.length === 0) return null;
  const next = below.reduce((a, b) => ((b.points ?? 0) > (a.points ?? 0) ? b : a));
  return `${mine - (next.points ?? 0)} ahead of ${next.displayName}`;
}
