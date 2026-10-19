// Which feed posts take a Credible / Doubtful vote (packs with `reactions: 'votes'`). An allow-list, so feed types
// added later take no votes until they are listed here. firestore.rules mirrors it (a test checks the two agree).
import type { FeedItem } from './types.ts';

export const VOTABLE_FEED_TYPES = ['approved', 'checkin-answer', 'framed', 'exposed', 'global-won', 'police-tip'] as const;

/** Whether `voter` may vote on `post`: it is about a player, of a votable type, and not the voter's own. */
export function takesVote(post: Pick<FeedItem, 'type' | 'uid' | 'actorUid'>, voter: string): boolean {
  return (
    !!post.uid &&
    (VOTABLE_FEED_TYPES as readonly string[]).includes(post.type) &&
    post.uid !== voter &&
    post.actorUid !== voter
  );
}

/** Whether a post can hold the top entry at all (a votable type about a player). */
export function canHoldTop(post: Pick<FeedItem, 'type' | 'uid'>): boolean {
  return !!post.uid && (VOTABLE_FEED_TYPES as readonly string[]).includes(post.type);
}
