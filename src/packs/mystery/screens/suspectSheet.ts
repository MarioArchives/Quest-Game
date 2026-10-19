// The suspect sheet the reward's Frame step draws: everyone on the standings, each suspect's score now and after a
// frame, and a stamp where the frame would cross a line. Worked out from the live points, the frame's size and the
// GM's two lines, so it stays right when the GM moves them.
import { appliedDelta } from '../../../../functions/src/shared/scoring/engine.ts';
import { standingOf, type StandingSettings } from '../../../../functions/src/shared/standing.ts';
import { signed, standingScale } from '../../../lib/standingBars';
import type { Doc, Player, PlayerStanding, Settings } from '../../../shared';

export type SheetSettings = StandingSettings & Pick<Settings, 'framePoints' | 'pointsFloorZero'>;

/** What a frame would change for a suspect, most telling first (see stampFor). */
export type SheetStamp = 'loses-confidant' | 'onto-watch-list' | 'drops-below-you' | 'under-suspicion' | 'already-watched';

export interface SheetRow {
  uid: string;
  name: string;
  photoURL: string | null;
  points: number;
  /** Their score if framed (the zero floor applied); null on your own row. */
  after: number | null;
  /** Their standing now. */
  standing: PlayerStanding | null;
  stamp: SheetStamp | null;
  me: boolean;
}

/** A score after a frame: `framePoints` off, as the game applies it (never below zero with the zero floor on). */
export function frameAfter(points: number, settings: SheetSettings): number {
  return points + appliedDelta(points, -settings.framePoints, settings.pointsFloorZero);
}

/**
 * The stamp for a suspect going from `points` to `after`, beside you on `mine` (null if you aren't on the sheet):
 * crossing a standing line first, then passing you, then dropping under zero; a person of interest already watched
 * otherwise. Null when the frame changes nothing worth a stamp.
 */
export function stampFor(points: number, after: number, mine: number | null, settings: StandingSettings): SheetStamp | null {
  const now = standingOf(points, settings);
  const then = standingOf(after, settings);
  if (now === 'confidant' && then !== 'confidant') return 'loses-confidant';
  if (now !== 'poi' && then === 'poi') return 'onto-watch-list';
  if (mine != null && points > mine && after < mine) return 'drops-below-you';
  if (points >= 0 && after < 0) return 'under-suspicion';
  if (now === 'poi') return 'already-watched';
  return null;
}

/**
 * The sheet's rows: everyone still playing (players who left aren't shown), you included, highest score first, ties
 * by name. `framed` shows a frame already sent: that suspect at their new score (until the live points catch up).
 */
export function suspectSheet(
  players: ReadonlyArray<Doc<Player>>,
  meUid: string,
  settings: SheetSettings,
  framed?: { uid: string; after: number } | null,
): SheetRow[] {
  const live = players.filter((p) => !p.left);
  const scoreOf = (p: Doc<Player>) => (framed && p.id === framed.uid ? framed.after : (p.points ?? 0));
  const mine = live.find((p) => p.id === meUid);
  const myPoints = mine ? scoreOf(mine) : null;
  return live
    .map((p) => ({ p, points: scoreOf(p) }))
    .sort((a, b) => b.points - a.points || a.p.displayName.localeCompare(b.p.displayName))
    .map(({ p, points }) => {
      const me = p.id === meUid;
      const after = me ? null : frameAfter(points, settings);
      return {
        uid: p.id,
        name: p.displayName,
        photoURL: p.photoURL ?? null,
        points,
        after,
        standing: standingOf(points, settings),
        stamp: after == null ? null : stampFor(points, after, myPoints, settings),
        me,
      };
    });
}

/** The half-width of every row's track, in points: the Board's scale, wide enough for every score, after and line. */
export function sheetEdge(rows: readonly SheetRow[], settings: StandingSettings): number {
  const points = rows.flatMap((r) => (r.after == null ? [r.points] : [r.points, r.after]));
  for (const line of [settings.confidantAbove, settings.poiBelow]) if (line != null) points.push(line);
  return standingScale(points).max;
}

export interface NearLine {
  uid: string;
  name: string;
  points: number;
  /** The line a frame would take them across. */
  line: PlayerStanding;
  /** How far they are from it now, in points. */
  gap: number;
}

/** The suspects a frame would take across a standing line, for the hint on the reward's first step (sheet order). */
export function nearLines(rows: readonly SheetRow[], settings: StandingSettings): NearLine[] {
  const near: NearLine[] = [];
  for (const r of rows) {
    if (r.stamp === 'loses-confidant' && settings.confidantAbove != null) {
      near.push({ uid: r.uid, name: r.name, points: r.points, line: 'confidant', gap: r.points - settings.confidantAbove });
    } else if (r.stamp === 'onto-watch-list' && settings.poiBelow != null) {
      near.push({ uid: r.uid, name: r.name, points: r.points, line: 'poi', gap: r.points - settings.poiBelow });
    }
  }
  return near;
}

/** The foot of the sheet: "lines at +10 and −10", "line at +10", or null with both lines off. */
export function linesNote(settings: StandingSettings): string | null {
  const lines = [settings.confidantAbove, settings.poiBelow].filter((v): v is number => v != null);
  if (lines.length === 0) return null;
  return lines.length === 1 ? `line at ${signed(lines[0]!)}` : `lines at ${signed(lines[0]!)} and ${signed(lines[1]!)}`;
}
