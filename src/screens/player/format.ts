// Small display helpers for the player view.
import type { LedgerReason } from '../../shared';

const LONDON = 'Europe/London';

/** "Priya" from "Priya Shah". */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/** "Sat 21:47", festival time. */
export function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: LONDON });
}

/** "Thu 8 Oct", festival time. */
export function dayDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: LONDON });
}

/** Points history lines, about someone else (Account says "Your quest was exposed"). */
export const LEDGER_LABELS: Record<LedgerReason, string> = {
  quest: 'Quest approved',
  'global-win': 'Won a side quest',
  'global-entry': 'Entered a side quest',
  exposed: 'Their quest was exposed',
  'guess-correct': 'Guessed right',
  'guess-wrong': 'Guessed wrong',
  adjust: 'GM adjustment',
  reversal: 'Approval reversed',
  fraud: 'Overruled as fraud',
  rejected: 'Claim rejected',
};
