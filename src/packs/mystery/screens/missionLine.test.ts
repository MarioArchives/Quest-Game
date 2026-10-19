import { describe, expect, it } from 'vitest';
import { handCounts, newsKey, openingIndex, parseSeenNews, replacementIndex, type LineItem } from './missionLine';

const hand: LineItem[] = [
  { id: 'q1', tone: 'done', at: 2_000 },
  { id: 'q2', tone: 'exposed', at: 3_000 },
  { id: 'q3', tone: 'pending', at: 0 },
  { id: 'q4', tone: 'open', at: 0 },
  { id: 'q5', tone: 'open', at: 0 },
];

describe('newsKey', () => {
  it('keys done and exposed tags by mission and state', () => {
    expect(newsKey({ id: 'q1', tone: 'done' })).toBe('q1:done');
    expect(newsKey({ id: 'q2', tone: 'exposed' })).toBe('q2:exposed');
  });

  it('has no key for a tag still to do or with its witness', () => {
    expect(newsKey({ id: 'q3', tone: 'pending' })).toBeNull();
    expect(newsKey({ id: 'q4', tone: 'open' })).toBeNull();
  });
});

describe('openingIndex', () => {
  it('opens on the latest news not seen yet', () => {
    expect(openingIndex(hand, new Set())).toBe(1);
    expect(openingIndex(hand, new Set(['q2:exposed']))).toBe(0);
  });

  it('opens on the first to do once the news is seen', () => {
    expect(openingIndex(hand, new Set(['q1:done', 'q2:exposed']))).toBe(3);
  });

  it('opens on the first tag with nothing to do and no news', () => {
    const settled: LineItem[] = [
      { id: 'a', tone: 'done', at: 1 },
      { id: 'b', tone: 'pending', at: 0 },
    ];
    expect(openingIndex(settled, new Set(['a:done']))).toBe(0);
    expect(openingIndex([], new Set())).toBe(0);
  });

  it('treats a mission seen as done but since exposed as news again', () => {
    expect(openingIndex([{ id: 'q1', tone: 'exposed', at: 5 }, { id: 'q2', tone: 'open', at: 0 }], new Set(['q1:done']))).toBe(0);
  });

  it('takes the later of two unseen verdicts, the last one on a tie', () => {
    const two: LineItem[] = [
      { id: 'a', tone: 'done', at: 9 },
      { id: 'b', tone: 'done', at: 4 },
      { id: 'c', tone: 'exposed', at: 9 },
    ];
    expect(openingIndex(two, new Set())).toBe(2);
  });
});

describe('handCounts', () => {
  it('counts to do, with the witness and filed', () => {
    expect(handCounts([...hand.map((h) => ({ tone: h.tone, witness: h.id === 'q3' ? 'Maya' : null }))], 'with witnesses')).toEqual([
      '2 to do',
      '1 with Maya',
      '2 filed',
    ]);
  });

  it('names one witness shared by every pending claim, otherwise says so in general', () => {
    expect(handCounts([{ tone: 'pending', witness: 'Maya' }, { tone: 'pending', witness: 'Maya' }], 'with witnesses')).toEqual(['2 with Maya']);
    expect(handCounts([{ tone: 'pending', witness: 'Maya' }, { tone: 'pending', witness: 'Theo' }], 'with witnesses')).toEqual(['2 with witnesses']);
    expect(handCounts([{ tone: 'pending', witness: null }], 'with witnesses')).toEqual(['1 with witnesses']);
  });

  it('leaves zero counts out', () => {
    expect(handCounts([{ tone: 'open' }], 'with witnesses')).toEqual(['1 to do']);
    expect(handCounts([], 'with witnesses')).toEqual([]);
  });
});

describe('replacementIndex', () => {
  const line = [
    { id: 'q1', dealtAt: 100 },
    { id: 'q2', dealtAt: 100 },
    { id: 'q6', dealtAt: 900 },
  ];

  it('finds the mission dealt at the moment of the exposure', () => {
    expect(replacementIndex(line, { id: 'q2', at: 900 })).toBe(2);
  });

  it('finds none when nothing was dealt then, or the time is unknown', () => {
    expect(replacementIndex(line, { id: 'q2', at: 800 })).toBe(-1);
    expect(replacementIndex(line, { id: 'q2', at: 0 })).toBe(-1);
  });

  it('never names the exposed mission itself', () => {
    expect(replacementIndex([{ id: 'q1', dealtAt: 100 }], { id: 'q1', at: 100 })).toBe(-1);
  });
});

describe('parseSeenNews', () => {
  it('reads a stored list of keys', () => {
    expect([...parseSeenNews('["q1:done","q2:exposed"]')]).toEqual(['q1:done', 'q2:exposed']);
  });

  it('reads anything else as nothing seen', () => {
    expect(parseSeenNews(null).size).toBe(0);
    expect(parseSeenNews('not json').size).toBe(0);
    expect(parseSeenNews('{"q1":1}').size).toBe(0);
    expect([...parseSeenNews('["q1:done", 4, null]')]).toEqual(['q1:done']);
  });
});
