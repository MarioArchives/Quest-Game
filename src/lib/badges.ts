import type { GameStatus, GlobalQuestStatus, SubmissionKind, SubmissionStatus } from '../../functions/src/shared/types';

export interface BadgeInput {
  uid: string;
  isGM: boolean;
  /** Epoch ms. */
  now: number;
  gameStatus: GameStatus;
  /** Feed posts (uid = whose post; null for game/GM posts), createdAt in epoch ms. */
  feed: ReadonlyArray<{ uid: string | null; createdAt: number }>;
  /** When this device last opened each tab (epoch ms), if ever. */
  lastSeen: { home?: number; account?: number; wrap?: number };
  /** Pending claims that name this player as witness. */
  witnessRequests: number;
  /** This player's own claims / entries. */
  myClaims: ReadonlyArray<{
    kind: SubmissionKind;
    status: SubmissionStatus;
    reviewedAt: number | null;
    hasEvidence: boolean;
    evidenceDismissed?: boolean;
  }>;
  /** GM only: join requests waiting. */
  pendingJoins: number;
  sideQuests: ReadonlyArray<{ status: GlobalQuestStatus; endsAt: number; votingEndsAt: number | null }>;
}

/**
 * Which bottom-bar tabs get a notification dot.
 * - home: a post by someone else (or a game/GM post) newer than when Home was last seen.
 * - account: a witness request; one of your claims reviewed (approved/rejected) since Account was last
 *   seen; or an approved personal claim still waiting for evidence (unless dismissed).
 * - gm: GMs only — a join request waiting, side-quest entries to check, a live side quest past its window, or
 *   voting past its end.
 * - wrap: the game has ended and the wrap has not been opened on this device.
 */
export function tabBadges(input: BadgeInput): { home: boolean; account: boolean; gm: boolean; wrap: boolean } {
  const { uid, isGM, now, gameStatus, feed, lastSeen, witnessRequests, myClaims, pendingJoins, sideQuests } = input;

  // A device that never opened a tab has seen nothing (0), so everything counts as new until it does.
  const home = feed.some((post) => post.uid !== uid && post.createdAt > (lastSeen.home ?? 0));

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

  return { home, account, gm, wrap };
}
