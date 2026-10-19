// The suspect at the booking desk: their mobile the UK way (the police ring it when phone calls are on), their height
// in feet and inches, the sheet's number, and the half-filled booking kept on this tab while they go through it (the
// finished booking lives on the player doc, per account).
import type { Particulars } from '../../../shared';
import { hashText } from './fingerprint';

/**
 * What the desk takes down: `name` is the display name, `phone` the mobile as typed (cleanUkNumber gives the digits),
 * or `noPhone` when they'd rather take the police's calls in the app.
 */
export interface Draft {
  name: string;
  phone: string;
  noPhone: boolean;
  heightCm: number;
  drink: string | null;
  marks: string;
}

/**
 * The digits of a UK number, starting 0. Spaces and dashes go, and a +44 (or 0044, or 44) typed anyway becomes the
 * leading 0, with any "(0)" after it dropped.
 */
export function cleanUkNumber(typed: string): string {
  let digits = typed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+44')) digits = digits.slice(3);
  else if (digits.startsWith('0044')) digits = digits.slice(4);
  else if (digits.startsWith('44') && digits.length >= 12) digits = digits.slice(2);
  digits = digits.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `0${digits}` : '';
}

/** Whether they typed a country code we'll drop, to say so. */
export const typedCountryCode = (typed: string): boolean => /^\s*(\+|00)\s*4\s*4/.test(typed);

/** A UK mobile: 07 and nine more digits. */
export const isUkMobile = (digits: string): boolean => /^07\d{9}$/.test(digits);

/** 07700 900417. */
export const showUkNumber = (digits: string): string => (digits.length === 11 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits);

/** The police's number the way the calling card prints it: +44 7700 900417 (other countries as they come). */
export const showCallerId = (e164: string): string => {
  const m = /^\+44(\d{4})(\d{6})$/.exec(e164);
  return m ? `+44 ${m[1]} ${m[2]}` : e164;
};

/** 175 cm is 5′9″. */
export function feetInches(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** The booking sheet's number, the same every time for the same player. */
export const sheetNumber = (seed: string): string => pad(hashText(`sheet:${seed}`) % 10_000, 4);

/** What goes to `bookIn` from the draft. */
export const particularsOf = (draft: Draft): Particulars => ({ heightCm: draft.heightCm, drink: draft.drink, marks: draft.marks.trim() || null });

/* ---------------------------------------------------------------- kept on this tab while they go through it */

/** How far they had got, so a reload carries on rather than starting again. */
export interface Saved {
  draft: Draft;
  step: string;
  photoDone: boolean;
  /** When the GM let them in (ms): a booking kept from before a reset (a new player doc) is dropped. */
  since: number;
}

const key = (uid: string) => `booking:${uid}`;

export function loadSaved(uid: string, since: number): Saved | null {
  try {
    const raw = sessionStorage.getItem(key(uid));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.since !== since) return null;
    const d = saved.draft;
    if (!d || typeof d.name !== 'string' || typeof d.phone !== 'string' || typeof d.heightCm !== 'number' || typeof d.marks !== 'string') return null;
    const draft: Draft = { ...d, noPhone: d.noPhone === true, drink: typeof d.drink === 'string' ? d.drink : null };
    return { draft, step: String(saved.step ?? ''), photoDone: saved.photoDone === true, since };
  } catch {
    return null;
  }
}

export function keepSaved(uid: string, saved: Saved): void {
  try {
    sessionStorage.setItem(key(uid), JSON.stringify(saved));
  } catch {
    /* private mode or full: a reload just starts the booking again */
  }
}

export function forgetSaved(uid: string): void {
  try {
    sessionStorage.removeItem(key(uid));
  } catch {
    /* nothing kept to forget */
  }
}
