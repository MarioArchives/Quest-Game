import { describe, expect, it } from 'vitest';
import { canHoldTop, takesVote, VOTABLE_FEED_TYPES } from './feedVotes.ts';

describe('takesVote', () => {
  it('takes a vote on a votable post about another player', () => {
    for (const type of VOTABLE_FEED_TYPES) expect(takesVote({ type, uid: 'a' }, 'b')).toBe(true);
  });
  it('refuses notices and other types', () => {
    for (const type of ['standing', 'story-beat', 'status', 'announcement', 'global-open', 'police-line', 'fraud', 'rejected', 'join'] as const) {
      expect(takesVote({ type, uid: 'a' }, 'b'), type).toBe(false);
    }
  });
  it('refuses a post with no player, your own post, and one you acted on', () => {
    expect(takesVote({ type: 'approved', uid: null }, 'b')).toBe(false);
    expect(takesVote({ type: 'approved', uid: 'b' }, 'b')).toBe(false);
    expect(takesVote({ type: 'exposed', uid: 'a', actorUid: 'b' }, 'b')).toBe(false);
    expect(takesVote({ type: 'exposed', uid: 'a', actorUid: 'b' }, 'c')).toBe(true);
  });
  it('canHoldTop ignores the voter', () => {
    expect(canHoldTop({ type: 'approved', uid: 'a' })).toBe(true);
    expect(canHoldTop({ type: 'standing', uid: 'a' })).toBe(false);
    expect(canHoldTop({ type: 'approved', uid: null })).toBe(false);
  });
});
