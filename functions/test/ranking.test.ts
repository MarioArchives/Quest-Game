// Edge case 45: one ranking function shared by the leaderboard (client) and endGame (server).
import { describe, expect, it } from 'vitest';
import { competitionRanks } from '../src/shared/ranking.js';

const p = (uid: string, points: number) => ({ uid, points });
const rank = (items: { uid: string; points: number }[]) =>
  competitionRanks(items, (i) => i.points).map((r) => `${r.uid}:${r.rank}`);

describe('competitionRanks', () => {
  it('sorts by score descending and shares ranks on ties (1, 1, 3)', () => {
    expect(rank([p('c', 50), p('a', 100), p('b', 100)])).toEqual(['a:1', 'b:1', 'c:3']);
  });

  it('skips the right number of places after a three-way tie', () => {
    expect(rank([p('a', 10), p('b', 10), p('c', 10), p('d', 5)])).toEqual(['a:1', 'b:1', 'c:1', 'd:4']);
  });

  it('keeps input order for equal scores (stable)', () => {
    expect(rank([p('z', 7), p('y', 7)])).toEqual(['z:1', 'y:1']);
  });

  it('handles negative scores and an empty list', () => {
    expect(rank([p('a', -5), p('b', 0)])).toEqual(['b:1', 'a:2']);
    expect(rank([])).toEqual([]);
  });

  it('does not mutate its input and keeps other fields', () => {
    const input = [p('a', 1), p('b', 2)];
    const out = competitionRanks(input, (i) => i.points);
    expect(input.map((i) => i.uid)).toEqual(['a', 'b']);
    expect(out[0]).toEqual({ uid: 'b', points: 2, rank: 1 });
  });
});
