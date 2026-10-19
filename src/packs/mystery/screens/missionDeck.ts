// The Missions tab (option E, "the stack"): every open mission as a folder in a stack, soonest deadline in front, and
// the night's three kinds below as index dividers (group events, periodic missions, story missions). Pure, so it is
// testable; MissionsTab.tsx turns the game's docs into these shapes (times in ms).
import type { Mark } from '../../../lib/missionTabs';

/** The three kinds of mission, as the dividers file them. */
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
 * The name on a folder's tab and the chip that matches it in the dividers: without a leading "The" / "A" or a closing
 * mark, and when that is too long, its longest word ("Pocket lottery" → "Lottery").
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

/** Chapter numbers as ranges: [3, 4, 5, 6, 7] → "3–7", [3, 5, 6, 7] → "3, 5–7", [4] → "4". */
export function rangeLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(', ');
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

export type Tone = 'hot' | 'ok' | 'plain';

/**
 * An open mission's line in the dividers: "18:20 left · you're in", "09:12 left · not answered", "vote · 04:12 left ·
 * not voted", "entries being checked". `clock` is the time left; red (hot) while it needs you.
 */
export function openLine(
  kind: DeckKind,
  status: 'live' | 'checking' | 'voting',
  clock: string | null,
  you: YouNow,
  /** A long-running mission: after its deadline it waits for its vote rather than a GM's check. */
  opts: { longRun?: boolean } = {},
): { text: string; tone: Tone } {
  if (status === 'checking' && opts.longRun) return { text: 'entries closed · vote opens later', tone: 'plain' };
  if (status === 'checking') return { text: 'entries being checked', tone: 'plain' };
  const left = clock ? `${clock} left` : 'time’s up';
  if (status === 'voting') {
    if (!you.playing || you.nothingToVote) return { text: `vote · ${left}`, tone: 'plain' };
    return you.done ? { text: `vote · ${left} · you voted`, tone: 'ok' } : { text: `vote · ${left} · not voted`, tone: 'hot' };
  }
  if (!you.playing) return { text: left, tone: 'plain' };
  if (kind === 'periodic') return you.done ? { text: `${left} · answered`, tone: 'ok' } : { text: `${left} · not answered`, tone: 'hot' };
  return you.done ? { text: `${left} · you’re in`, tone: 'ok' } : { text: `${left} · not in`, tone: 'hot' };
}

/** The rule on a group or story mission's folder: "+3 each, the fastest +2 · −3 if you don't". */
export function missionRule(m: { judging?: 'vote' | 'submit'; bonusPoints: number; fastestBonus?: number }, fine: number): string {
  const fast = m.fastestBonus ?? 0;
  const pays =
    (m.judging ?? 'vote') === 'submit'
      ? `+${m.bonusPoints} each${fast > 0 ? `, the fastest +${fast}` : ''}`
      : `Most votes wins +${m.bonusPoints}${fast > 0 ? `, the fastest entry +${fast}` : ''}`;
  return `${pays}${fine > 0 ? ` · −${fine} if you don’t` : ''}`;
}

/** The rule on a periodic mission's folder: "−5 if you don't · one answer, a photo or a comment". */
export function checkinRule(penalty: number): string {
  return `${penalty > 0 ? `−${penalty} if you don’t` : 'No fine'} · one answer, a photo or a comment`;
}

/** "opens 22:42 · in 54 min" (or "· any minute" once it is due). */
export function opensLine(clock: string, atMs: number, nowMs: number): string {
  const min = Math.ceil((atMs - nowMs) / 60_000);
  return `opens ${clock} · ${min > 0 ? `in ${min} min` : 'any minute'}`;
}
