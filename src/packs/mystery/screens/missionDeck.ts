// The Missions tab (the missions-active mockups, C2): what needs you as folders in a stack, soonest deadline in front;
// under it what you're in and can still change, then what's filed tonight and what comes next. Pure, so it is
// testable; useMissionDeck.ts turns the game's docs into these shapes (times in ms).
import type { Mark } from '../../../lib/missionTabs';
import type { VoteStyle } from '../../../shared';

/** The three kinds of mission. */
export type DeckKind = 'group' | 'periodic' | 'story';

/** What the stack needs of an open mission. */
export interface OpenMission {
  id: string;
  /** When its clock runs out (entries or the vote closing, the answer window); null while the GM checks the entries. */
  deadlineMs: number | null;
  /** When it opened. */
  startsMs: number;
}

/** Soonest deadline first, the ones with no clock after them; ties by when they opened, then by id. */
export function byDeadline<M extends OpenMission>(missions: M[]): M[] {
  const clock = (m: M) => m.deadlineMs ?? Infinity;
  return [...missions].sort((a, b) => clock(a) - clock(b) || a.startsMs - b.startsMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The stack's order, front first. Until the viewer moves a folder (`held` null) it is the deadline order; after that
 * it is theirs, with the ones that closed taken out and newly opened ones put at the back.
 */
export function stackOrder(deadline: string[], held: string[] | null): string[] {
  if (!held) return deadline;
  const open = new Set(deadline);
  const kept = held.filter((id) => open.has(id));
  return [...kept, ...deadline.filter((id) => !kept.includes(id))];
}

/** Swiped away: the front folder goes to the back. */
export const sendBack = (order: string[]): string[] => (order.length > 1 ? [...order.slice(1), order[0]!] : order);

/** A tab tapped: its folder comes to the front, and the rest keep their order. */
export const pullForward = (order: string[], id: string): string[] => (order.includes(id) ? [id, ...order.filter((x) => x !== id)] : order);

/** Folders shown in the stack; past this the rest wait behind a "+n" tab. */
export const STACK_MAX = 4;

/**
 * Where each shown folder's tab sits, left to right: in deadline order, so a folder keeps its tab's place however
 * the stack is shuffled. `shown` is the stack's front slice.
 */
export function tabSlots(deadline: string[], shown: string[]): Map<string, number> {
  return new Map(deadline.filter((id) => shown.includes(id)).map((id, slot) => [id, slot]));
}

/**
 * The name on a folder's tab: without a leading "The" / "A" or a closing mark, and when that is too long, its longest
 * word ("Pocket lottery" → "Lottery").
 */
export function shortName(title: string, max = 10): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const plain = title
    .trim()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[.!?…:;,]+$/u, '')
    .trim();
  if (plain.length <= max) return cap(plain);
  const words = plain.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  const longest = words.reduce((best, w) => (w.length >= best.length ? w : best), '');
  if (longest && longest.length <= max) return cap(longest);
  return `${cap(plain.slice(0, max - 1).trimEnd())}…`;
}

/**
 * The story's chapters: the chapter number of each story mission (its place in the pack's story), and the numbers
 * not fired yet, which stay sealed (their titles never show).
 */
export function storyChapters(story: Array<{ id: string }>, firedStoryIds: Array<string | null | undefined>): { chapterOf: Map<string, number>; sealed: number[] } {
  const chapterOf = new Map(story.map((s, i) => [s.id, i + 1]));
  const fired = new Set(firedStoryIds.filter((id): id is string => Boolean(id)));
  return { chapterOf, sealed: story.filter((s) => !fired.has(s.id)).map((s) => chapterOf.get(s.id)!) };
}

/**
 * The story's announcements that have fired, in the story's order, as revealed notes (they never open as folders).
 * `fired` is every story mission's id that has a side quest, whatever its state.
 */
export function announcementsFired<S extends { id: string; kind?: 'mission' | 'announce' }>(story: S[], firedStoryIds: Array<string | null | undefined>): S[] {
  const fired = new Set(firedStoryIds.filter((id): id is string => Boolean(id)));
  return story.filter((s) => s.kind === 'announce' && fired.has(s.id));
}

