// Mystery plan edge case 19: standings as bars from zero.
import { describe, expect, it } from 'vitest';
import type { Doc, Player } from '../shared';
import { standingBars } from './standingBars';

const p = (id: string, points: number, extra: Partial<Player> = {}): Doc<Player> =>
  ({ id, displayName: id.charAt(0).toUpperCase() + id.slice(1), photoURL: `https://example.com/${id}.jpg`, points, ...extra }) as Doc<Player>;

describe('standingBars', () => {
  it('one bar per player, highest score first, ties by name', () => {
    const bars = standingBars([p('sam', -25), p('maya', 420), p('jonah', 0), p('priya', 210), p('ada', 210)], 'priya');
    expect(bars.map((b) => b.uid)).toEqual(['maya', 'ada', 'priya', 'jonah', 'sam']);
  });

  it('puts 0 and above on the plus side and below 0 on the minus side', () => {
    const bars = standingBars([p('a', 420), p('b', 0), p('c', -25)], null);
    expect(bars.map((b) => b.side)).toEqual(['plus', 'plus', 'minus']);
  });

  it('sizes bars as max(56, |score| / largest |score| × 140), rounded', () => {
    const bars = standingBars([p('a', 420), p('b', 300), p('c', 210), p('d', -25), p('e', 0), p('f', -420)], null);
    expect(Object.fromEntries(bars.map((b) => [b.uid, b.width]))).toEqual({ a: 140, b: 100, c: 70, d: 56, e: 56, f: 140 });
  });

  it('every bar is the minimum width when every score is 0 (no division by zero)', () => {
    const bars = standingBars([p('a', 0), p('b', 0)], null);
    expect(bars.map((b) => b.width)).toEqual([56, 56]);
  });

  it('takes other minimum and maximum widths', () => {
    const bars = standingBars([p('a', 100), p('b', 10)], null, { minWidth: 20, maxWidth: 200 });
    expect(bars.map((b) => b.width)).toEqual([200, 20]);
  });

  it('labels scores with a sign: +420, a real minus sign for −25, and plain 0', () => {
    const bars = standingBars([p('a', 420), p('b', 0), p('c', -25)], null);
    expect(bars.map((b) => b.label)).toEqual(['+420', '0', '−25']);
  });

  it('flags you, and only you', () => {
    const bars = standingBars([p('a', 3), p('b', 2)], 'b');
    expect(bars.map((b) => b.me)).toEqual([false, true]);
    expect(standingBars([p('a', 3)], null)[0]!.me).toBe(false);
  });

  it('carries the name and photo, with null for no photo and 0 for no points', () => {
    const bars = standingBars([p('a', 5), { id: 'b', displayName: 'Bea' } as Doc<Player>], null);
    expect(bars[0]).toMatchObject({ uid: 'a', name: 'A', photoURL: 'https://example.com/a.jpg', points: 5 });
    expect(bars[1]).toMatchObject({ uid: 'b', name: 'Bea', photoURL: null, points: 0, label: '0' });
  });

  it('leaves out players kicked out of the game, but keeps frozen ones', () => {
    const bars = standingBars([p('a', 5), p('b', 9, { left: 'out' }), p('c', 1, { left: 'frozen' })], null);
    expect(bars.map((b) => b.uid)).toEqual(['a', 'c']);
  });

  it('is empty with no players', () => {
    expect(standingBars([], 'me')).toEqual([]);
  });
});
