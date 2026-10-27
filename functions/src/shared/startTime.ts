// What the game says when the GM sets, moves or clears the start time: the status post (and so its push), and the
// preview the GM reads before sending it. In the pack's zone and locale.
import { termForms } from './packs/terms.ts';
import type { GamePack } from './packs/types.ts';

type Words = Pick<GamePack, 'timeZone' | 'locale' | 'terms'>;

/** "19:00, Sat 7 Nov" in the pack's zone and locale. */
export function startWords(at: number, pack: Pick<GamePack, 'timeZone' | 'locale'>): string {
  const time = new Intl.DateTimeFormat(pack.locale, { timeZone: pack.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  const day = new Intl.DateTimeFormat(pack.locale, { timeZone: pack.timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
  return `${time}, ${day}`;
}

/** The post for a new start time `at` (null: cleared), given the one it replaces (null: none was set). */
export function startPost(at: number | null, before: number | null, pack: Words): string {
  if (at === null) return `No start time for now: the ${termForms(pack.terms).gm.One} opens it by hand.`;
  return `${before === null ? 'Starts at' : 'Start moved to'} ${startWords(at, pack)}.`;
}
