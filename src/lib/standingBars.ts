// Standings as bars from zero: positive scores on one side, negative ones on the other.
import type { Doc, Player } from '../shared';

export interface StandingBar {
  uid: string;
  name: string;
  photoURL: string | null;
  points: number;
  /** 'plus' for 0 and above, 'minus' below 0. */
  side: 'plus' | 'minus';
  /** Bar width in px: max(minWidth, |points| / largest |points| × maxWidth). */
  width: number;
  /** "+420", "−25" (a real minus sign) or "0". */
  label: string;
  me: boolean;
}

/** One bar per player still on the leaderboard (not kicked out), highest score first, ties by name. */
export function standingBars(
  players: ReadonlyArray<Doc<Player>>,
  meUid: string | null,
  opts: { minWidth?: number; maxWidth?: number } = {},
): StandingBar[] {
  const { minWidth = 56, maxWidth = 140 } = opts;
  const shown = players
    .filter((p) => p.left !== 'out')
    .map((p) => ({ p, points: p.points ?? 0 }))
    .sort((a, b) => b.points - a.points || a.p.displayName.localeCompare(b.p.displayName));
  const largest = Math.max(0, ...shown.map((s) => Math.abs(s.points)));
  return shown.map(({ p, points }) => ({
    uid: p.id,
    name: p.displayName,
    photoURL: p.photoURL ?? null,
    points,
    side: points < 0 ? 'minus' : 'plus',
    width: largest === 0 ? minWidth : Math.round(Math.max(minWidth, (Math.abs(points) / largest) * maxWidth)),
    label: points > 0 ? `+${points}` : points < 0 ? `\u2212${Math.abs(points)}` : '0',
    me: p.id === meUid,
  }));
}
