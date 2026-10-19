// The key under the Board's standings: one line per standing the GM has switched on, read from the live lines.
import type { StandingSettings } from '../../../../functions/src/shared/standing.ts';
import { signed } from '../../../lib/standingBars';
import type { PlayerStanding } from '../../../shared';

export interface StandingKeyLine {
  standing: PlayerStanding;
  /** Where it starts: "above +10" / "below −10". */
  rule: string;
  /** What it brings in a game with police check-ins ("can tip off the police"); null without them. */
  brings: string | null;
}

/** The key's lines, trusted confidant first; only the standings whose line is set (none when both are off). */
export function standingKeyLines(settings: StandingSettings, police: boolean): StandingKeyLine[] {
  const lines: StandingKeyLine[] = [];
  if (settings.confidantAbove != null) {
    lines.push({ standing: 'confidant', rule: `above ${signed(settings.confidantAbove)}`, brings: police ? 'can tip off the police' : null });
  }
  if (settings.poiBelow != null) {
    lines.push({ standing: 'poi', rule: `below ${signed(settings.poiBelow)}`, brings: police ? 'police check-ins' : null });
  }
  return lines;
}
