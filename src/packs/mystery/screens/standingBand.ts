// The classification band across the top of a suspect folder, and the police tape under it. Worked out live from the
// points and the GM's two lines, so the band comes and goes as either moves; nothing for a player with no standing.
import { standingOf, type StandingSettings } from '../../../../functions/src/shared/standing.ts';
import { signed } from '../../../lib/standingBars';
import type { PlayerStanding } from '../../../shared';

export interface Band {
  standing: PlayerStanding;
  /** The big word stamped across the band ("(for now)" held together by a no-break space). */
  word: string;
  /** The line it was drawn on, e.g. "score above +10". */
  rule: string;
}

/** The band for these points; null with no standing, and once they have left (the server drops theirs too). */
export function bandFor(points: number | null | undefined, left: boolean, settings: StandingSettings): Band | null {
  if (left) return null;
  const standing = standingOf(points ?? 0, settings);
  if (standing === 'confidant') return { standing, word: 'Cleared (for\u00a0now)', rule: `score above ${signed(settings.confidantAbove ?? 0)}` };
  if (standing === 'poi') return { standing, word: 'Watch list', rule: `score below ${signed(settings.poiBelow ?? 0)}` };
  return null;
}

/** The time left on an open police check-in, for the tape: whole minutes rounded up, then under a minute; null once it is up. */
export function tapeTimeLeft(endsAtMs: number, nowMs: number): string | null {
  const ms = endsAtMs - nowMs;
  if (ms <= 0) return null;
  return ms < 60_000 ? 'under a minute left' : `${Math.ceil(ms / 60_000)} min left`;
}
