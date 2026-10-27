// The polaroid vote's deck and cork board (plan "Voting takeover: polaroid swipe, the cork board, and yes/no voting",
// edge cases 14 and 15).
import { describe, expect, it } from 'vitest';
import {
  boardEntries,
  boardLayout,
  boardMark,
  choosePrompt,
  clampIndex,
  deckLabels,
  deckOrder,
  doneEnabled,
  marksFor,
  parseShortlist,
  POLAROID,
  QUESTION_CARD,
  readShortlist,
  shortlistKey,
  startAt,
  stringWeight,
  writeShortlist,
  type DeckEntry,
} from './voteDeck';

const e = (id: string, uid: string): DeckEntry => ({ id, uid });
const ENTRIES = [e('ea', 'alice'), e('eb', 'bob'), e('ec', 'carol'), e('ed', 'dave'), e('ee', 'erin'), e('ef', 'fay')];

describe('deckOrder', () => {
  it('never holds your own entry', () => {
    const deck = deckOrder(ENTRIES, 'alice', 'm1');
    expect(deck.map((x) => x.id).sort()).toEqual(['eb', 'ec', 'ed', 'ee', 'ef']);
    expect(deckOrder([e('ea', 'alice'), e('ea2', 'alice')], 'alice', 'm1')).toEqual([]);
  });

  it('is the same every time for one player and one vote, whatever order the entries come in', () => {
    const once = deckOrder(ENTRIES, 'alice', 'm1').map((x) => x.id);
    expect(deckOrder(ENTRIES, 'alice', 'm1').map((x) => x.id)).toEqual(once);
    expect(deckOrder([...ENTRIES].reverse(), 'alice', 'm1').map((x) => x.id)).toEqual(once);
  });

  it('is shuffled: not every player and vote sees the same order', () => {
    const orders = new Set<string>();
    for (const uid of ['zed', 'yan', 'xia', 'wil', 'val']) {
      for (const m of ['m1', 'm2', 'm3']) orders.add(deckOrder(ENTRIES, uid, m).map((x) => x.id).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps the entries as they were given (any extra fields)', () => {
    const rich = [{ id: 'eb', uid: 'bob', caption: 'the dart' }];
    expect(deckOrder(rich, 'alice', 'm1')).toEqual(rich);
  });
});

describe('the shortlist kept on the device', () => {
  const store = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('is kept per player and vote', () => {
    expect(shortlistKey('alice', 'm1')).toBe('mm:shortlist:alice:m1');
  });

  it('survives a reload', () => {
    const s = store();
    writeShortlist(s, 'alice', 'm1', { eb: 'maybe', ec: 'not' });
    expect(readShortlist(s, 'alice', 'm1')).toEqual({ eb: 'maybe', ec: 'not' });
    expect(readShortlist(s, 'alice', 'm2')).toEqual({});
    expect(readShortlist(s, 'bob', 'm1')).toEqual({});
  });

  it('drops anything that is not a shortlist', () => {
    expect(parseShortlist(null)).toEqual({});
    expect(parseShortlist(undefined)).toEqual({});
    expect(parseShortlist('')).toEqual({});
    expect(parseShortlist('not json')).toEqual({});
    expect(parseShortlist('[1,2]')).toEqual({});
    expect(parseShortlist('"maybe"')).toEqual({});
    expect(parseShortlist(JSON.stringify({ eb: 'maybe', ec: 'yes', ed: 1, ee: 'not' }))).toEqual({ eb: 'maybe', ee: 'not' });
  });

  it('carries on quietly with no storage, or storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readShortlist(null, 'alice', 'm1')).toEqual({});
    expect(readShortlist(throwing, 'alice', 'm1')).toEqual({});
    expect(() => writeShortlist(null, 'alice', 'm1', { eb: 'maybe' })).not.toThrow();
    expect(() => writeShortlist(throwing, 'alice', 'm1', { eb: 'maybe' })).not.toThrow();
  });
});

describe('marks, where the vote opens, and the deck’s words', () => {
  const deck = [e('eb', 'bob'), e('ec', 'carol'), e('ed', 'dave')];

  it('pick one marks from the shortlist; yes/no from the ballot', () => {
    expect(marksFor('pick', { eb: 'maybe', ec: 'not' }, { eb: 'no' })).toEqual({ eb: 'maybe', ec: 'not' });
    expect(marksFor('yesno', { eb: 'maybe' }, { eb: 'no', ec: 'yes' })).toEqual({ eb: 'no', ec: 'yes' });
    expect(marksFor('yesno', {}, null)).toEqual({});
  });

  it('opens at the first card without a mark', () => {
    expect(startAt(deck, {}, false)).toEqual({ stage: 'deck', index: 0 });
    expect(startAt(deck, { eb: 'yes' }, false)).toEqual({ stage: 'deck', index: 1 });
    expect(startAt(deck, { eb: 'maybe', ed: 'not' }, false)).toEqual({ stage: 'deck', index: 1 });
  });

  it('opens on the board once finished, or once every card is marked', () => {
    expect(startAt(deck, {}, true)).toEqual({ stage: 'board' });
    expect(startAt(deck, { eb: 'maybe', ec: 'not', ed: 'not' }, false)).toEqual({ stage: 'board' });
  });

  it('opens on the board with an empty deck', () => {
    expect(startAt([], {}, false)).toEqual({ stage: 'board' });
  });

  it('keeps a position within the deck when entries go mid-vote', () => {
    expect(clampIndex(4, 3)).toBe(3);
    expect(clampIndex(3, 3)).toBe(3);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(2, 0)).toBe(0);
  });

  it('labels the buttons for each way of voting', () => {
    expect(deckLabels('pick')).toEqual({ left: 'NOT IT', right: 'MAYBE' });
    expect(deckLabels('yesno')).toEqual({ left: 'NO', right: 'YES' });
  });
});

