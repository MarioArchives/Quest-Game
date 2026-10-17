// Standings: a trusted confidant (points above settings.confidantAbove) or a person of interest (points below
// settings.poiBelow). Shared by the functions and the app's badges.
import type { PlayerStanding, Settings } from './types.ts';

export type StandingSettings = Pick<Settings, 'confidantAbove' | 'poiBelow'>;

/** A player's standing for these points; null when neither applies (or both thresholds are off). */
export function standingOf(points: number, settings: StandingSettings): PlayerStanding | null {
  // Strict on both lines; if they cross, person of interest wins.
  if (settings.poiBelow != null && points < settings.poiBelow) return 'poi';
  if (settings.confidantAbove != null && points > settings.confidantAbove) return 'confidant';
  return null;
}

/** What is wrong with the two thresholds, in plain words; null when they are fine. */
export function standingSettingsProblem(settings: StandingSettings): string | null {
  const { confidantAbove, poiBelow } = settings;
  if (confidantAbove != null && poiBelow != null && confidantAbove < poiBelow) {
    return 'The trusted confidant line must be at or above the person of interest line.';
  }
  return null;
}
