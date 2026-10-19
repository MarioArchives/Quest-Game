import type { GameStatus, GlobalQuestStatus, SubmissionKind, SubmissionStatus } from '../../functions/src/shared/types';

export interface BadgeInput {
  uid: string;
  isGM: boolean;
  /** Epoch ms. */
  now: number;
  gameStatus: GameStatus;
  /**
   * Feed posts (uid = whose post; null for game/GM posts), createdAt in epoch ms; with a feed tab, also their type and
   * ref (to find the check-ins still open and the ones you have answered).
   */
  feed: ReadonlyArray<{ uid: string | null; createdAt: number; type?: string; ref?: string | null }>;
  /** When this device last opened each tab (epoch ms), if ever. */
  lastSeen: { home?: number; feed?: number; account?: number; wrap?: number };
  /** Pending claims that name this player as witness. */
  witnessRequests: number;
  /** This player's own claims / entries. */
  myClaims: ReadonlyArray<{
    kind: SubmissionKind;
    /** The side quest an entry is for (kind global). */
    questId?: string;
    status: SubmissionStatus;
    reviewedAt: number | null;
    hasEvidence: boolean;
    evidenceDismissed?: boolean;
  }>;
  /** GM only: join requests waiting. */
  pendingJoins: number;
  sideQuests: ReadonlyArray<{ id?: string; status: GlobalQuestStatus; endsAt: number; votingEndsAt: number | null }>;
  /**
   * The pack has its own Feed tab (`look.screens.feed`): new posts light Feed instead of Home, and Home lights while
   * something there needs you (see `missionsNeedYou`).
   */
  feedTab?: boolean;
  /** You are a player still in the game (not a GM who only runs it, not gone). */
  playing?: boolean;
}

/**
 * With a feed tab, Home's dot: you are playing and a side quest is live with no entry from you (while the game runs),
 * or a check-in opened in the feed has neither closed nor had your answer.
 */
export function missionsNeedYou(input: Pick<BadgeInput, 'uid' | 'now' | 'gameStatus' | 'feed' | 'myClaims' | 'sideQuests' | 'playing'>): boolean {
  const { uid, now, gameStatus, feed, myClaims, sideQuests, playing } = input;
  if (!playing || !uid || gameStatus === 'ended') return false;
  const entered = new Set(myClaims.filter((c) => c.kind === 'global' && c.status !== 'rejected' && c.questId).map((c) => c.questId));
  const toEnter = gameStatus === 'active' && sideQuests.some((q) => q.status === 'live' && q.endsAt > now && q.id !== undefined && !entered.has(q.id));
  if (toEnter) return true;
  const opened = new Set<string>();
  const done = new Set<string>();
  for (const post of feed) {
    if (!post.ref) continue;
    if (post.type === 'checkin-open') opened.add(post.ref);
    else if (post.type === 'checkin-closed' || (post.type === 'checkin-answer' && post.uid === uid)) done.add(post.ref);
  }
  return [...opened].some((ref) => !done.has(ref));
}

/**
 * Which bottom-bar tabs get a notification dot.
 * - home: a post by someone else (or a game/GM post) newer than when Home was last seen; with a feed tab, that goes to
 *   feed (since Feed was last seen) and home is the missions that need you.
 * - feed: see home (never without a feed tab).
 * - account: a witness request; one of your claims reviewed (approved/rejected) since Account was last
 *   seen; or an approved personal claim still waiting for evidence (unless dismissed).
 * - gm: GMs only — a join request waiting, side-quest entries to check, a live side quest past its window, or
 *   voting past its end.
 * - wrap: the game has ended and the wrap has not been opened on this device.
 */
export function tabBadges(input: BadgeInput): { home: boolean; feed: boolean; account: boolean; gm: boolean; wrap: boolean } {
  const { uid, isGM, now, gameStatus, feed, lastSeen, witnessRequests, myClaims, pendingJoins, sideQuests, feedTab } = input;

  // A device that never opened a tab has seen nothing (0), so everything counts as new until it does.
  const newPosts = (seen: number | undefined) => feed.some((post) => post.uid !== uid && post.createdAt > (seen ?? 0));
  const home = feedTab ? missionsNeedYou(input) : newPosts(lastSeen.home);
  const feedDot = feedTab ? newPosts(lastSeen.feed) : false;

  const accountSeen = lastSeen.account ?? 0;
  const account =
    witnessRequests > 0 ||
    myClaims.some((claim) => {
      // One of your claims was decided since you last looked (a rejected side-quest entry: not accepted, or disqualified).
      const decided = claim.status === 'approved' || claim.status === 'rejected';
      const reviewed =
        decided && (claim.kind === 'personal' || claim.status === 'rejected') && claim.reviewedAt !== null && claim.reviewedAt > accountSeen;
      // An approved claim still waiting for its photo or comment (until you wave it away).
      const needsEvidence = claim.kind === 'personal' && claim.status === 'approved' && !claim.hasEvidence && !claim.evidenceDismissed;
      return reviewed || needsEvidence;
    });

  const gm =
    isGM &&
    (pendingJoins > 0 ||
      sideQuests.some(
        (quest) =>
          quest.status === 'checking' ||
          (quest.status === 'live' && quest.endsAt <= now) ||
          (quest.status === 'voting' && quest.votingEndsAt !== null && quest.votingEndsAt <= now),
      ));

  const wrap = gameStatus === 'ended' && lastSeen.wrap === undefined;

  return { home, feed: feedDot, account, gm, wrap };
}