describe('the board', () => {
  const deck = [e('eb', 'bob'), e('ec', 'carol'), e('ed', 'dave'), e('ee', 'erin')];
  const ids = (xs: DeckEntry[]) => xs.map((x) => x.id);

  it('pick one: only the maybes, in deck order (not-its are not there at all)', () => {
    expect(ids(boardEntries('pick', deck, { eb: 'not', ec: 'maybe', ed: 'not', ee: 'maybe' }, null))).toEqual(['ec', 'ee']);
  });

  it('pick one: the entry you voted for is there even if it was not a maybe on this device', () => {
    expect(ids(boardEntries('pick', deck, { eb: 'not', ec: 'maybe' }, 'ed'))).toEqual(['ec', 'ed']);
  });

  it('pick one: everyone when there are no maybes, so the board is never empty', () => {
    expect(ids(boardEntries('pick', deck, { eb: 'not', ec: 'not', ed: 'not', ee: 'not' }, null))).toEqual(ids(deck));
    expect(ids(boardEntries('pick', deck, {}, null))).toEqual(ids(deck));
  });

  it('yes/no: everyone in the deck, judged or not', () => {
    expect(ids(boardEntries('yesno', deck, { eb: 'no' }, null))).toEqual(ids(deck));
  });

  it('pick one wears MY VOTE on your vote and MAYBE on the rest; no stamps', () => {
    const marks = { eb: 'maybe' as const, ec: 'maybe' as const };
    expect(boardMark('pick', 'eb', marks, 'eb')).toEqual({ stamp: null, tag: 'MY VOTE' });
    expect(boardMark('pick', 'ec', marks, 'eb')).toEqual({ stamp: null, tag: 'MAYBE' });
    expect(boardMark('pick', 'ed', marks, 'eb')).toEqual({ stamp: null, tag: null });
  });

  it('yes/no stamps YES, NO, or ? until judged; no tags', () => {
    const marks = { eb: 'yes' as const, ec: 'no' as const };
    expect(boardMark('yesno', 'eb', marks, null)).toEqual({ stamp: 'YES', tag: null });
    expect(boardMark('yesno', 'ec', marks, null)).toEqual({ stamp: 'NO', tag: null });
    expect(boardMark('yesno', 'ed', marks, null)).toEqual({ stamp: '?', tag: null });
  });

  it('a red string to your vote, twine to the rest; in yes/no, twine to a yes and faint otherwise', () => {
    expect(stringWeight('pick', 'eb', { eb: 'maybe' }, 'eb')).toBe('red');
    expect(stringWeight('pick', 'ec', { ec: 'maybe' }, 'eb')).toBe('twine');
    expect(stringWeight('yesno', 'eb', { eb: 'yes' }, null)).toBe('twine');
    expect(stringWeight('yesno', 'ec', { ec: 'no' }, null)).toBe('faint');
    expect(stringWeight('yesno', 'ed', {}, null)).toBe('faint');
  });

  it('says "Choose one" only in pick one, before a vote is pinned', () => {
    expect(choosePrompt('pick', null)).toBe('Choose one');
    expect(choosePrompt('pick', 'eb')).toBeNull();
    expect(choosePrompt('yesno', null)).toBeNull();
  });

  it('Done needs a vote in pick one, and every card judged in yes/no', () => {
    expect(doneEnabled('pick', deck, { eb: 'maybe' }, null)).toBe(false);
    expect(doneEnabled('pick', deck, {}, 'eb')).toBe(true);
    expect(doneEnabled('yesno', deck, { eb: 'yes', ec: 'no', ed: 'yes' }, null)).toBe(false);
    expect(doneEnabled('yesno', deck, { eb: 'yes', ec: 'no', ed: 'yes', ee: 'no' }, null)).toBe(true);
    expect(doneEnabled('yesno', deck, { eb: 'yes', ec: 'no', ed: 'yes', ee: 'maybe' }, null)).toBe(false);
  });
});

