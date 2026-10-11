// The leaderboard as Home and Standings draw it: the podium (the top three by position, laid out 2nd-1st-3rd) and
// the wristbands for everyone after them, plus the words each player's button reads out.

/** What the ranks need from a player (a RankedPlayer has all of it). */
export interface RankedEntry {
  id: string;
  displayName: string;
  points: number;
  /** Competition rank: ties share one (1, 1, 3). */
  rank: number;
  left?: 'frozen' | 'out' | null;
}

export interface PodiumSpot<T> {
  player: T;
  /** Grid column: 1 = left (2nd), 2 = centre (1st), 3 = right (3rd). */
  column: 1 | 2 | 3;
  /** Block height step, from the real rank: tied players stand on equal blocks. */
  step: 1 | 2 | 3;
}

const COLUMNS = [2, 1, 3] as const;

/**
 * The top three by position go on the podium (in rank order, so screen readers hear 1st first; the grid column
 * puts them 2-1-3), everyone else on the wristbands. The list must already be sorted, as useGame().players is.
 */
export function splitStandings<T extends RankedEntry>(players: readonly T[]): { podium: PodiumSpot<T>[]; rest: T[] } {
  const podium = players.slice(0, 3).map((player, i) => ({
    player,
    column: COLUMNS[i]!,
    step: Math.min(Math.max(player.rank, 1), 3) as 1 | 2 | 3,
  }));
  return { podium, rest: players.slice(3) };
}

/** Ranks two or more players share. */
export function tiedRanks(players: readonly RankedEntry[]): Set<number> {
  const seen = new Set<number>();
  const tied = new Set<number>();
  for (const p of players) {
    if (seen.has(p.rank)) tied.add(p.rank);
    seen.add(p.rank);
  }
  return tied;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 101st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** The first word of a name (what fits on a ticket), or the whole name if it has no words. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Points as printed: a real minus sign for a negative score. */
export function formatPoints(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : String(points);
}

/** "2nd, Priya, 380 points. Open record", "Joint 1st, you (Jess Smith), …", "8th, Mo, has left the game, …". */
export function playerLabel(p: RankedEntry, opts: { you?: boolean; tied?: boolean } = {}): string {
  const place = `${opts.tied ? 'Joint ' : ''}${ordinal(p.rank)}`;
  const who = opts.you ? `you (${p.displayName})` : p.displayName;
  const pts = `${p.points} ${Math.abs(p.points) === 1 ? 'point' : 'points'}`;
  const score = p.left ? `has left the game, score frozen at ${pts}` : pts;
  return `${place}, ${who}, ${score}. Open ${opts.you ? 'your ' : ''}record`;
}
