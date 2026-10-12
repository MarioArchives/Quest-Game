// Data-layer plan edge case 13: the in-memory store's watchers and onWrite, which the mock backend's live
// screens and triggers run on. Listeners run synchronously at commit, before the write's promise resolves.
import { beforeEach, describe, expect, it } from 'vitest';
import { GameError } from '../src/shared/store/errors.js';
import { memoryStore } from '../src/shared/store/memory.js';
import type { DocSnap, QuerySnap, WatchableStore, WriteChange } from '../src/shared/store/types.js';

let s: WatchableStore;
beforeEach(() => {
  s = memoryStore();
});

const docState = (snap: DocSnap) => (snap.exists ? snap.data() : null);
const queryIds = (snap: QuerySnap) => snap.docs.map((d) => d.id);

describe('watchDoc', () => {
  it('fires with the current state, then once per committed change to that doc', async () => {
    await s.doc('t/a').set({ n: 1 });
    const seen: unknown[] = [];
    s.watchDoc('t/a', (snap) => seen.push(docState(snap)));
    expect(seen).toEqual([{ n: 1 }]);

    await s.doc('t/a').update({ n: 2 });
    await s.doc('t/other').set({ n: 9 });
    await s.doc('t/a').delete();
    expect(seen).toEqual([{ n: 1 }, { n: 2 }, null]);
  });

  it('reports a missing doc as not existing, then its creation', async () => {
    const seen: unknown[] = [];
    s.watchDoc('t/new', (snap) => seen.push(docState(snap)));
    await s.doc('t/new').set({ x: 1 });
    expect(seen).toEqual([null, { x: 1 }]);
  });

  it('stops after unsubscribing', async () => {
    const seen: unknown[] = [];
    const stop = s.watchDoc('t/a', (snap) => seen.push(docState(snap)));
    stop();
    await s.doc('t/a').set({ x: 1 });
    expect(seen).toEqual([null]);
  });
});

describe('watchQuery', () => {
  it('fires with the current results, then when a committed change alters them', async () => {
    await s.doc('t/a').set({ kind: 'x', n: 1 });
    const seen: string[][] = [];
    s.watchQuery(s.collection('t').where('kind', '==', 'x'), (snap) => seen.push(queryIds(snap)));
    expect(seen).toEqual([['a']]);

    await s.doc('t/b').set({ kind: 'x', n: 2 });
    await s.doc('t/c').set({ kind: 'y', n: 3 });
    await s.doc('t/a').update({ kind: 'y' });
    expect(seen).toEqual([['a'], ['a', 'b'], ['b']]);
  });

  it('fires when a matching doc changes even if the ids stay the same', async () => {
    await s.doc('t/a').set({ kind: 'x', n: 1 });
    const seen: unknown[] = [];
    s.watchQuery(s.collection('t').where('kind', '==', 'x'), (snap) => seen.push(snap.docs.map((d) => d.data())));
    await s.doc('t/a').update({ n: 2 });
    expect(seen).toEqual([[{ kind: 'x', n: 1 }], [{ kind: 'x', n: 2 }]]);
  });

  it('honours orderBy and limit, and ignores changes outside the window', async () => {
    for (const [id, n] of [['a', 1], ['b', 5], ['c', 9]] as const) await s.doc(`t/${id}`).set({ n });
    const seen: string[][] = [];
    s.watchQuery(s.collection('t').orderBy('n', 'desc').limit(2), (snap) => seen.push(queryIds(snap)));
    expect(seen).toEqual([['c', 'b']]);

    await s.doc('t/d').set({ n: 0 });
    expect(seen).toHaveLength(1);
    await s.doc('t/e').set({ n: 7 });
    expect(seen).toEqual([['c', 'b'], ['c', 'e']]);
  });

  it('watches subcollections by path', async () => {
    const seen: string[][] = [];
    s.watchQuery(s.collection('feed/f1/reactions'), (snap) => seen.push(queryIds(snap)));
    await s.doc('feed/f1/reactions/u1').set({ emoji: '🔥' });
    await s.doc('feed/f2/reactions/u1').set({ emoji: '🔥' });
    expect(seen).toEqual([[], ['u1']]);
  });

  it('stops after unsubscribing', async () => {
    const seen: string[][] = [];
    const stop = s.watchQuery(s.collection('t'), (snap) => seen.push(queryIds(snap)));
    stop();
    await s.doc('t/a').set({ x: 1 });
    expect(seen).toEqual([[]]);
  });
});

