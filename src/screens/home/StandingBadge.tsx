// The small badge for a player's standing: a trusted confidant (points above the line) or a person of interest
// (points below it). Worked out live from the points, so it follows the GM's two lines. Nothing shows when both are off.
import { useGame } from '../../data/GameProvider';
import { standingOf } from '../../../functions/src/shared/standing.ts';
import type { PlayerStanding } from '../../shared';
import { t } from '../../pack';
import './standing.css';

/** A player's standing for these points under the game's settings; null when neither applies. */
export function useStanding(points: number | null | undefined): PlayerStanding | null {
  const { settings } = useGame();
  return standingOf(points ?? 0, settings);
}

/** The words for a standing, in the pack's nouns. */
export const standingWord = (standing: PlayerStanding): string => (standing === 'confidant' ? t.confidant.One : t.poi.One);

export function StandingBadge({ points, className }: { points: number | null | undefined; className?: string }) {
  const standing = useStanding(points);
  if (!standing) return null;
  return <span className={`standing standing--${standing}${className ? ` ${className}` : ''}`}>{standingWord(standing)}</span>;
}
