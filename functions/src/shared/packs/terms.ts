// Turning a pack's nouns into the forms the text needs: "quest", "Quest", "quests", "Quests".
import type { Noun, TermKey, Terms } from './types.ts';

export interface NounForms {
  one: string;
  One: string;
  many: string;
  Many: string;
}

export type TermForms = Record<TermKey, NounForms> & { checkin: NounForms; confidant: NounForms; poi: NounForms; policeCall: NounForms; feed: NounForms };

/** What a check-in is called when the pack doesn't say. */
export const CHECKIN_NOUN: Noun = { one: 'check-in', many: 'check-ins' };
/** The two standings and a police check-in, when the pack doesn't name them. */
export const CONFIDANT_NOUN: Noun = { one: 'trusted confidant', many: 'trusted confidants' };
export const POI_NOUN: Noun = { one: 'person of interest', many: 'persons of interest' };
export const POLICE_CALL_NOUN: Noun = { one: 'police check-in', many: 'police check-ins' };
/** What the feed is called when the pack doesn't say. */
export const FEED_NOUN: Noun = { one: 'feed', many: 'feeds' };

/** Upper-cases the first letter only: "side quest" → "Side quest", "GM" stays "GM". */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function nounForms(noun: Noun): NounForms {
  return { one: noun.one, One: capitalise(noun.one), many: noun.many, Many: capitalise(noun.many) };
}

export function termForms(terms: Terms): TermForms {
  const forms = Object.fromEntries(Object.entries(terms).map(([key, noun]) => [key, nounForms(noun as Noun)]));
  return {
    ...forms,
    checkin: nounForms(terms.checkin ?? CHECKIN_NOUN),
    confidant: nounForms(terms.confidant ?? CONFIDANT_NOUN),
    poi: nounForms(terms.poi ?? POI_NOUN),
    policeCall: nounForms(terms.policeCall ?? POLICE_CALL_NOUN),
    feed: nounForms(terms.feed ?? FEED_NOUN),
  } as TermForms;
}