describe('commits', () => {
  it('a batch or transaction notifies each watcher once, after all its writes', async () => {
    const seen: string[][] = [];
    s.watchQuery(s.collection('t'), (snap) => seen.push(queryIds(snap)));
    await s.batch().set(s.doc('t/a'), { x: 1 }).set(s.doc('t/b'), { x: 1 }).set(s.doc('t/c'), { x: 1 }).commit();
    await s.runTransaction(async (tx) => {
      tx.delete(s.doc('t/a'));
      tx.delete(s.doc('t/b'));
    });
    expect(seen).toEqual([[], ['a', 'b', 'c'], ['c']]);
  });

  it('a failed transaction notifies nobody', async () => {
    const seen: unknown[] = [];
    const changes: WriteChange[] = [];
    s.watchQuery(s.collection('t'), (snap) => seen.push(queryIds(snap)));
    s.watchDoc('t/a', (snap) => seen.push(docState(snap)));
    s.onWrite((c) => changes.push(c));
    await s
      .runTransaction(async (tx) => {
        tx.set(s.doc('t/a'), { x: 1 });
        throw new GameError('failed-precondition', 'No.');
      })
      .catch(() => undefined);
    expect(seen).toEqual([[], null]);
    expect(changes).toEqual([]);
  });

  it('a transaction that retries notifies only for the attempt that commits', async () => {
    await s.doc('t/counter').set({ n: 0 });
    const seen: unknown[] = [];
    s.watchDoc('t/counter', (snap) => seen.push(snap.get('n')));
    const bump = () =>
      s.runTransaction(async (tx) => {
        const n = (await tx.get(s.doc('t/counter'))).get('n') as number;
        tx.update(s.doc('t/counter'), { n: n + 1 });
      });
    await Promise.all([bump(), bump()]);
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('onWrite', () => {
  it('reports each committed write with its path, before and after, in write order', async () => {
    const changes: WriteChange[] = [];
    s.onWrite((c) => changes.push(c));
    await s.doc('t/a').set({ n: 1 });
    await s.doc('t/a').update({ n: 2 });
    await s.runTransaction(async (tx) => {
      tx.set(s.doc('t/b'), { m: 1 });
      tx.delete(s.doc('t/a'));
    });
    expect(changes).toEqual([
      { path: 't/a', before: undefined, after: { n: 1 } },
      { path: 't/a', before: { n: 1 }, after: { n: 2 } },
      { path: 't/b', before: undefined, after: { m: 1 } },
      { path: 't/a', before: { n: 2 }, after: undefined },
    ]);
  });

  it('reports one change per document per commit, with the final state', async () => {
    const changes: WriteChange[] = [];
    s.onWrite((c) => changes.push(c));
    await s.runTransaction(async (tx) => {
      tx.set(s.doc('t/a'), { n: 1 });
      tx.update(s.doc('t/a'), { n: 2 });
    });
    expect(changes).toEqual([{ path: 't/a', before: undefined, after: { n: 2 } }]);
  });

  it('a delete of a missing doc reports nothing', async () => {
    const changes: WriteChange[] = [];
    s.onWrite((c) => changes.push(c));
    await s.doc('t/none').delete();
    expect(changes).toEqual([]);
  });

  it('recursiveDelete reports every doc it removes', async () => {
    await s.doc('p/u1').set({ a: 1 });
    await s.doc('p/u1/quests/q1').set({ b: 1 });
    const changes: WriteChange[] = [];
    s.onWrite((c) => changes.push(c));
    await s.recursiveDelete(s.doc('p/u1'));
    expect(changes.map((c) => c.path).sort()).toEqual(['p/u1', 'p/u1/quests/q1']);
    expect(changes.every((c) => c.after === undefined)).toBe(true);
  });

  it('stops after unsubscribing', async () => {
    const changes: WriteChange[] = [];
    const stop = s.onWrite((c) => changes.push(c));
    stop();
    await s.doc('t/a').set({ n: 1 });
    expect(changes).toEqual([]);
  });
});
