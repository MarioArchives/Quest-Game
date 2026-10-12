// The player view: a player's record from their ledger and approved entries, their place on the board.
import { describe, expect, it } from 'vitest';
import type { LedgerReason, SubmissionKind } from '../shared';
import { ordinal, playerRecord, standingGap } from './record';

const line = (reason: LedgerReason, uid = 'priya') => ({ uid, reason });
const entry = (kind: SubmissionKind, uid = 'priya') => ({ uid, kind });

const EMPTY = {
  completed: 0,
  failed: { total: 0, exposed: 0, rejected: 0, fraud: 0 },
  sideQuests: { entered: 0, won: 0 },
  guesses: { made: 0, right: 0, wrong: 0 },
};

describe('playerRecord', () => {
  it('is all zeros with nothing to go on', () => {
    expect(playerRecord('priya', [], [])).toEqual(EMPTY);
    expect(playerRecord('priya', [], [], null)).toEqual(EMPTY);
  });

  it('takes completed quests from the player doc', () => {
    expect(playerRecord('priya', [line('quest'), line('quest')], [], 4).completed).toBe(4);
    expect(playerRecord('priya', [], [], -1).completed).toBe(0);
  });

  it.each([
    ['exposed', { total: 1, exposed: 1, rejected: 0, fraud: 0 }],
    ['rejected', { total: 1, exposed: 0, rejected: 1, fraud: 0 }],
    ['fraud', { total: 1, exposed: 0, rejected: 0, fraud: 1 }],
  ] as const)('counts a %s line as a failed quest', (reason, failed) => {
    expect(playerRecord('priya', [line(reason)], []).failed).toEqual(failed);
  });

  it('counts side-quest wins from the ledger and entries from approved side-quest submissions', () => {
    const r = playerRecord('priya', [line('global-win')], [entry('global'), entry('global'), entry('personal')]);
    expect(r.sideQuests).toEqual({ entered: 2, won: 1 });
  });

  it('counts guesses right and wrong', () => {
    const r = playerRecord('priya', [line('guess-correct'), line('guess-wrong'), line('guess-wrong')], []);
    expect(r.guesses).toEqual({ made: 3, right: 1, wrong: 2 });
  });

  it('ignores reasons that are neither a failure, a win nor a guess', () => {
    const reasons: LedgerReason[] = ['quest', 'global-entry', 'adjust', 'reversal'];
    expect(playerRecord('priya', reasons.map((r) => line(r)), [])).toEqual(EMPTY);
  });

  it('a witness reward or a bounty is neither a failure nor a guess (engine plan E21)', () => {
    expect(playerRecord('priya', [line('witness'), line('bounty')], [])).toEqual(EMPTY);
  });

  it("ignores other players' lines and entries", () => {
    const ledger = [line('exposed', 'sam'), line('global-win', 'sam'), line('guess-correct', 'sam'), line('fraud', 'sam')];
    expect(playerRecord('priya', ledger, [entry('global', 'sam')])).toEqual(EMPTY);
  });

  it('adds up a mixed history', () => {
    const ledger = [
      line('quest'),
      line('quest'),
      line('exposed'),
      line('rejected'),
      line('rejected'),
      line('reversal'),
      line('fraud'),
      line('global-win'),
      line('guess-correct'),
      line('guess-wrong'),
      line('adjust'),
      line('exposed', 'sam'),
      line('guess-correct', 'sam'),
    ];
    expect(playerRecord('priya', ledger, [entry('personal'), entry('global'), entry('global'), entry('global', 'sam')], 2)).toEqual({
      completed: 2,
      failed: { total: 4, exposed: 1, rejected: 2, fraud: 1 },
      sideQuests: { entered: 2, won: 1 },
      guesses: { made: 2, right: 1, wrong: 1 },
    });
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i → %s', (n, label) => {
    expect(ordinal(n)).toBe(label);
  });
});

describe('standingGap', () => {
  const board = [
    { id: 'robin', displayName: 'Robin', points: 415 },
    { id: 'priya', displayName: 'Priya', points: 380 },
    { id: 'sam', displayName: 'Sam', points: 380 },
    { id: 'kit', displayName: 'Kit', points: 165 },
  ];

  it('measures the gap to the nearest player above', () => {
    expect(standingGap(board, 'priya')).toBe('35 behind Robin');
    expect(standingGap(board, 'sam')).toBe('35 behind Robin');
    expect(standingGap(board, 'kit')).toBe('215 behind Priya');
  });

  it('gives a clear leader their lead over the runner-up', () => {
    expect(standingGap(board, 'robin')).toBe('35 ahead of Priya');
  });

  it('says when the lead is shared', () => {
    const tied = [
      { id: 'a', displayName: 'Ann', points: 100 },
      { id: 'b', displayName: 'Bo', points: 100 },
      { id: 'c', displayName: 'Cy', points: 100 },
    ];
    expect(standingGap(tied, 'b')).toBe('Level with Ann and 1 more');
    expect(standingGap(tied.slice(0, 2), 'a')).toBe('Level with Bo');
  });

  it('treats missing points as 0', () => {
    expect(standingGap([{ id: 'a', displayName: 'Ann', points: 10 }, { id: 'b', displayName: 'Bo' }], 'b')).toBe('10 behind Ann');
  });

  it('is null off the board or when playing alone', () => {
    expect(standingGap(board, 'nobody')).toBeNull();
    expect(standingGap([{ id: 'a', displayName: 'Ann', points: 5 }], 'a')).toBeNull();
  });
});
