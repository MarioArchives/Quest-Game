// Torch tour plan edge cases 1–5 and 11: who is offered the tour, what this device remembers about it (per player,
// and harmlessly when it can't remember anything), and one run at a time.
import { afterEach, describe, expect, it } from 'vitest';
import { closeTour, forgetSession, lateJoiner, markHolds, markKey, offerShown, parseMark, readMark, startTour, writeMark, type MarkStore } from './tourState';

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

const BOOKED = 1_793_100_000_000;
const base = { gm: false, player: true, status: 'lobby' as const, late: false, mark: null, bookedAt: BOOKED, running: false };

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

  it('not once taken or put off since booking in, nor while a run is on', () => {
    expect(offerShown({ ...base, mark: { offer: 'taken', booked: BOOKED } })).toBe(false);
    expect(offerShown({ ...base, mark: { offer: 'later', booked: BOOKED } })).toBe(false);
    expect(offerShown({ ...base, running: true })).toBe(false);
  });

  it('back again after a reset and a fresh booking: a mark from an earlier booking, or with none noted, no longer holds', () => {
    expect(offerShown({ ...base, mark: { offer: 'taken', booked: BOOKED - 3_600_000 } })).toBe(true);
    expect(offerShown({ ...base, mark: { offer: 'later' } })).toBe(true);
    // A file from before the booking desk has no booking time: any mark holds.
    expect(offerShown({ ...base, bookedAt: null, mark: { offer: 'later' } })).toBe(false);
    expect(markHolds(null, BOOKED)).toBe(false);
    expect(markHolds({ offer: 'taken', booked: BOOKED }, BOOKED)).toBe(true);
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

  it('keeps the booking a mark answers, for the next visit', () => {
    const store = memory();
    writeMark('maya', { offer: 'later', booked: BOOKED }, store);
    writeMark('maya', { offer: 'taken', booked: BOOKED }, store);
    forgetSession();
    expect(readMark('maya', store)).toEqual({ offer: 'taken', booked: BOOKED });
  });

  it('anything else stored is no mark', () => {
    for (const raw of [null, '', 'nope', '{}', '{"offer":"maybe"}', 'null', '[1]']) expect(parseMark(raw)).toBeNull();
    expect(parseMark('{"offer":"taken","touredAt":1793000000000}')).toEqual({ offer: 'taken' });
    expect(parseMark('{"offer":"later","booked":1793100000000}')).toEqual({ offer: 'later', booked: 1_793_100_000_000 });
    expect(parseMark('{"offer":"later","booked":"today"}')).toEqual({ offer: 'later' });
  });
});

describe('4. storage blocked or throwing', () => {
  it('nothing crashes, the answer holds for this visit, and the offer is back next visit', () => {
    expect(writeMark('maya', { offer: 'later', booked: BOOKED }, blocked)).toBe(false);
    expect(readMark('maya', blocked)).toEqual({ offer: 'later', booked: BOOKED });
    expect(offerShown({ ...base, mark: readMark('maya', blocked) })).toBe(false);
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
    expect(startTour()).toBe(true);
    expect(startTour()).toBe(false);
    closeTour();
    expect(startTour()).toBe(true);
    closeTour();
  });
});
