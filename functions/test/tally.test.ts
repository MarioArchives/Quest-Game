// The shared vote helpers (plan "Voting takeover: polaroid swipe, the cork board, and yes/no voting", edge cases 5
// and 7): counting yes/no ballots, a complete ballot, and a vote in words. Pure: no store.
import { describe, expect, it } from 'vitest';
import { ballotComplete, entryVotesText, tallyBallots, tallyVotes, votesText, voteStyleOf } from '../src/shared/votes.js';

describe('voteStyleOf', () => {
  it("is 'yesno' only when the side quest says so; anything else votes as before", () => {
    expect(voteStyleOf({ voteStyle: 'yesno' })).toBe('yesno');
    expect(voteStyleOf({ voteStyle: 'pick' })).toBe('pick');
    expect(voteStyleOf({})).toBe('pick');
    expect(voteStyleOf({ voteStyle: 'ranked' })).toBe('pick');
    expect(voteStyleOf(null)).toBe('pick');
    expect(voteStyleOf(undefined)).toBe('pick');
  });
});

describe('tallyBallots', () => {
  it('counts yeses, noes and the net for every entry, zeros included', () => {
    const t = tallyBallots(
      [
        { a: 'yes', b: 'no' },
        { a: 'yes', b: 'yes', c: 'no' },
        { a: 'no' },
      ],
      ['a', 'b', 'c', 'd'],
    );
    expect(t.yes).toEqual({ a: 2, b: 1, c: 0, d: 0 });
    expect(t.no).toEqual({ a: 1, b: 1, c: 1, d: 0 });
    expect(t.net).toEqual({ a: 1, b: 0, c: -1, d: 0 });
    expect(t.winners).toEqual(['a']);
  });

  it('every entry tied on the top net wins', () => {
    const t = tallyBallots([{ a: 'yes', b: 'yes', c: 'no' }, { a: 'yes', b: 'yes' }], ['a', 'b', 'c']);
    expect(t.winners.sort()).toEqual(['a', 'b']);
  });

  it('wins on the net, not on the most yeses', () => {
    // a: 3 yes, 2 no (net 1); b: 2 yes, 0 no (net 2).
    const t = tallyBallots(
      [
        { a: 'yes', b: 'yes' },
        { a: 'yes', b: 'yes' },
        { a: 'yes' },
        { a: 'no' },
        { a: 'no' },
      ],
      ['a', 'b'],
    );
    expect(t.yes).toEqual({ a: 3, b: 2 });
    expect(t.winners).toEqual(['b']);
  });

  it('has no winner when the top net is 0 or less, or with no ballots at all', () => {
    expect(tallyBallots([{ a: 'yes', b: 'no' }, { a: 'no', b: 'yes' }], ['a', 'b']).winners).toEqual([]);
    expect(tallyBallots([{ a: 'no' }, { b: 'no' }], ['a', 'b']).winners).toEqual([]);
    const none = tallyBallots([], ['a', 'b']);
    expect(none).toEqual({ yes: { a: 0, b: 0 }, no: { a: 0, b: 0 }, net: { a: 0, b: 0 }, winners: [] });
  });

  it('ignores judgements on entries that cannot win, and values other than yes and no', () => {
    const t = tallyBallots(
      [
        { a: 'yes', gone: 'yes', b: 'maybe' },
        { a: 1, b: true, c: null, d: 'YES' },
        { a: 'yes', b: 'no' },
      ],
      ['a', 'b'],
    );
    expect(t.yes).toEqual({ a: 2, b: 0 });
    expect(t.no).toEqual({ a: 0, b: 1 });
    expect(Object.keys(t.net).sort()).toEqual(['a', 'b']);
    expect(t.winners).toEqual(['a']);
  });

  it('counts a repeated entry id once', () => {
    expect(tallyBallots([{ a: 'yes' }], ['a', 'a']).yes).toEqual({ a: 1 });
  });

  it('leaves tallyVotes as it was', () => {
    expect(tallyVotes(['a', 'a', 'b', 'gone'], ['a', 'b', 'c'])).toEqual({ counts: { a: 2, b: 1, c: 0 }, winners: ['a'] });
  });
});

