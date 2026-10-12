// Turning a pack's nouns into the forms the text needs: "quest", "Quest", "quests", "Quests".
import type { Noun, TermKey, Terms } from './types.ts';

export interface NounForms {
  one: string;
  One: string;
  many: string;
  Many: string;
}

export type TermForms = Record<TermKey, NounForms>;

/** Upper-cases the first letter only: "side quest" → "Side quest", "GM" stays "GM". */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function nounForms(noun: Noun): NounForms {
  return { one: noun.one, One: capitalise(noun.one), many: noun.many, Many: capitalise(noun.many) };
}

export function termForms(terms: Terms): TermForms {
  return Object.fromEntries(Object.entries(terms).map(([key, noun]) => [key, nounForms(noun)])) as TermForms;
}
