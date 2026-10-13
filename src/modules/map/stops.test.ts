import { describe, expect, it } from 'vitest';
import { Stamp } from '../../../functions/src/shared/store/stamp';
import type { Doc, Stop } from '../../shared';
import { firstHidden, fromLocalInput, leaveMs, moveStop, nextOrder, nowNext, orderStops, stopStates, toLocalInput, whenLabel, type RouteStop } from './stops';

const MIN = 60_000;
const T0 = Date.parse('2026-10-10T19:00:00Z');
const at = (min: number) => Stamp.fromMillis(T0 + min * MIN);
interface Opts {
  end?: number | null;
  created?: number;
  order?: number;
  revealed?: boolean;
}
/** A stop doc; `start` null = no time yet. `order` defaults to a rising counter so docs are in the order written. */
let counter = 0;
const doc = (id: string, start: number | null, o: Opts = {}): Doc<Stop> =>
  ({
    id,
    name: id,
    lat: 53.41,
    lng: -2.23,
    order: o.order ?? ++counter,
    revealed: o.revealed ?? true,
    startsAt: start === null ? null : at(start),
    endsAt: o.end == null ? null : at(o.end),
    createdAt: at(o.created ?? 0),
  }) as Doc<Stop>;
const route = (...docs: Doc<Stop>[]) => orderStops(docs, true);
const ms = (min: number) => T0 + min * MIN;

describe('orderStops', () => {
  it('orders by the GM’s order and numbers from 1', () => {
    const r = route(doc('c', 0, { order: 30 }), doc('a', 120, { order: 10 }), doc('b', 60, { order: 20 }));
    expect(r.map((s) => [s.id, s.number, s.order])).toEqual([['a', 1, 10], ['b', 2, 20], ['c', 3, 30]]);
  });

  it('breaks order ties by creation time, then id', () => {
    const r = route(doc('z', null, { order: 1, created: 5 }), doc('y', null, { order: 1, created: 1 }), doc('b', null, { order: 1, created: 5 }));
    expect(r.map((s) => s.id)).toEqual(['y', 'b', 'z']);
  });

  it('carries times as ms; a missing time is null', () => {
    const [s, u] = route(doc('a', 10, { end: 40 }), doc('b', null));
    expect(s.startMs).toBe(ms(10));
    expect(s.endMs).toBe(ms(40));
    expect(u.startMs).toBeNull();
    expect(u.endMs).toBeNull();
  });

  it('players see only revealed stops, numbered among those; the GM sees all', () => {
    const docs = [doc('a', 0, { order: 1 }), doc('h', null, { order: 2, revealed: false }), doc('c', 60, { order: 3 })];
    expect(orderStops(docs).map((s) => [s.id, s.number])).toEqual([['a', 1], ['c', 2]]);
    expect(orderStops(docs, true).map((s) => [s.id, s.number, s.revealed])).toEqual([['a', 1, true], ['h', 2, false], ['c', 3, true]]);
  });

  it('skips stops with no place, but keeps ones with no time', () => {
    const noPlace = { ...doc('np', 0), lat: NaN } as Doc<Stop>;
    expect(route(noPlace, doc('ok', null)).map((s) => s.id)).toEqual(['ok']);
  });

  it('is empty for no stops', () => {
    expect(orderStops([])).toEqual([]);
  });
});

describe('leaveMs', () => {
  it('uses the end, else the next revealed timed start, else null', () => {
    const r = route(doc('a', 0, { end: 20 }), doc('b', 30), doc('c', 90));
    expect(leaveMs(r, 0)).toBe(ms(20));
    expect(leaveMs(r, 1)).toBe(ms(90));
    expect(leaveMs(r, 2)).toBeNull();
  });

  it('ignores hidden and untimed stops after it', () => {
    const r = route(doc('a', 0), doc('h', 50, { revealed: false }), doc('u', null), doc('c', 90));
    expect(leaveMs(r, 0)).toBe(ms(90));
  });
});

