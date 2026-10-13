// Turning a pack's nouns into the forms the text needs: "quest", "Quest", "quests", "Quests".
import type { Noun, TermKey, Terms } from './types.ts';

export interface NounForms {
  one: string;
  One: string;
  many: string;
  Many: string;
}

export type TermForms = Record<TermKey, NounForms> & { checkin: NounForms };

/** What a check-in is called when the pack doesn't say. */
export const CHECKIN_NOUN: Noun = { one: 'check-in', many: 'check-ins' };

/** Upper-cases the first letter only: "side quest" → "Side quest", "GM" stays "GM". */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function nounForms(noun: Noun): NounForms {
  return { one: noun.one, One: capitalise(noun.one), many: noun.many, Many: capitalise(noun.many) };
}

export function termForms(terms: Terms): TermForms {
  const forms = Object.fromEntries(Object.entries(terms).map(([key, noun]) => [key, nounForms(noun as Noun)]));
  return { ...forms, checkin: nounForms(terms.checkin ?? CHECKIN_NOUN) } as TermForms;
}
