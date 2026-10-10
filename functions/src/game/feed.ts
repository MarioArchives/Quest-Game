import type { Transaction } from 'firebase-admin/firestore';
import type { FeedItem } from '../shared/types.js';
import type { Db } from './context.js';
import { toTs } from './util.js';

export type FeedInput = Omit<FeedItem, 'createdAt' | 'reactionCount'>;

let sequence = 0;

/**
 * Post ids sort in creation order (event time, then a per-process counter, then randomness), so posts
 * made at the same instant keep a stable, chronological order when read back by id.
 */
function postId(now: Date): string {
  sequence = (sequence + 1) % 36 ** 5;
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return now.getTime().toString(36).padStart(9, '0') + sequence.toString(36).padStart(5, '0') + random;
}

/** Adds a post to the Home feed (reactions start at 0). Returns the new post id. */
export function addFeed(tx: Transaction, db: Db, now: Date, item: FeedInput): string {
  const ref = db.collection('feed').doc(postId(now));
  const post: Record<string, unknown> = {};
  // Firestore rejects undefined values, so only copy what was given.
  for (const [key, value] of Object.entries(item)) if (value !== undefined) post[key] = value;
  tx.create(ref, { ...post, createdAt: toTs(now), reactionCount: 0 });
  return ref.id;
}
