// The night's side quests as a row of tabs, one per side quest (a pack's Board): which ones count tonight and their
// numbers, what needs you, your mark on a closed one, which tab opens first, and a closed one's result. Pure, so it
// is testable; the screen turns the game's docs into these shapes (times in ms).
import { entryVotesText, type GlobalQuest, type GlobalQuestStatus, type Judging, type VoteStyle } from '../shared';

/** What the tabs need of a side quest. */
export interface MissionLike {
  id: string;
  status: GlobalQuestStatus;
  /** When it opened. */
  startsMs: number;
  /** Missing = 'vote'. */
  judging?: Judging;
  winnerUids?: string[];
  winningSubmissionIds?: string[];
  /** Votes per entry (submission id), once voting has closed. */
  tally?: Record<string, number> | null;
  /** How its vote was cast; missing = one vote each. */
  voteStyle?: VoteStyle;
  /** A yes/no vote's yeses and noes per entry, once counted (the tally then holds yes − no). */
  yesNo?: GlobalQuest['yesNo'];
  fastestBonus?: number;
  fastestSubmissionId?: string | null;
}

export interface Numbered<Q> {
  mission: Q;
  /** 1 = the night's first. */
  number: number;
}

/**
 * Tonight's side quests: the ones opened since the game started (every one, before it has), newest first, each
 * numbered in the order they opened.
 */
