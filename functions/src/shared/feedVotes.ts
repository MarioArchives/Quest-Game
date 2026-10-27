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

/** The entries that can hold the top of the log book: a player's own (a frame or an exposure is about them, not by them). */
export const TOP_FEED_TYPES = ['approved', 'checkin-answer', 'global-won'] as const;

/** Whether a post can hold the top entry at all (one of a player's own entries). */
export function canHoldTop(post: Pick<FeedItem, 'type' | 'uid'>): boolean {
  return !!post.uid && (TOP_FEED_TYPES as readonly string[]).includes(post.type);
}

/** Whether a post is a votable entry about a player (what "Yours · credible n · doubtful n" is shown on). */
export function isVotableAbout(post: Pick<FeedItem, 'type' | 'uid'>): boolean {
  return !!post.uid && (VOTABLE_FEED_TYPES as readonly string[]).includes(post.type);
}