/**
 * Your mark on a closed check-in: answered (✓), fined for missing it (✗), or none. Closing names who missed it (when
 * it charges), so someone who was asked and isn't named answered; a GM's call-off without fines names nobody, and then
 * only an answer seen in the feed counts.
 */
export function checkinMark(
  c: { missedUids: string[]; endedBy?: 'time' | 'gm'; startsMs: number },
  you: { uid: string | null; joinedMs: number | null; answered: boolean },
): Mark | null {
  if (!you.uid) return null;
  if (c.missedUids.includes(you.uid)) return 'missed';
  if (you.answered) return 'entered';
  const charged = c.endedBy === 'time' || c.missedUids.length > 0;
  const asked = you.joinedMs !== null && you.joinedMs <= c.startsMs;
  return charged && asked ? 'entered' : null;
}

/** What one open mission's row (and its folder) says about you. */
export interface YouNow {
  /** A player still in the game (a GM who only runs it is never asked). */
  playing: boolean;
  /** Entered, answered or voted, as the mission's state asks. */
  done: boolean;
  /** Voting with nothing to vote for (your own entry only). */
  nothingToVote?: boolean;
}

/** The rule on a group or story mission's folder: "+3 each, the fastest +2 · −3 if you don't". */
export function missionRule(m: { judging?: 'vote' | 'submit'; bonusPoints: number; fastestBonus?: number }, fine: number, style: VoteStyle = 'pick'): string {
  const fast = m.fastestBonus ?? 0;
  const pays =
    (m.judging ?? 'vote') === 'submit'
      ? `+${m.bonusPoints} each${fast > 0 ? `, the fastest +${fast}` : ''}`
      : `${style === 'yesno' ? 'Most yes (less no)' : 'Most votes'} wins +${m.bonusPoints}${fast > 0 ? `, the fastest entry +${fast}` : ''}`;
  return `${pays}${fine > 0 ? ` · −${fine} if you don’t` : ''}`;
}

/** The rule on a periodic mission's folder: "−5 if you don't · one answer, a photo or a comment". */
export function checkinRule(penalty: number): string {
  return `${penalty > 0 ? `−${penalty} if you don’t` : 'No fine'} · one answer, a photo or a comment`;
}

/**
 * Whether an open mission sits under Still open rather than in the stack: a group or story mission you're in while it
 * still takes entries, so you can change yours. Everything else open (what needs you, a vote, entries being checked,
 * a roll call, answered or not) stays in the stack.
 */
export function isStillOpen(m: { kind: DeckKind; status: 'live' | 'checking' | 'voting'; you: YouNow }): boolean {
  return m.kind !== 'periodic' && m.status === 'live' && m.you.playing && m.you.done;
}

/** The Live heading's aside: "2 need you · tap a tab", "1 needs you", "nothing needs you". */
export function liveAside(need: number, folders: number): string {
  const head = need === 0 ? 'nothing needs you' : `${need} ${need === 1 ? 'needs' : 'need'} you`;
  return folders > 1 ? `${head} · tap a tab` : head;
}

/**
 * The line under what's filed: "Next: roll call at 23:00 · random drops on · 2 chapters sealed". The next roll call is
 * the GM's only (players can't read the series); null when there is nothing to say.
 */
export function nextLine(o: { checkin: { name: string; clock: string } | null; groups: boolean; drops: boolean; sealed: number; gm: string }): string | null {
  const parts = [
    o.checkin ? `${o.checkin.name.charAt(0).toLowerCase()}${o.checkin.name.slice(1)} at ${o.checkin.clock}` : null,
    o.groups ? (o.drops ? 'random drops on' : `group events from the ${o.gm}`) : null,
    o.sealed > 0 ? `${o.sealed} ${o.sealed === 1 ? 'chapter' : 'chapters'} sealed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Next: ${parts.join(' · ')}` : null;
}
