// Torch tour plan edge cases 1–5 and 11: who is offered the tour, what this device remembers about it (per player,
// and harmlessly when it can't remember anything), and one run at a time.
import { afterEach, describe, expect, it } from 'vitest';
import { closeTour, forgetSession, lateJoiner, markKey, offerShown, parseMark, readMark, startTour, writeMark, type MarkStore } from './tourState';

/** A device's storage, in memory. */
function memory(): MarkStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
/** Storage that's blocked: every call throws. */
const blocked: MarkStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

afterEach(() => forgetSession());

const base = { gm: false, player: true, status: 'lobby' as const, late: false, mark: null, running: false };

describe('1, 5. who is offered it', () => {
  it('a booked-in player before the case opens (the sealed file, or the empty folder without a start time)', () => {
    expect(offerShown(base)).toBe(true);
  });

  it('never a GM, even one who plays; never without a player file', () => {
    expect(offerShown({ ...base, gm: true })).toBe(false);
    expect(offerShown({ ...base, player: false })).toBe(false);
  });

  it('once the case is open, only someone who booked in after it opened', () => {
    expect(offerShown({ ...base, status: 'active' })).toBe(false);
    expect(offerShown({ ...base, status: 'active', late: true })).toBe(true);
    expect(offerShown({ ...base, status: 'paused', late: true })).toBe(true);
    expect(offerShown({ ...base, status: 'ended', late: true })).toBe(false);
  });

  it('not once taken or put off, nor while a run is on', () => {
    expect(offerShown({ ...base, mark: { offer: 'taken' } })).toBe(false);
    expect(offerShown({ ...base, mark: { offer: 'later' } })).toBe(false);
    expect(offerShown({ ...base, running: true })).toBe(false);
  });

  it('late means booked in after the case opened; a file from before the booking desk is not late', () => {
    expect(lateJoiner(2000, 1000)).toBe(true);
    expect(lateJoiner(500, 1000)).toBe(false);
    expect(lateJoiner(null, 1000)).toBe(false);
    expect(lateJoiner(2000, null)).toBe(false);
  });
});

describe('2–3. what this device remembers, per player', () => {
  it('Not now stays put after a reload; another player on the same phone is still offered it', () => {
    const store = memory();
    expect(writeMark('maya', { offer: 'later' }, store)).toBe(true);
    expect(store.data.get(markKey('maya'))).toBe('{"offer":"later"}');
    forgetSession(); // a reload
    expect(readMark('maya', store)).toEqual({ offer: 'later' });
    expect(readMark('sam', store)).toBeNull();
  });

  it('taking it, then a run reaching its last stop, keeps when it was toured', () => {
    const store = memory();
    writeMark('maya', { offer: 'taken' }, store);
    writeMark('maya', { offer: 'taken', touredAt: 1_793_000_000_000 }, store);
    forgetSession();
    expect(readMark('maya', store)).toEqual({ offer: 'taken', touredAt: 1_793_000_000_000 });
  });

  it('anything else stored is no mark', () => {
    for (const raw of [null, '', 'nope', '{}', '{"offer":"maybe"}', 'null', '[1]']) expect(parseMark(raw)).toBeNull();
    expect(parseMark('{"offer":"taken","touredAt":"noon"}')).toEqual({ offer: 'taken' });
  });
});

describe('4. storage blocked or throwing', () => {
  it('nothing crashes, the answer holds for this visit, and the offer is back next visit', () => {
    expect(writeMark('maya', { offer: 'later' }, blocked)).toBe(false);
    expect(readMark('maya', blocked)).toEqual({ offer: 'later' });
    forgetSession();
    expect(readMark('maya', blocked)).toBeNull();
    expect(offerShown({ ...base, mark: readMark('maya', blocked) })).toBe(true);
  });

  it('no storage at all is the same', () => {
    expect(writeMark('maya', { offer: 'taken' }, null)).toBe(false);
    expect(readMark('maya', null)).toEqual({ offer: 'taken' });
  });
});

describe('11. one run at a time', () => {
  it('a double tap, or a start while a run is on, gives one run; another can start once it ends', () => {
    expect(startTour(null)).toBe(true);
    expect(startTour(null)).toBe(false);
    expect(startTour(3)).toBe(false);
    closeTour();
    expect(startTour(3)).toBe(true);
    closeTour();
  });
});
