// Podium ordering, ties, ordinals and the words on each player's button (Home ranks and the Standings screen).
import { describe, expect, it } from 'vitest';
import { firstName, formatPoints, ordinal, playerLabel, splitStandings, tiedRanks, type RankedEntry } from './standings';

const p = (id: string, points: number, rank: number, extra: Partial<RankedEntry> = {}): RankedEntry => ({
  id,
  displayName: id,
  points,
  rank,
  ...extra,
});

describe('splitStandings', () => {
  it('puts the top three on the podium 2-1-3 and everyone else on the wristbands', () => {
    const players = [p('a', 400, 1), p('b', 380, 2), p('c', 355, 3), p('d', 310, 4), p('e', 265, 5)];
    const { podium, rest } = splitStandings(players);
    expect(podium.map((s) => [s.player.id, s.column, s.step])).toEqual([
      ['a', 2, 1],
      ['b', 1, 2],
      ['c', 3, 3],
    ]);
    expect(rest.map((r) => r.id)).toEqual(['d', 'e']);
  });

  it('handles nobody, one and two players (a partial podium, no wristbands)', () => {
    expect(splitStandings([])).toEqual({ podium: [], rest: [] });
    expect(splitStandings([p('a', 10, 1)]).podium.map((s) => s.column)).toEqual([2]);
    const two = splitStandings([p('a', 10, 1), p('b', 5, 2)]);
    expect(two.podium.map((s) => [s.player.id, s.column])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(two.rest).toEqual([]);
  });

  it('places ties by position but sizes blocks by the shared rank', () => {
    const { podium } = splitStandings([p('a', 50, 1), p('b', 50, 1), p('c', 40, 3)]);
    expect(podium.map((s) => [s.player.id, s.column, s.step])).toEqual([
      ['a', 2, 1],
      ['b', 1, 1],
      ['c', 3, 3],
    ]);
    const three = splitStandings([p('a', 9, 1), p('b', 5, 2), p('c', 5, 2), p('d', 5, 2)]);
    expect(three.podium.map((s) => s.step)).toEqual([1, 2, 2]);
    expect(three.rest.map((r) => r.rank)).toEqual([2]);
  });
});

describe('tiedRanks', () => {
  it('lists only the ranks two or more players share', () => {
    expect([...tiedRanks([p('a', 9, 1), p('b', 9, 1), p('c', 5, 3), p('d', 2, 4), p('e', 2, 4)])]).toEqual([1, 4]);
    expect(tiedRanks([p('a', 9, 1), p('b', 5, 2)]).size).toBe(0);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i → %s', (n, word) => {
    expect(ordinal(n)).toBe(word);
  });
});

describe('firstName', () => {
  it('takes the first word, trimmed', () => {
    expect(firstName('  Priya   Shah ')).toBe('Priya');
    expect(firstName('Mo')).toBe('Mo');
  });
  it('falls back to the raw name when it has no words', () => {
    expect(firstName('   ')).toBe('   ');
  });
});

describe('formatPoints', () => {
  it('prints a real minus sign for a negative score', () => {
    expect(formatPoints(310)).toBe('310');
    expect(formatPoints(0)).toBe('0');
    expect(formatPoints(-40)).toBe('−40');
  });
});

describe('playerLabel', () => {
  it('reads place, name and points', () => {
    expect(playerLabel(p('Priya Shah', 380, 2))).toBe('2nd, Priya Shah, 380 points. Open record');
    expect(playerLabel(p('Kit', 1, 7))).toBe('7th, Kit, 1 point. Open record');
  });
  it('says "you" and "joint" when it applies', () => {
    expect(playerLabel(p('Jess', 355, 1), { you: true, tied: true })).toBe('Joint 1st, you (Jess), 355 points. Open your record');
  });
  it('says when a player has left and their score is frozen', () => {
    expect(playerLabel(p('Mo', 140, 8, { left: 'frozen' }))).toBe(
      '8th, Mo, has left the game, score frozen at 140 points. Open record',
    );
  });
});