describe('ballotComplete', () => {
  const entries = [
    { id: 'ea', uid: 'alice' },
    { id: 'eb', uid: 'bob' },
    { id: 'ec', uid: 'carol' },
  ];

  it('is complete once every entry that is not the voter’s is judged, yes or no', () => {
    expect(ballotComplete({ eb: 'yes', ec: 'no' }, entries, 'alice')).toBe(true);
    expect(ballotComplete({ eb: 'yes' }, entries, 'alice')).toBe(false);
    expect(ballotComplete({}, entries, 'alice')).toBe(false);
    expect(ballotComplete(null, entries, 'alice')).toBe(false);
    expect(ballotComplete(undefined, entries, 'alice')).toBe(false);
  });

  it('never asks for a judgement on the voter’s own entry, and ignores one on an entry that has gone', () => {
    expect(ballotComplete({ ea: 'yes', eb: 'yes' }, entries, 'alice')).toBe(false);
    expect(ballotComplete({ eb: 'no', ec: 'no', gone: 'yes' }, entries, 'alice')).toBe(true);
  });

  it('does not count a value that is not yes or no', () => {
    expect(ballotComplete({ eb: 'yes', ec: 'maybe' }, entries, 'alice')).toBe(false);
  });

  it('a voter judging every entry of someone else’s, with several of their own entries left out', () => {
    expect(ballotComplete({ eb: 'yes' }, [{ id: 'ea', uid: 'alice' }, { id: 'ea2', uid: 'alice' }, { id: 'eb', uid: 'bob' }], 'alice')).toBe(true);
  });

  it('is complete with nothing of anyone else’s to judge', () => {
    expect(ballotComplete({}, [{ id: 'ea', uid: 'alice' }], 'alice')).toBe(true);
    expect(ballotComplete(null, [], 'alice')).toBe(true);
  });
});

describe('votesText', () => {
  it('a single vote count', () => {
    expect(votesText({ votes: 0 })).toBe('0 votes');
    expect(votesText({ votes: 1 })).toBe('1 vote');
    expect(votesText({ votes: 5 })).toBe('5 votes');
  });

  it('a yes/no count', () => {
    expect(votesText({ yes: 3, no: 1 })).toBe('3 yes · 1 no');
    expect(votesText({ yes: 0, no: 0 })).toBe('0 yes · 0 no');
    expect(votesText({ yes: 1, no: 4 })).toBe('1 yes · 4 no');
  });
});

describe('entryVotesText', () => {
  it('is null until the vote is counted', () => {
    expect(entryVotesText({ tally: null }, 'a')).toBeNull();
    expect(entryVotesText({ tally: null, voteStyle: 'yesno', yesNo: null }, 'a')).toBeNull();
  });

  it('a single vote: the count (0 for an entry nobody voted for)', () => {
    expect(entryVotesText({ tally: { a: 2, b: 0 } }, 'a')).toBe('2 votes');
    expect(entryVotesText({ tally: { a: 2 } }, 'b')).toBe('0 votes');
    expect(entryVotesText({ tally: { a: 1 }, voteStyle: 'pick' }, 'a')).toBe('1 vote');
  });

  it('a yes/no vote: its yeses and noes, not the net', () => {
    const q = { voteStyle: 'yesno' as const, tally: { a: 2, b: -1 }, yesNo: { a: { yes: 3, no: 1 }, b: { yes: 0, no: 1 } } };
    expect(entryVotesText(q, 'a')).toBe('3 yes · 1 no');
    expect(entryVotesText(q, 'b')).toBe('0 yes · 1 no');
    expect(entryVotesText(q, 'c')).toBe('0 yes · 0 no');
  });
});
