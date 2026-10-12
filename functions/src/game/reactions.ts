import { StoreError } from '../shared/store/errors.js';
import type { Db } from './context.js';

/** Recount reactions on a feed post and store reactionCount (idempotent). Returns the count. */
export async function recountReactions(db: Db, feedId: string): Promise<number> {
  const ref = db.doc(`feed/${feedId}`);
  if (!(await ref.get()).exists) return 0;
  const count = (await ref.collection('reactions').count().get()).data().count;
  try {
    // update() fails with not-found if the post was deleted since the check above.
    await ref.update({ reactionCount: count });
  } catch (err) {
    if (err instanceof StoreError && err.code === 'not-found') return 0;
    throw err;
  }
  return count;
}
