// Revision 5 R9: which bottom-bar tabs show a notification dot.
import { describe, expect, it } from 'vitest';
import { tabBadges, type BadgeInput } from './badges';

const NOW = Date.parse('2026-10-10T20:00:00Z');
const MIN = 60_000;

function input(over: Partial<BadgeInput> = {}): BadgeInput {
  return {
    uid: 'me',
    isGM: false,
    now: NOW,
    gameStatus: 'active',
    feed: [],
    lastSeen: {},
    witnessRequests: 0,
    myClaims: [],
    pendingJoins: 0,
    sideQuests: [],
    ...over,
  };
}

const none = { home: false, account: false, gm: false, wrap: false };

describe('tabBadges', () => {
  it('shows nothing when nothing has happened', () => {
    expect(tabBadges(input())).toEqual(none);
  });

  describe('home', () => {
    it('lights up for a post by someone else since Home was last seen', () => {
      const feed = [{ uid: 'sam', createdAt: NOW - 2 * MIN }];
      expect(tabBadges(input({ feed, lastSeen: { home: NOW - 5 * MIN } })).home).toBe(true);
      expect(tabBadges(input({ feed, lastSeen: { home: NOW - 1 * MIN } })).home).toBe(false);
    });

    it('counts game and GM posts (no uid), but never your own posts', () => {
      expect(tabBadges(input({ feed: [{ uid: null, createdAt: NOW - MIN }], lastSeen: { home: NOW - 5 * MIN } })).home).toBe(true);
      expect(tabBadges(input({ feed: [{ uid: 'me', createdAt: NOW - MIN }], lastSeen: { home: NOW - 5 * MIN } })).home).toBe(false);
    });

    it('treats a device that never opened Home as having seen nothing', () => {
      expect(tabBadges(input({ feed: [{ uid: 'sam', createdAt: NOW - 60 * MIN }] })).home).toBe(true);
    });
  });

  describe('account', () => {
    it('lights up while someone has asked you to be their witness', () => {
      expect(tabBadges(input({ witnessRequests: 1 })).account).toBe(true);
    });

    it('lights up when one of your claims was approved or rejected since Account was last seen', () => {
      const reviewed = (status: 'approved' | 'rejected') => [
        { kind: 'personal' as const, status, reviewedAt: NOW - 2 * MIN, hasEvidence: true },
      ];
      expect(tabBadges(input({ myClaims: reviewed('approved'), lastSeen: { account: NOW - 5 * MIN } })).account).toBe(true);
      expect(tabBadges(input({ myClaims: reviewed('rejected'), lastSeen: { account: NOW - 5 * MIN } })).account).toBe(true);
      expect(tabBadges(input({ myClaims: reviewed('rejected'), lastSeen: { account: NOW - MIN } })).account).toBe(false);
    });

    it('lights up while an approved claim is waiting for evidence, unless you dismissed it', () => {
      const claim = { kind: 'personal' as const, status: 'approved' as const, reviewedAt: NOW - 60 * MIN, hasEvidence: false };
      expect(tabBadges(input({ myClaims: [claim], lastSeen: { account: NOW } })).account).toBe(true);
      expect(tabBadges(input({ myClaims: [{ ...claim, evidenceDismissed: true }], lastSeen: { account: NOW } })).account).toBe(false);
      expect(tabBadges(input({ myClaims: [{ ...claim, hasEvidence: true }], lastSeen: { account: NOW } })).account).toBe(false);
    });

    it('ignores pending claims and side-quest entries waiting to be revealed', () => {
      const myClaims = [
        { kind: 'personal' as const, status: 'pending' as const, reviewedAt: null, hasEvidence: false },
        { kind: 'global' as const, status: 'sealed' as const, reviewedAt: null, hasEvidence: true },
      ];
      expect(tabBadges(input({ myClaims, lastSeen: { account: NOW - 60 * MIN } })).account).toBe(false);
    });
  });

  describe('gm', () => {
    it('lights up for a GM with join requests waiting', () => {
      expect(tabBadges(input({ isGM: true, pendingJoins: 2 })).gm).toBe(true);
    });

    it('lights up for a live side quest past its window, or voting past its end', () => {
      expect(tabBadges(input({ isGM: true, sideQuests: [{ status: 'live', endsAt: NOW - MIN, votingEndsAt: null }] })).gm).toBe(true);
      expect(tabBadges(input({ isGM: true, sideQuests: [{ status: 'voting', endsAt: NOW - 30 * MIN, votingEndsAt: NOW - MIN }] })).gm).toBe(true);
      expect(tabBadges(input({ isGM: true, sideQuests: [{ status: 'live', endsAt: NOW + MIN, votingEndsAt: null }] })).gm).toBe(false);
      expect(tabBadges(input({ isGM: true, sideQuests: [{ status: 'closed', endsAt: NOW - 90 * MIN, votingEndsAt: NOW - 60 * MIN }] })).gm).toBe(false);
    });

    it('never lights up for someone who is not a GM', () => {
      expect(tabBadges(input({ isGM: false, pendingJoins: 3, sideQuests: [{ status: 'live', endsAt: NOW - MIN, votingEndsAt: null }] })).gm).toBe(false);
    });
  });

  describe('wrap', () => {
    it('lights up once the game has ended, until the wrap has been opened', () => {
      expect(tabBadges(input({ gameStatus: 'ended' })).wrap).toBe(true);
      expect(tabBadges(input({ gameStatus: 'ended', lastSeen: { wrap: NOW - MIN } })).wrap).toBe(false);
      expect(tabBadges(input({ gameStatus: 'active' })).wrap).toBe(false);
    });
  });
});
