// Reactions: the quick set in the picker, plus any single emoji typed with the phone's emoji keyboard.
import { REACTION_EMOJI } from '../../functions/src/shared/types';

/** firestore.rules carries the same cap (a unit test checks): room for flags and skin-tone/ZWJ sequences. */
export const REACTION_MAX_CODE_POINTS = 16;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const QUICK: readonly string[] = REACTION_EMOJI;

/**
 * The emoji when `input` (trimmed) is exactly one emoji, else null. The rules refuse any ASCII, so keycaps
 * (1️⃣, #️⃣) are out too.
 */
export function singleEmoji(input: string): string | null {
  const text = input.trim();
  const codePoints = [...text];
  if (codePoints.length === 0 || codePoints.length > REACTION_MAX_CODE_POINTS) return null;
  if (codePoints.some((c) => c.codePointAt(0)! < 0x80)) return null;
  if ([...segmenter.segment(text)].length !== 1 || !PICTOGRAPHIC.test(text)) return null;
  return text;
}

/**
 * The emoji used on a post, for the row under it: the quick set in its own order, then any others in a
 * fixed order, so the row doesn't reshuffle as counts change.
 */
export function orderReactions(used: Iterable<string>): string[] {
  const set = new Set(used);
  const others = [...set].filter((e) => !QUICK.includes(e)).sort();
  return [...QUICK.filter((e) => set.has(e)), ...others];
}