describe('boardLayout', () => {
  const centre = (s: { left: number; top: number }) => ({ x: s.left + POLAROID.w / 2, y: s.top + POLAROID.h / 2 });

  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('pins %i polaroids inside the board, each with its string', (n) => {
    const b = boardLayout(n);
    expect(b.spots).toHaveLength(n);
    expect(b.strings).toHaveLength(n);
    expect(b.width).toBe(390);
    for (const s of b.spots) {
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.left + POLAROID.w).toBeLessThanOrEqual(b.width);
      expect(s.top).toBeGreaterThanOrEqual(0);
      expect(s.top + POLAROID.h).toBeLessThanOrEqual(b.height);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(8);
    }
    b.strings.forEach((g, i) => {
      const end = { x: b.hub.x + g.length * Math.cos((g.angle * Math.PI) / 180), y: b.hub.y + g.length * Math.sin((g.angle * Math.PI) / 180) };
      const c = centre(b.spots[i]!);
      expect(Math.abs(end.x - c.x), `string ${i} x`).toBeLessThan(1);
      expect(Math.abs(end.y - c.y), `string ${i} y`).toBeLessThan(1);
    });
  });

  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('keeps %i polaroids apart, and off the question card', (n) => {
    const b = boardLayout(n);
    const cs = b.spots.map(centre);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const far = Math.abs(cs[i]!.x - cs[j]!.x) >= POLAROID.w * 0.75 || Math.abs(cs[i]!.y - cs[j]!.y) >= POLAROID.h * 0.75;
        expect(far, `polaroids ${i} and ${j}`).toBe(true);
      }
      const offCard = Math.abs(cs[i]!.x - b.hub.x) >= (POLAROID.w + QUESTION_CARD.w) / 2 - 8 || Math.abs(cs[i]!.y - b.hub.y) >= (POLAROID.h + QUESTION_CARD.h) / 2 - 8;
      expect(offCard, `polaroid ${i} and the card`).toBe(true);
    }
  });

  it('fits up to six in the board’s height, and grows (to scroll) past six', () => {
    for (let n = 1; n <= 6; n++) expect(boardLayout(n).height).toBe(610);
    expect(boardLayout(7).height).toBeGreaterThan(610);
    expect(boardLayout(12).height).toBeGreaterThan(boardLayout(8).height);
  });

  it('scales to a narrower board', () => {
    const b = boardLayout(6, 360);
    expect(b.width).toBe(360);
    for (const s of b.spots) expect(s.left + POLAROID.w).toBeLessThanOrEqual(360);
    expect(b.hub.x).toBeCloseTo(180, 0);
  });

  it('is the same every time', () => {
    expect(boardLayout(9)).toEqual(boardLayout(9));
  });

  it('an empty board is just the question card', () => {
    expect(boardLayout(0)).toMatchObject({ spots: [], strings: [], height: 610 });
  });
});