describe('nowNext with times', () => {
  const r: RouteStop[] = route(doc('a', 0, { end: 45 }), doc('b', 60, { end: 100 }), doc('c', 120));

  it('has neither with no stops', () => {
    expect(nowNext([], ms(0))).toEqual({ now: null, nowUntilMs: null, next: null });
  });

  it('before the first: no now, next is the first', () => {
    const n = nowNext(r, ms(-10));
    expect(n.now).toBeNull();
    expect(n.next?.id).toBe('a');
  });

  it('during a stop: now with its end, next is the following', () => {
    const n = nowNext(r, ms(30));
    expect(n.now?.id).toBe('a');
    expect(n.nowUntilMs).toBe(ms(45));
    expect(n.next?.id).toBe('b');
  });

  it('starts exactly at the arrival and ends exactly at the leave time', () => {
    expect(nowNext(r, ms(0)).now?.id).toBe('a');
    expect(nowNext(r, ms(45)).now).toBeNull();
    expect(nowNext(r, ms(60)).now?.id).toBe('b');
  });

  it('between stops: no now, next is the following', () => {
    const n = nowNext(r, ms(50));
    expect(n.now).toBeNull();
    expect(n.next?.id).toBe('b');
  });

  it('after the last that has ended: nothing; the open last stop stays now', () => {
    expect(nowNext(route(doc('a', 0, { end: 10 })), ms(60))).toEqual({ now: null, nowUntilMs: null, next: null });
    const n = nowNext(r, ms(500));
    expect(n.now?.id).toBe('c');
    expect(n.nowUntilMs).toBeNull();
    expect(n.next).toBeNull();
  });

  it('with no end, a stop lasts until the next one starts', () => {
    const open = route(doc('a', 0), doc('b', 60));
    expect(nowNext(open, ms(59)).now?.id).toBe('a');
    expect(nowNext(open, ms(59)).nowUntilMs).toBe(ms(60));
    expect(nowNext(open, ms(60)).now?.id).toBe('b');
  });

  it('ties: stops starting together, the later in route order is now', () => {
    const tie = route(doc('a', 0), doc('b', 0));
    expect(nowNext(tie, ms(5)).now?.id).toBe('b');
    expect(nowNext(tie, ms(-5)).next?.id).toBe('a');
  });
});

describe('nowNext without times', () => {
  it('now is the last revealed stop; players have no next', () => {
    const r = route(doc('a', null), doc('b', null), doc('h', null, { revealed: false }));
    const players = nowNext(orderStops(r.map((s) => doc(s.id, null, { order: s.order, revealed: s.revealed })), false), ms(0));
    expect(players.now?.id).toBe('b');
    expect(players.nowUntilMs).toBeNull();
    expect(players.next).toBeNull();
  });

  it('the GM’s next is the first hidden stop after it', () => {
    const r = route(doc('a', null), doc('b', null), doc('h1', null, { revealed: false }), doc('h2', null, { revealed: false }));
    const n = nowNext(r, ms(0), true);
    expect(n.now?.id).toBe('b');
    expect(n.next?.id).toBe('h1');
  });

  it('nothing revealed: no now, the GM’s next is the first stop, a player sees nothing', () => {
    const r = route(doc('h1', null, { revealed: false }), doc('h2', null, { revealed: false }));
    expect(nowNext(r, ms(0), true)).toEqual({ now: null, nowUntilMs: null, next: r[0] });
    expect(nowNext([], ms(0))).toEqual({ now: null, nowUntilMs: null, next: null });
  });

  it('everything revealed: now is the last, no next', () => {
    const n = nowNext(route(doc('a', null), doc('b', null)), ms(0), true);
    expect(n.now?.id).toBe('b');
    expect(n.next).toBeNull();
  });
});

describe('nowNext with a mix', () => {
  it('revealed timed stops, then hidden untimed ones (the demo): times rule, the GM’s next is the following stop', () => {
    const r = route(doc('a', -60, { end: -5 }), doc('b', 0), doc('c', 60), doc('h', null, { revealed: false }));
    const n = nowNext(r, ms(10), true);
    expect(n.now?.id).toBe('b');
    expect(n.next?.id).toBe('c');
    expect(nowNext(r, ms(10), false).next?.id).toBe('c');
    // After c starts, the GM's next is the first hidden stop; a player's is none.
    expect(nowNext(r, ms(70), true).next?.id).toBe('h');
    expect(nowNext(orderStops([doc('a', -60), doc('c', 60)]), ms(70)).next).toBeNull();
  });

  it('a revealed untimed stop after timed ones is where the group is, even before the clock says so', () => {
    const r = route(doc('a', -60, { end: -5 }), doc('b', 0), doc('u', null));
    const n = nowNext(r, ms(10), true);
    expect(n.now?.id).toBe('u');
    expect(n.nowUntilMs).toBeNull();
  });

  it('a hidden stop with a time never becomes now, and counts as next only for the GM', () => {
    const r = route(doc('a', 0), doc('h', 30, { revealed: false }));
    expect(nowNext(r, ms(40), true).now?.id).toBe('a');
    expect(nowNext(r, ms(40), true).next?.id).toBe('h');
    expect(nowNext(r.filter((s) => s.revealed), ms(40)).next).toBeNull();
  });

  it('a revealed timed stop ahead of a hidden one comes first as next', () => {
    const r = route(doc('a', 0), doc('b', 60), doc('h', null, { revealed: false }));
    expect(nowNext(r, ms(10), true).next?.id).toBe('b');
  });
});

