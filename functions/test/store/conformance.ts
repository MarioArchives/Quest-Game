// Data-layer plan edge cases 1-12: one set of cases every Store must pass, run against memoryStore
// (store-memory.test.ts) and against firestoreStore on the emulator (store-firestore.test.ts).
import { describe, expect, it } from 'vitest';
import { GameError, StoreError } from '../../src/shared/store/errors.js';
import { Stamp } from '../../src/shared/store/stamp.js';
import type { DocSnap, Store } from '../../src/shared/store/types.js';

const ids = (docs: DocSnap[]) => docs.map((d) => d.id);

/** Defines the conformance cases. `store()` must give a fresh, empty store in each test. */
export function storeConformance(store: () => Store): void {
  describe('E1/E2. missing documents', () => {
    it('a missing doc does not exist and has no data or fields', async () => {
      const snap = await store().doc('things/nope').get();
      expect(snap.exists).toBe(false);
      expect(snap.id).toBe('nope');
      expect(snap.data()).toBeUndefined();
      expect(snap.get('x')).toBeUndefined();
    });

    it('deleting a missing doc is fine', async () => {
      await expect(store().doc('things/nope').delete()).resolves.toBeUndefined();
    });
  });

  describe('E3. set', () => {
    it('without merge replaces the whole doc', async () => {
      const ref = store().doc('t/a');
      await ref.set({ x: 1, m: { a: 1, b: 2 } });
      await ref.set({ y: 2 });
      expect((await ref.get()).data()).toEqual({ y: 2 });
    });

    it('with merge deep-merges maps and keeps other fields', async () => {
      const ref = store().doc('t/b');
      await ref.set({ x: 1, m: { a: 1, b: 2 } });
      await ref.set({ y: 2, m: { b: 3, c: 4 } }, { merge: true });
      expect((await ref.get()).data()).toEqual({ x: 1, y: 2, m: { a: 1, b: 3, c: 4 } });
    });

    it('with merge creates a missing doc', async () => {
      const ref = store().doc('t/new');
      await ref.set({ x: 1 }, { merge: true });
      expect((await ref.get()).data()).toEqual({ x: 1 });
    });
  });

  describe('E4. update', () => {
    it('replaces only the named top-level fields; a map value is replaced whole', async () => {
      const ref = store().doc('t/a');
      await ref.set({ x: 1, m: { a: 1, b: 2 }, keep: true });
      await ref.update({ x: 2, m: { c: 3 } });
      expect((await ref.get()).data()).toEqual({ x: 2, m: { c: 3 }, keep: true });
    });

    it('on a missing doc throws StoreError not-found', async () => {
      const err = await store().doc('t/missing').update({ x: 1 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'not-found' });
    });
  });

  describe('E5. create', () => {
    it('creates a new doc', async () => {
      const ref = store().doc('t/a');
      await ref.create({ x: 1 });
      expect((await ref.get()).data()).toEqual({ x: 1 });
    });

    it('on an existing doc throws StoreError already-exists and changes nothing', async () => {
      const ref = store().doc('t/a');
      await ref.set({ x: 1 });
      const err = await ref.create({ x: 2 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'already-exists' });
      expect((await ref.get()).data()).toEqual({ x: 1 });
    });
  });

  describe('E6. ids', () => {
    it('auto ids are unique, 20 characters, and usable before anything is written', async () => {
      const col = store().collection('t');
      const a = col.doc();
      const b = col.doc();
      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(a.path).toBe(`t/${a.id}`);
      expect((await a.get()).exists).toBe(false);
      await a.set({ x: 1 });
      expect((await store().doc(`t/${a.id}`).get()).data()).toEqual({ x: 1 });
    });

    it('custom ids and nested paths work', async () => {
      expect(store().collection('t').doc('custom').path).toBe('t/custom');
      expect(store().doc('players/u1/quests/q1').id).toBe('q1');
      expect(store().collection('players/u1/quests').path).toBe('players/u1/quests');
      expect(store().collection('players/u1/quests').id).toBe('quests');
      expect(store().doc('players/u1').collection('quests').path).toBe('players/u1/quests');
    });
  });

  describe('E7. queries', () => {
    async function seed() {
      const s = store();
      // Written out of id order on purpose.
      await s.doc('t/c').set({ kind: 'x', n: 3, active: true });
      await s.doc('t/a').set({ kind: 'x', n: 1, active: true, tag: 'p' });
      await s.doc('t/d').set({ n: 4 });
      await s.doc('t/b').set({ kind: 'y', n: 2, active: 'true' });
      return s;
    }

    it('with no orderBy, results come back in doc-id order', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').get()).docs)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('== on one field, then on two', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').where('kind', '==', 'x').get()).docs)).toEqual(['a', 'c']);
      expect(ids((await s.collection('t').where('kind', '==', 'x').where('n', '==', 3).get()).docs)).toEqual(['c']);
    });

    it('a filter never matches a missing field or a value of another type', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').where('active', '==', true).get()).docs)).toEqual(['a', 'c']);
      expect(ids((await s.collection('t').where('kind', '==', null).get()).docs)).toEqual([]);
    });

    it('in matches any of up to 30 values', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').where('kind', 'in', ['x', 'y']).get()).docs)).toEqual(['a', 'b', 'c']);
      const thirty = Array.from({ length: 29 }, (_, i) => `z${i}`).concat('y');
      expect(ids((await s.collection('t').where('kind', 'in', thirty).get()).docs)).toEqual(['b']);
    });

    it('orderBy asc and desc with limit; docs without the field are left out', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').orderBy('n').get()).docs)).toEqual(['a', 'b', 'c', 'd']);
      expect(ids((await s.collection('t').orderBy('n', 'desc').limit(2).get()).docs)).toEqual(['d', 'c']);
      expect(ids((await s.collection('t').orderBy('kind').get()).docs)).toEqual(['a', 'c', 'b']);
    });

    it('orderBy combines with ==', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').where('kind', '==', 'x').orderBy('n', 'desc').get()).docs)).toEqual(['c', 'a']);
    });

    it('limit without orderBy keeps doc-id order', async () => {
      const s = await seed();
      expect(ids((await s.collection('t').limit(2).get()).docs)).toEqual(['a', 'b']);
    });

    it('select returns only the listed fields', async () => {
      const s = await seed();
      const snap = await s.collection('t').where('kind', '==', 'x').select('kind', 'tag').get();
      expect(snap.docs.map((d) => d.data())).toEqual([{ kind: 'x', tag: 'p' }, { kind: 'x' }]);
      expect(snap.docs[0]!.get('n')).toBeUndefined();
    });

    it('count, size and empty', async () => {
      const s = await seed();
      expect((await s.collection('t').where('kind', '==', 'x').count().get()).data().count).toBe(2);
      expect((await s.collection('t').count().get()).data().count).toBe(4);
      const snap = await s.collection('t').where('kind', '==', 'y').get();
      expect(snap.size).toBe(1);
      expect(snap.empty).toBe(false);
      expect((await s.collection('empty').get()).empty).toBe(true);
    });

    it('query results carry refs that can be written through', async () => {
      const s = await seed();
      const [first] = (await s.collection('t').where('kind', '==', 'y').get()).docs;
      await first!.ref.update({ n: 20 });
      expect((await s.doc('t/b').get()).get('n')).toBe(20);
    });
  });

  describe('E8. subcollections', () => {
    async function seed() {
      const s = store();
      await s.doc('p/u1').set({ name: 'one' });
      await s.doc('p/u1/quests/q1').set({ a: 1 });
      await s.doc('p/u1').collection('quests').doc('q2').set({ a: 2 });
      await s.doc('p/u1/quests/q2/notes/n1').set({ deep: true });
      await s.doc('p/u2').set({ name: 'two' });
      await s.doc('p/u2/quests/q3').set({ a: 3 });
      await s.doc('x/y/quests/q4').set({ a: 4 });
      return s;
    }

    it('nested paths and ref.collection() reach the same documents', async () => {
      const s = await seed();
      expect(ids((await s.collection('p/u1/quests').get()).docs)).toEqual(['q1', 'q2']);
      expect(ids((await s.doc('p/u1').collection('quests').get()).docs)).toEqual(['q1', 'q2']);
      expect(ids((await s.collection('p').get()).docs)).toEqual(['u1', 'u2']);
    });

    it('listDocuments returns refs', async () => {
      const s = await seed();
      const refs = await s.collection('p/u1/quests').listDocuments();
      expect(refs.map((r) => r.path).sort()).toEqual(['p/u1/quests/q1', 'p/u1/quests/q2']);
    });

    it('collectionGroup finds every collection with that id at any depth', async () => {
      const s = await seed();
      const snap = await s.collectionGroup('quests').get();
      expect(snap.docs.map((d) => d.ref.path).sort()).toEqual([
        'p/u1/quests/q1',
        'p/u1/quests/q2',
        'p/u2/quests/q3',
        'x/y/quests/q4',
      ]);
      expect((await s.collectionGroup('quests').where('a', '==', 3).get()).size).toBe(1);
    });

    it('recursiveDelete of a doc removes it and everything under it, never its siblings', async () => {
      const s = await seed();
      await s.recursiveDelete(s.doc('p/u1'));
      expect((await s.doc('p/u1').get()).exists).toBe(false);
      expect((await s.collection('p/u1/quests').get()).size).toBe(0);
      expect((await s.doc('p/u1/quests/q2/notes/n1').get()).exists).toBe(false);
      expect((await s.doc('p/u2').get()).exists).toBe(true);
      expect((await s.doc('p/u2/quests/q3').get()).exists).toBe(true);
    });

    it('recursiveDelete of a collection removes all of it and nothing else', async () => {
      const s = await seed();
      await s.recursiveDelete(s.collection('p'));
      expect((await s.collection('p').get()).size).toBe(0);
      expect((await s.collectionGroup('quests').get()).docs.map((d) => d.ref.path)).toEqual(['x/y/quests/q4']);
    });
  });

  describe('E9. batches', () => {
    it('applies set, merge, update, create and delete in order', async () => {
      const s = store();
      await s.doc('t/b').set({ x: 1, m: { a: 1 } });
      await s.doc('t/c').set({ x: 1 });
      await s.doc('t/d').set({ x: 1 });
      await s
        .batch()
        .set(s.doc('t/a'), { x: 1 })
        .set(s.doc('t/b'), { m: { b: 2 } }, { merge: true })
        .delete(s.doc('t/c'))
        .update(s.doc('t/d'), { y: 2 })
        .create(s.doc('t/e'), { z: 3 })
        .set(s.doc('t/a'), { x: 2 })
        .commit();
      expect((await s.doc('t/a').get()).data()).toEqual({ x: 2 });
      expect((await s.doc('t/b').get()).data()).toEqual({ x: 1, m: { a: 1, b: 2 } });
      expect((await s.doc('t/c').get()).exists).toBe(false);
      expect((await s.doc('t/d').get()).data()).toEqual({ x: 1, y: 2 });
      expect((await s.doc('t/e').get()).data()).toEqual({ z: 3 });
    });

    it('is all or nothing: an update of a missing doc fails the whole batch', async () => {
      const s = store();
      const err = await s.batch().set(s.doc('t/a'), { x: 1 }).update(s.doc('t/missing'), { y: 1 }).commit().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'not-found' });
      expect((await s.doc('t/a').get()).exists).toBe(false);
    });
  });

  describe('E10. transactions', () => {
    it('returns what the callback returns and applies its writes', async () => {
      const s = store();
      const out = await s.runTransaction(async (tx) => {
        const snap = await tx.get(s.doc('t/a'));
        tx.set(s.doc('t/a'), { seen: snap.exists });
        return 42;
      });
      expect(out).toBe(42);
      expect((await s.doc('t/a').get()).data()).toEqual({ seen: false });
    });

    it('a read after a write throws and nothing is written', async () => {
      const s = store();
      await expect(
        s.runTransaction(async (tx) => {
          tx.set(s.doc('t/a'), { x: 1 });
          await tx.get(s.doc('t/b'));
        }),
      ).rejects.toThrow();
      expect((await s.doc('t/a').get()).exists).toBe(false);
    });

    it('getAll keeps the order asked for and includes missing docs', async () => {
      const s = store();
      await s.doc('t/a').set({ n: 1 });
      await s.doc('t/b').set({ n: 2 });
      const snaps = await s.runTransaction((tx) => tx.getAll(s.doc('t/b'), s.doc('t/missing'), s.doc('t/a')));
      expect(snaps.map((x) => [x.id, x.exists])).toEqual([
        ['b', true],
        ['missing', false],
        ['a', true],
      ]);
    });

    it('a throw discards every buffered write and the error comes out as thrown', async () => {
      const s = store();
      await s.doc('t/a').set({ x: 1 });
      const err = await s
        .runTransaction(async (tx) => {
          await tx.get(s.doc('t/a'));
          tx.update(s.doc('t/a'), { x: 9 });
          tx.set(s.doc('t/b'), { y: 1 });
          throw new GameError('failed-precondition', 'No.', { why: 'test' });
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GameError);
      expect(err).toMatchObject({ code: 'failed-precondition', message: 'No.', details: { why: 'test' } });
      expect((await s.doc('t/a').get()).data()).toEqual({ x: 1 });
      expect((await s.doc('t/b').get()).exists).toBe(false);
    });

    it('several writes to one doc apply in order', async () => {
      const s = store();
      await s.runTransaction(async (tx) => {
        tx.set(s.doc('t/a'), { x: 1 });
        tx.update(s.doc('t/a'), { y: 2 });
        tx.update(s.doc('t/a'), { x: 3 });
      });
      expect((await s.doc('t/a').get()).data()).toEqual({ x: 3, y: 2 });
    });

    it('queries work inside a transaction, including select and limit', async () => {
      const s = store();
      await s.doc('t/a').set({ kind: 'x', n: 1 });
      await s.doc('t/b').set({ kind: 'x', n: 2 });
      await s.doc('t/c').set({ kind: 'y', n: 3 });
      const result = await s.runTransaction(async (tx) => {
        const all = await tx.get(s.collection('t').where('kind', '==', 'x'));
        const one = await tx.get(s.collection('t').where('kind', '==', 'x').limit(1));
        const slim = await tx.get(s.collection('t').select('n'));
        return { all: ids(all.docs), one: ids(one.docs), slim: slim.docs.map((d) => d.data()) };
      });
      expect(result).toEqual({ all: ['a', 'b'], one: ['a'], slim: [{ n: 1 }, { n: 2 }, { n: 3 }] });
    });

    it('create inside a transaction on an existing doc fails with already-exists and writes nothing', async () => {
      const s = store();
      await s.doc('t/a').set({ x: 1 });
      const err = await s
        .runTransaction(async (tx) => {
          tx.set(s.doc('t/b'), { y: 1 });
          tx.create(s.doc('t/a'), { x: 2 });
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'already-exists' });
      expect((await s.doc('t/b').get()).exists).toBe(false);
    });

    it('update inside a transaction on a missing doc fails with not-found', async () => {
      const s = store();
      const err = await s.runTransaction(async (tx) => {
        tx.update(s.doc('t/missing'), { x: 1 });
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'not-found' });
    });
  });

  describe('E11. concurrency', () => {
    it('two racing increments both land', async () => {
      const s = store();
      await s.doc('t/counter').set({ n: 0 });
      const bump = () =>
        s.runTransaction(async (tx) => {
          const n = (await tx.get(s.doc('t/counter'))).get('n') as number;
          tx.update(s.doc('t/counter'), { n: n + 1 });
        });
      await Promise.all([bump(), bump()]);
      expect((await s.doc('t/counter').get()).get('n')).toBe(2);
    });

    it('two racing claims on one thing: exactly one wins', async () => {
      const s = store();
      await s.doc('t/quest').set({ status: 'active' });
      const take = (who: string) =>
        s.runTransaction(async (tx) => {
          const snap = await tx.get(s.doc('t/quest'));
          if (snap.get('status') !== 'active') throw new GameError('failed-precondition', 'Too late.');
          tx.update(s.doc('t/quest'), { status: 'taken', by: who });
          tx.create(s.collection('log').doc(), { who });
        });
      const results = await Promise.allSettled([take('alice'), take('bob')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'failed-precondition' });
      expect((await s.collection('log').get()).size).toBe(1);
    });
  });

  describe('E12. values', () => {
    it('Dates and Stamps come back as Stamps with the same millis, nested ones too', async () => {
      const s = store();
      await s.doc('t/a').set({
        at: Stamp.fromMillis(1_791_640_000_123),
        when: new Date(1_791_640_000_456),
        nested: { list: [Stamp.fromMillis(5_000), { at: new Date(7_000) }] },
      });
      const data = (await s.doc('t/a').get()).data()!;
      expect(data.at).toBeInstanceOf(Stamp);
      expect(data.at.toMillis()).toBe(1_791_640_000_123);
      expect(data.when).toBeInstanceOf(Stamp);
      expect(data.when.toMillis()).toBe(1_791_640_000_456);
      expect(data.nested.list[0]).toBeInstanceOf(Stamp);
      expect(data.nested.list[0].toMillis()).toBe(5_000);
      expect(data.nested.list[1].at).toBeInstanceOf(Stamp);
      expect(data.nested.list[1].at.toMillis()).toBe(7_000);
    });

    it('Stamps work as query values', async () => {
      const s = store();
      await s.doc('t/a').set({ at: Stamp.fromMillis(1_000) });
      await s.doc('t/b').set({ at: Stamp.fromMillis(2_000) });
      expect(ids((await s.collection('t').where('at', '==', Stamp.fromMillis(2_000)).get()).docs)).toEqual(['b']);
      expect(ids((await s.collection('t').orderBy('at', 'desc').get()).docs)).toEqual(['b', 'a']);
    });

    it('null, arrays and maps round-trip', async () => {
      const s = store();
      const value = { a: null, b: [1, 'x', true, null], c: { d: { e: [] as unknown[] } }, f: 0, g: '' };
      await s.doc('t/a').set(value);
      expect((await s.doc('t/a').get()).data()).toEqual(value);
    });

    it('an undefined value is refused with StoreError invalid-argument', async () => {
      const s = store();
      for (const write of [
        () => s.doc('t/a').set({ x: undefined }),
        () => s.doc('t/a').set({ m: { x: undefined } }),
      ]) {
        const err = await write().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(StoreError);
        expect(err).toMatchObject({ code: 'invalid-argument' });
      }
      await s.doc('t/b').set({ x: 1 });
      const err = await s.doc('t/b').update({ y: undefined }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StoreError);
      expect(err).toMatchObject({ code: 'invalid-argument' });
      expect((await s.doc('t/a').get()).exists).toBe(false);
    });

    it('data read is a copy, and data written is copied', async () => {
      const s = store();
      const written = { x: 1, m: { a: 1 }, list: [1] };
      await s.doc('t/a').set(written);
      written.m.a = 2;
      written.list.push(2);
      const first = (await s.doc('t/a').get()).data()!;
      expect(first).toEqual({ x: 1, m: { a: 1 }, list: [1] });
      first.x = 99;
      first.m.a = 99;
      (first.list as number[]).push(99);
      expect((await s.doc('t/a').get()).data()).toEqual({ x: 1, m: { a: 1 }, list: [1] });
    });
  });
}
