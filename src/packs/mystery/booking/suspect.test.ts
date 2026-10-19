import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanUkNumber, feetInches, forgetSaved, isUkMobile, keepSaved, loadSaved, particularsOf, sheetNumber, showCallerId, showUkNumber, typedCountryCode, type Draft } from './suspect';

describe('UK mobile numbers', () => {
  it('cleans what people type into the 0… digits', () => {
    expect(cleanUkNumber('07700 900417')).toBe('07700900417');
    expect(cleanUkNumber('07700-900-417')).toBe('07700900417');
    expect(cleanUkNumber('+44 7700 900417')).toBe('07700900417');
    expect(cleanUkNumber('+44 (0)7700 900417')).toBe('07700900417');
    expect(cleanUkNumber('0044 7700 900417')).toBe('07700900417');
    expect(cleanUkNumber('447700900417')).toBe('07700900417');
    expect(cleanUkNumber('7700 900417')).toBe('07700900417');
    expect(cleanUkNumber('')).toBe('');
    expect(cleanUkNumber('call me')).toBe('');
  });

  it('notices a country code typed anyway', () => {
    expect(typedCountryCode('+44 7700 900417')).toBe(true);
    expect(typedCountryCode(' 0044 7700')).toBe(true);
    expect(typedCountryCode('07700 900417')).toBe(false);
    expect(typedCountryCode('+33 6 12 34 56 78')).toBe(false);
  });

  it('a UK mobile is 07 and nine more digits', () => {
    expect(isUkMobile('07700900417')).toBe(true);
    expect(isUkMobile('0770090041')).toBe(false);
    expect(isUkMobile('077009004170')).toBe(false);
    expect(isUkMobile('01614960000')).toBe(false);
    expect(isUkMobile(cleanUkNumber('+33 6 12 34 56 78'))).toBe(false);
  });

  it('shows eleven digits as 07700 900417, anything else as it is', () => {
    expect(showUkNumber('07700900417')).toBe('07700 900417');
    expect(showUkNumber('0770090')).toBe('0770090');
  });
});

describe('showCallerId', () => {
  it('prints a UK caller ID the international way, anything else as it is', () => {
    expect(showCallerId('+447700900417')).toBe('+44 7700 900417');
    expect(showCallerId('+4916012345678')).toBe('+4916012345678');
  });
});

describe('feetInches', () => {
  it('rounds to the nearest inch', () => {
    expect(feetInches(175)).toBe('5′9″');
    expect(feetInches(183)).toBe('6′0″');
    expect(feetInches(152)).toBe('5′0″');
    expect(feetInches(140)).toBe('4′7″');
    expect(feetInches(210)).toBe('6′11″');
  });
});

describe('the booking sheet', () => {
  it('has a four-digit number, the same for the same player', () => {
    expect(sheetNumber('alice')).toMatch(/^\d{4}$/);
    expect(sheetNumber('alice')).toBe(sheetNumber('alice'));
    expect(sheetNumber('alice')).not.toBe(sheetNumber('bob'));
  });

  it('sends height, drink and marks to bookIn, blank marks as nothing', () => {
    expect(particularsOf({ name: 'Sam', phone: '', noPhone: false, heightCm: 180, drink: 'Gin', marks: '  ' })).toEqual({ heightCm: 180, drink: 'Gin', marks: null });
    expect(particularsOf({ name: 'Sam', phone: '', noPhone: true, heightCm: 160, drink: null, marks: ' A scar ' })).toEqual({ heightCm: 160, drink: null, marks: 'A scar' });
  });
});

describe('the booking kept on this tab', () => {
  const draft: Draft = { name: 'Sam', phone: '07700 900417', noPhone: false, heightCm: 180, drink: 'Gin', marks: '' };
  beforeEach(() => {
    const items = new Map<string, string>();
    globalThis.sessionStorage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  });

  it('comes back for the same player doc, and is forgotten once booked', () => {
    keepSaved('sam', { draft, step: 'prints', photoDone: false, since: 1000 });
    expect(loadSaved('sam', 1000)).toEqual({ draft, step: 'prints', photoDone: false, since: 1000 });
    expect(loadSaved('bob', 1000)).toBeNull();
    forgetSaved('sam');
    expect(loadSaved('sam', 1000)).toBeNull();
  });

  it('is dropped when the player doc is a new one (a reset), or the draft is not one', () => {
    keepSaved('sam', { draft, step: 'prints', photoDone: false, since: 1000 });
    expect(loadSaved('sam', 2000)).toBeNull();
    sessionStorage.setItem('booking:sam', JSON.stringify({ draft: { name: 'Sam' }, step: 'prints', since: 1000 }));
    expect(loadSaved('sam', 1000)).toBeNull();
    sessionStorage.setItem('booking:sam', 'not json');
    expect(loadSaved('sam', 1000)).toBeNull();
  });

  it('never throws when the browser keeps nothing', () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(() => keepSaved('sam', { draft, step: 'prints', photoDone: false, since: 1 })).not.toThrow();
    expect(loadSaved('sam', 1)).toBeNull();
    expect(() => forgetSaved('sam')).not.toThrow();
  });
});