describe('stopStates', () => {
  it('marks now, next, later, past and hidden', () => {
    const r = route(doc('p', -90, { end: -60 }), doc('a', 0), doc('b', 60), doc('c', 120), doc('h', null, { revealed: false }));
    const s = stopStates(r, nowNext(r, ms(10), true), ms(10));
    expect([...s.entries()]).toEqual([['p', 'past'], ['a', 'now'], ['b', 'next'], ['c', 'later'], ['h', 'hidden']]);
  });

  it('untimed route: earlier stops are past, the last revealed is now, hidden stays hidden', () => {
    const r = route(doc('a', null), doc('b', null), doc('h1', null, { revealed: false }), doc('h2', null, { revealed: false }));
    const s = stopStates(r, nowNext(r, ms(0), true), ms(0));
    expect([...s.values()]).toEqual(['past', 'now', 'hidden', 'hidden']);
  });
});

describe('route editing helpers', () => {
  it('firstHidden finds the first unrevealed stop in order', () => {
    const r = route(doc('a', null), doc('h1', null, { revealed: false }), doc('h2', null, { revealed: false }));
    expect(firstHidden(r)?.id).toBe('h1');
    expect(firstHidden(route(doc('a', null)))).toBeNull();
  });

  it('moveStop swaps neighbours and renumbers to 1..n, writing only what changes', () => {
    const r = route(doc('a', null, { order: 1 }), doc('b', null, { order: 2 }), doc('c', null, { order: 3 }));
    expect(moveStop(r, 'b', -1)).toEqual([{ id: 'b', order: 1 }, { id: 'a', order: 2 }]);
    expect(moveStop(r, 'b', 1)).toEqual([{ id: 'c', order: 2 }, { id: 'b', order: 3 }]);
  });

  it('moveStop cleans up gaps and ties', () => {
    const r = route(doc('a', null, { order: 10 }), doc('b', null, { order: 10, created: 1 }), doc('c', null, { order: 50 }));
    expect(moveStop(r, 'c', -1)).toEqual([{ id: 'a', order: 1 }, { id: 'c', order: 2 }, { id: 'b', order: 3 }]);
  });

  it('moveStop does nothing at the ends or for an unknown id', () => {
    const r = route(doc('a', null, { order: 1 }), doc('b', null, { order: 2 }));
    expect(moveStop(r, 'a', -1)).toEqual([]);
    expect(moveStop(r, 'b', 1)).toEqual([]);
    expect(moveStop(r, 'zz', 1)).toEqual([]);
  });

  it('nextOrder is one past the highest order, capped at 999', () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder(route(doc('a', null, { order: 4 }), doc('b', null, { order: 2 })))).toBe(5);
    expect(nextOrder(route(doc('a', null, { order: 999 })))).toBe(999);
  });
});

describe('local datetime inputs', () => {
  it('round trips in the device zone', () => {
    const ms = new Date(2026, 9, 10, 20, 30).getTime();
    expect(toLocalInput(ms)).toBe('2026-10-10T20:30');
    expect(fromLocalInput('2026-10-10T20:30')).toBe(ms);
  });

  it('is null for empty or bad values', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('tomorrow')).toBeNull();
  });
});

describe('whenLabel', () => {
  const zone = { timeZone: 'Europe/London', locale: 'en-GB' };
  it('shows just the clock for today and the day for another day, in the zone', () => {
    const now = Date.parse('2026-10-10T19:00:00Z'); // 20:00 BST
    expect(whenLabel(Date.parse('2026-10-10T21:30:00Z'), now, zone)).toBe('22:30');
    expect(whenLabel(Date.parse('2026-10-11T10:00:00Z'), now, zone)).toBe('Sun 11:00');
  });
});
