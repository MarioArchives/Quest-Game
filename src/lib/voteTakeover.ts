// Which open vote takes over the app for a player, and how far they've got with it. Pure, so it is testable; the
// takeover's provider turns the game's docs into these shapes (times in ms).
import type { GlobalQuestStatus, Judgement, Judging, VoteStyle } from '../shared';

/** What the takeover needs of a side quest. */
export interface VoteMission {
  id: string;
  status: GlobalQuestStatus;
  /** Missing = 'vote'. */
  judging?: Judging;
  /** Missing = 'pick'. */
  voteStyle?: VoteStyle;
  votingEndsMs: number | null;
}

/** An entry up for the vote (an approved entry of that side quest). */
export interface VoteEntry {
  id: string;
  uid: string;
}

/** The player's own vote doc as far as the takeover cares (null: nothing cast yet). */
export interface MyVote {
  submissionId?: string;
  ballot?: Record<string, Judgement>;
}

export interface BallotProgress {
  style: VoteStyle;
  /** Entries the player can vote on: everyone else's. */
  total: number;
  /** yes/no: how many of those they've judged; pick: 1 once their vote is on one of them, else 0. */
  judged: number;
  /** pick: voted for an entry still standing; yes/no: judged every one. Never true with nothing to vote on. */
  finished: boolean;
}

/** How far `uid` has got with a vote. A pick on an entry that has since gone (disqualified) doesn't count. */
export function ballotProgress(m: Pick<VoteMission, 'voteStyle'>, vote: MyVote | null | undefined, entries: readonly VoteEntry[], uid: string): BallotProgress {
  const others = entries.filter((e) => e.uid !== uid);
  const total = others.length;
  if (m.voteStyle === 'yesno') {
    const judged = others.filter((e) => {
      const j = vote?.ballot?.[e.id];
      return j === 'yes' || j === 'no';
    }).length;
    return { style: 'yesno', total, judged, finished: total > 0 && judged === total };
  }
  const picked = Boolean(vote?.submissionId) && others.some((e) => e.id === vote?.submissionId);
  return { style: 'pick', total, judged: picked ? 1 : 0, finished: picked };
}

export interface NeedingInput {
  missions: readonly VoteMission[];
  /** Each side quest's entries up for the vote, by its id. */
  entriesByMission: ReadonlyMap<string, readonly VoteEntry[]>;
  /** The player's own vote doc per side quest (missing or null: nothing cast). */
  votes: ReadonlyMap<string, MyVote | null>;
  uid: string | null;
  /** Still in the game as a player (a GM who only runs it, or someone who left, is never asked). */
  playing: boolean;
  nowMs: number;
}

/**
 * The votes waiting for this player, soonest to close first (then by id): in voting, judged by a vote, before its
 * deadline, with something of someone else's to vote on, and not finished.
 */
export function votesNeedingYou(input: NeedingInput): string[] {
  const { uid } = input;
  if (!uid || !input.playing) return [];
  return input.missions
    .filter((m) => {
      if (m.status !== 'voting' || m.judging === 'submit') return false;
      if (m.votingEndsMs !== null && m.votingEndsMs <= input.nowMs) return false;
      const p = ballotProgress(m, input.votes.get(m.id), input.entriesByMission.get(m.id) ?? [], uid);
      return p.total > 0 && !p.finished;
    })
    .sort((a, b) => (a.votingEndsMs ?? Infinity) - (b.votingEndsMs ?? Infinity) || a.id.localeCompare(b.id))
    .map((m) => m.id);
}

export interface TakeoverInput {
  /** votesNeedingYou's answer. */
  needing: readonly string[];
  /** Votes put aside this session ("Back to the case"). */
  aside: ReadonlySet<string>;
  /** The vote the takeover has open (kept until Done or Back, even once finished or closed). */
  current: string | null;
  pathname: string;
  /** The player has a police check-in open: the takeover steps aside until it is over. */
  policeOpen: boolean;
  /** The game is running (not in the lobby, paused or ended). */
  gameActive: boolean;
  /** The player's votes are still loading. */
  loading: boolean;
}

/** The vote to show full screen, or null: nothing on /gm, during a police check-in, outside a running game or while loading. */
export function takeoverQuest(input: TakeoverInput): string | null {
  if (input.loading || input.policeOpen || !input.gameActive) return null;
  if (input.pathname === '/gm' || input.pathname.startsWith('/gm/')) return null;
  return input.current ?? input.needing.find((id) => !input.aside.has(id)) ?? null;
}

/** "Back to the case": every vote waiting now is put aside (a vote that opens later still takes over). */
export function putAside(aside: ReadonlySet<string>, needing: readonly string[]): Set<string> {
  return new Set([...aside, ...needing]);
}
