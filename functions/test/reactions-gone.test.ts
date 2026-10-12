// Data-layer plan edge case 16: recountReactions copes with the post vanishing between its check and its update,
// now reported as StoreError('not-found') rather than a gRPC number, and lets other errors through.
import { describe, expect, it } from 'vitest';
import { recountReactions } from '../src/game/reactions.js';
import { StoreError } from '../src/shared/store/errors.js';
import { memoryStore } from '../src/shared/store/memory.js';
import type { DocRef, Store } from '../src/shared/store/types.js';

/** A memory store whose update() of `path` fails with `error`. */
function failingUpdate(path: string, error: Error): Store {
  const inner = memoryStore();
  const wrapRef = (ref: DocRef): DocRef =>
    new Proxy(ref, {
      get(target, prop, receiver) {
        if (prop === 'update' && target.path === path) return () => Promise.reject(error);
        return Reflect.get(target, prop, receiver);
      },
    });
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'doc') return (p: string) => wrapRef(target.doc(p));
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function seedPost(db: Store) {
  await db.doc('feed/f1').set({ type: 'approved', text: 'x', reactionCount: 0 });
  await db.doc('feed/f1/reactions/u1').set({ emoji: '🔥' });
  await db.doc('feed/f1/reactions/u2').set({ emoji: '😂' });
}

describe('recountReactions', () => {
  it('stores and returns the count', async () => {
    const db = memoryStore();
    await seedPost(db);
    expect(await recountReactions(db, 'f1')).toBe(2);
    expect((await db.doc('feed/f1').get()).get('reactionCount')).toBe(2);
  });

  it('returns 0 for a post that is gone', async () => {
    expect(await recountReactions(memoryStore(), 'gone')).toBe(0);
  });

  it('returns 0 quietly when the post vanishes before the update (StoreError not-found)', async () => {
    const db = failingUpdate('feed/f1', new StoreError('not-found', 'No document to update'));
    await seedPost(db);
    await expect(recountReactions(db, 'f1')).resolves.toBe(0);
  });

  it('lets any other error through', async () => {
    const db = failingUpdate('feed/f1', new StoreError('aborted', 'contention'));
    await seedPost(db);
    await expect(recountReactions(db, 'f1')).rejects.toMatchObject({ code: 'aborted' });
  });
});
