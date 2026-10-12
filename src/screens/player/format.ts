// Small display helpers for the player view.
import { ledgerLabels } from '../../lib/ledgerLabels';
import { dayAndTime, dayDate as formatDayDate } from '../../lib/time';
import { t, zone } from '../../pack';

/** "Priya" from "Priya Shah". */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/** "Sat 21:47", in the game's time zone. */
export function dayTime(ms: number): string {
  return dayAndTime(ms, zone);
}

/** "Thu 8 Oct", in the game's time zone. */
export function dayDate(ms: number): string {
  return formatDayDate(ms, zone);
}

/** Points history lines, about someone else (Account says "Your quest was exposed"). */
export const LEDGER_LABELS = ledgerLabels(t, 'them');