export function tonight<Q extends MissionLike>(missions: Q[], startedMs: number | null): Numbered<Q>[] {
  const since = startedMs && startedMs > 0 ? startedMs : null;
  return missions
    .filter((m) => since === null || m.startsMs >= since)
    .sort((a, b) => a.startsMs - b.startsMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((mission, i) => ({ mission, number: i + 1 }))
    .reverse();
}

/** What one viewer has done about one side quest. */
export interface YourPart {
  /** The viewer's uid (null when signed out). */
  uid: string | null;
  /** A player still in the game: a GM who only runs it, or a player who has left, is never asked for anything. */
  playing: boolean;
  /** The viewer's entries still standing in it (hidden or revealed; thrown-out ones don't count). */
  entryIds: string[];
  /** The viewer has voted on it (votes are secret: only this device knows). */
  voted: boolean;
  /** Someone else has an entry the viewer could vote for. */
  canVote: boolean;
  /** The viewer was in the game when it opened, so not entering counts as missing it. */
  wasIn: boolean;
}

/** True when you were in the game for a side quest opened at `startsMs`: joined by then, and not gone before it. */
export function wasIn(joinedMs: number, leftMs: number | null, startsMs: number): boolean {
  return joinedMs <= startsMs && !(leftMs !== null && leftMs > 0 && leftMs <= startsMs);
}

/** It needs you: live and you haven't entered, or voting and you haven't voted (with something to vote for). */
export function needsYou(m: MissionLike, you: YourPart): boolean {
  if (!you.playing) return false;
  if (m.status === 'live') return you.entryIds.length === 0;
  if (m.status === 'voting') return (m.judging ?? 'vote') === 'vote' && you.canVote && !you.voted;
  return false;
}

/** Your mark on a closed side quest: won (a Vote's winner, a Submit's fastest), entered, or missed. */
export type Mark = 'won' | 'entered' | 'missed';

/** Your mark once it has closed; null while it is open, or when it was never yours to enter. */
export function yourMark(m: MissionLike, you: YourPart): Mark | null {
  if (m.status !== 'closed' || !you.uid) return null;
  if (you.entryIds.length > 0) {
    const won =
      (m.judging ?? 'vote') === 'submit'
        ? Boolean(m.fastestSubmissionId && you.entryIds.includes(m.fastestSubmissionId))
        : (m.winnerUids ?? []).includes(you.uid);
    return won ? 'won' : 'entered';
  }
  return you.wasIn ? 'missed' : null;
}

/**
 * The tab to open on (tabs newest first): the newest live one you haven't entered, else the newest vote you haven't
 * cast, else the newest. Null when there are none.
 */
export function defaultTab(tabs: Array<{ id: string; status: GlobalQuestStatus; needsYou: boolean }>): string | null {
  const pick = tabs.find((t) => t.status === 'live' && t.needsYou) ?? tabs.find((t) => t.status === 'voting' && t.needsYou) ?? tabs[0];
  return pick?.id ?? null;
}

/** Past this many tabs, closed ones slim down to their number and your mark. */
export const SLIM_AFTER = 5;
export const slimClosed = (count: number): boolean => count > SLIM_AFTER;

/** A live tab's time left, short enough for a narrow tab: "12:04", "1h05" past the hour, "00:00" once it is up. */
export function tabClock(endsMs: number, nowMs: number): string {
  const left = Math.max(0, Math.ceil((endsMs - nowMs) / 1000));
  const hours = Math.floor(left / 3600);
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
  return hours > 0 ? `${hours}h${mm}` : `${mm}:${String(left % 60).padStart(2, '0')}`;
}

/** A tab's accessible name: "No. 4, The line-up: live, you haven't entered". */
export function tabLabel(number: number, title: string, m: MissionLike, you: YourPart): string {
  const needs = needsYou(m, you);
  let state: string;
  if (m.status === 'live') state = you.entryIds.length > 0 ? 'live, you’re in' : needs ? 'live, you haven’t entered' : 'live';
  else if (m.status === 'checking') state = 'entries being checked';
  else if (m.status === 'voting') state = you.voted ? 'voting, you voted' : needs ? 'voting, you haven’t voted' : 'voting';
  else {
    const mark = yourMark(m, you);
    state =
      mark === 'won'
        ? (m.judging ?? 'vote') === 'submit'
          ? 'closed, you were fastest'
          : 'closed, you won'
        : mark === 'entered'
          ? 'closed, you were in'
          : mark === 'missed'
            ? 'closed, you missed it'
            : 'closed';
  }
  return `No. ${number}, ${title}: ${state}`;
}

/**
 * When a closed side quest was scored, from its closing post in the feed (newest first): a Submit's summary, or a
 * Vote's winner post. Null when there is none in the feed (no winner, or the post has scrolled out).
 */
export function filedAtMs(m: MissionLike, feed: Array<{ type: string; ref: string | null; ms: number }>): number | null {
  const wins = new Set(m.winningSubmissionIds ?? []);
  const post = feed.find((p) => (p.type === 'global-scored' && p.ref === m.id) || (p.type === 'global-won' && p.ref !== null && wins.has(p.ref)));
  return post ? post.ms : null;
}

/** What a closed side quest paid, in the past tense: "No vote: every entry earned +3, the fastest +2 more. No entry cost −3." */
export function filedRule(m: { judging?: Judging; bonusPoints: number; fastestBonus?: number; voteStyle?: VoteStyle }, fine: number): string {
  const fast = m.fastestBonus ?? 0;
  const fined = fine > 0 ? ` No entry cost −${fine}.` : '';
  if ((m.judging ?? 'vote') === 'submit') return `No vote: every entry earned +${m.bonusPoints}${fast > 0 ? `, the fastest +${fast} more` : ''}.${fined}`;
  const most = m.voteStyle === 'yesno' ? 'Most yes (less no)' : 'Most votes';
  return `${most} won +${m.bonusPoints}${fast > 0 ? `, the fastest entry +${fast}` : ''}. Ties all won.${fined}`;
}

/** An entry still standing in a closed side quest. */
export interface EntryLike {
  id: string;
  uid: string;
  createdMs: number;
}

/** A points line naming the side quest (pointsLedger where ref = its id). */
export interface LineLike {
  uid: string;
  delta: number;
  reason: string;
}

export interface MissionResult<E> {
  /** A Vote's winning entries (with their votes, when counted), or a Submit's fastest entry. */
  leads: Array<{ entry: E; votes: number | null; words: string | null }>;
  /** A Vote's fastest entry, when it paid a fastest bonus and isn't a winner. */
  fastest: E | null;
  /** A Vote's count, most votes first (entries with none are left out). A yes/no vote lists every entry with a yes or a no, highest yes − no first, and `votes` is that net. */
  votes: Array<{ entry: E; votes: number; words: string }>;
  /** Everyone whose entry stood, in the order they entered. */
  entered: string[];
  /** Who paid the fine for not entering, and how much (as applied). */
  fined: Array<{ uid: string; delta: number }>;
}

/**
 * A closed side quest's result from what the app can read: its entries still standing (revealed, so approved), and
 * the points lines that name it (the fines for not entering).
 */
export function missionResult<E extends EntryLike>(m: MissionLike, entries: E[], lines: LineLike[]): MissionResult<E> {
  const ordered = [...entries].sort((a, b) => a.createdMs - b.createdMs || (a.id < b.id ? -1 : 1));
  const byId = new Map(ordered.map((e) => [e.id, e]));
  const fastestEntry = m.fastestSubmissionId ? (byId.get(m.fastestSubmissionId) ?? null) : null;

  let leads: MissionResult<E>['leads'];
  let fastest: E | null = null;
  let votes: MissionResult<E>['votes'] = [];
  if ((m.judging ?? 'vote') === 'submit') {
    leads = fastestEntry ? [{ entry: fastestEntry, votes: null, words: null }] : [];
  } else {
    const winners = (m.winningSubmissionIds ?? []).map((id) => byId.get(id)).filter((e): e is E => Boolean(e));
    leads = winners.map((entry) => ({ entry, votes: m.tally?.[entry.id] ?? null, words: entryVotesText(m, entry.id) }));
    if (fastestEntry && (m.fastestBonus ?? 0) > 0 && !winners.includes(fastestEntry)) fastest = fastestEntry;
    if (m.voteStyle === 'yesno') {
      votes = ordered
        .filter((entry) => (m.yesNo?.[entry.id]?.yes ?? 0) + (m.yesNo?.[entry.id]?.no ?? 0) > 0)
        .map((entry) => ({ entry, votes: m.tally?.[entry.id] ?? (m.yesNo?.[entry.id]?.yes ?? 0) - (m.yesNo?.[entry.id]?.no ?? 0), words: entryVotesText(m, entry.id) ?? '' }))
        .sort((a, b) => b.votes - a.votes);
    } else {
      votes = ordered
        .map((entry) => ({ entry, votes: m.tally?.[entry.id] ?? 0, words: entryVotesText(m, entry.id) ?? '' }))
        .filter((v) => v.votes > 0)
        .sort((a, b) => b.votes - a.votes);
    }
  }

  const entered: string[] = [];
  for (const e of ordered) if (!entered.includes(e.uid)) entered.push(e.uid);

  const fines = new Map<string, number>();
  for (const line of lines) if (line.reason === 'skipped') fines.set(line.uid, (fines.get(line.uid) ?? 0) + line.delta);
  const fined = [...fines].map(([uid, delta]) => ({ uid, delta }));

  return { leads, fastest, votes, entered, fined };
}
