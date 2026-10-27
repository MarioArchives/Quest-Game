// Onboarding (a pack's `look.screens.onboarding`): who still has it to do, and the particulars it takes down. Shared by
// `bookIn` (which checks and saves them) and the app's Gate (which shows the pack's screen until it's done).
import type { RelationChoice } from './packs/types.ts';
import type { Particulars, Player } from './types.ts';

export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;
export const DRINK_MAX = 24;
export const MARKS_MAX = 140;

/**
 * An approved player who hasn't finished the onboarding: `bookedAt` is null (approval sets it so), and they're still in
 * the game. A doc with no `bookedAt` at all is from before onboarding existed, so its player was already playing.
 */
export const needsBooking = (player: Pick<Player, 'bookedAt' | 'left'>): boolean => player.bookedAt === null && !player.left;

/** Text squeezed onto one line; empty is null. */
function oneLine(value: unknown, max: number, what: string): { value: string | null } | { problem: string } {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { problem: `${what} must be text.` };
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > max) return { problem: `${what} must be at most ${max} characters.` };
  return { value: text || null };
}

/**
 * What the player sent, checked: clean particulars, or the first thing wrong with them. `booking` is the pack's booking
 * desk: a relation must be one of its relation ids (a pack without a list takes none).
 */
export function checkParticulars(raw: unknown, booking?: { relations?: readonly RelationChoice[] } | null): { particulars: Particulars } | { problem: string } {
  const relations = booking?.relations?.length ? booking.relations : null;
  if (raw === undefined || raw === null) {
    return { particulars: relations ? { heightCm: null, relation: null, drink: null, marks: null } : { heightCm: null, drink: null, marks: null } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { problem: 'Send the particulars as an object.' };
  const data = raw as Record<string, unknown>;

  let heightCm: number | null = null;
  if (data.heightCm !== undefined && data.heightCm !== null) {
    const h = data.heightCm;
    if (typeof h !== 'number' || !Number.isInteger(h) || h < HEIGHT_MIN_CM || h > HEIGHT_MAX_CM) {
      return { problem: `Height must be a whole number of centimetres from ${HEIGHT_MIN_CM} to ${HEIGHT_MAX_CM}.` };
    }
    heightCm = h;
  }
  const drink = oneLine(data.drink, DRINK_MAX, 'Drink');
  if ('problem' in drink) return drink;
  const marks = oneLine(data.marks, MARKS_MAX, 'Distinguishing marks');
  if ('problem' in marks) return marks;
  if (relations) {
    let relation: string | null = null;
    if (data.relation !== undefined && data.relation !== null && data.relation !== '') {
      if (typeof data.relation !== 'string' || !relations.some((r) => r.id === data.relation)) return { problem: 'Pick a relation from the list.' };
      relation = data.relation;
    }
    return { particulars: { heightCm, relation, drink: drink.value, marks: marks.value } };
  }
  if (data.relation !== undefined && data.relation !== null && data.relation !== '') return { problem: 'This game has no relation to pick.' };
  return { particulars: { heightCm, drink: drink.value, marks: marks.value } };
}
