// Pure helpers for the Log book (the mystery pack's Feed): Credible / Doubtful votes, the "to stamp" counts, the pick
// of a stop, the catch-up pile's order and the words on the top card. No React here; the screen only draws what these say.
import { isVotableAbout, takesVote } from '../../../shared';

export type Vote = 1 | -1;

/** What a vote needs from a post (a `FeedItem` fits). Missing counts mean 0 and a missing `votes` means {}. */
export interface VotePost {
  id: string;
  type: string;
  uid?: string | null;
  actorUid?: string | null;
  up?: number;
  down?: number;
  score?: number;
  votes?: Record<string, Vote>;
}

/** A vote you cast that the server hasn't shown back yet: null is a vote taken back. Keyed by post id. */
export type Pending = Readonly<Record<string, Vote | null>>;

/** Tapping a stamp: the same one takes your vote back (null), the other switches it, none sets it. */
export function nextVote(current: Vote | null | undefined, tapped: Vote): Vote | null {
  return current === tapped ? null : tapped;
}

/** Your vote on a post, with a not-yet-confirmed one (if any) laid over what the server says. */
export function myVote(post: VotePost, uid: string, pending: Pending = {}): Vote | null {
  if (post.id in pending) return pending[post.id] ?? null;
  return post.votes?.[uid] ?? null;
}

/** The two counts as they should read now: the server's, adjusted for a vote of yours it hasn't shown yet. */
export function stampCounts(post: VotePost, uid: string, pending: Pending = {}): { up: number; down: number; mine: Vote | null } {
  const server = post.votes?.[uid] ?? null;
  const mine = myVote(post, uid, pending);
  const up = (post.up ?? 0) - (server === 1 ? 1 : 0) + (mine === 1 ? 1 : 0);
  const down = (post.down ?? 0) - (server === -1 ? 1 : 0) + (mine === -1 ? 1 : 0);
  return { up: Math.max(0, up), down: Math.max(0, down), mine };
}

/** Entries of yours that others can vote on: they show "Yours · credible n · doubtful n" and no stamps. */
export function isYours(post: VotePost, uid: string): boolean {
  return isVotableAbout({ type: post.type as never, uid: post.uid ?? null }) && (post.uid === uid || post.actorUid === uid);
}

/** Entries you can still stamp: they take your vote and you haven't voted on them. */
export function toStamp<P extends VotePost>(posts: P[], uid: string, pending: Pending = {}): P[] {
  return posts.filter((p) => takesVote({ type: p.type as never, uid: p.uid ?? null, actorUid: p.actorUid }, uid) && myVote(p, uid, pending) === null);
}

/** Entries that take your vote at all (yours, and types that take none, are left out). */
export function votableCount(posts: VotePost[], uid: string): number {
  return posts.filter((p) => takesVote({ type: p.type as never, uid: p.uid ?? null, actorUid: p.actorUid }, uid)).length;
}

/** "4 to stamp" for the open stop's meta and the filed folders; null when nothing is left. */
export function toStampText(n: number): string | null {
  return n > 0 ? `${n} to stamp` : null;
}

/** A filed stop's chip: what's left to stamp, or "All stamped" (null when no entry there takes your vote). */
export function stopChip(votable: number, left: number): string | null {
  if (votable === 0) return null;
  return left > 0 ? `${left} to stamp` : 'All stamped';
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** A short name for an entry, for the pick and the card underneath: its caption if it has one, else its words. */
export function entryTitle(post: { text: string; caption?: string | null }, max = 28): string {
  return clip(post.caption?.trim() ? post.caption : post.text, max);
}

/** An entry's score: the stored one, else up minus down. */
export const scoreOf = (post: Pick<VotePost, 'score' | 'up' | 'down'>): number => post.score ?? (post.up ?? 0) - (post.down ?? 0);

/** The stop's pick: its highest-scoring entries, score 1 or more (several when tied); empty when none has one. */
export function pickOfStop<P extends VotePost>(posts: P[]): P[] {
  let best = 1;
  let picks: P[] = [];
  for (const p of posts) {
    const s = scoreOf(p);
    if (s < best) continue;
    if (s > best || picks.length === 0) picks = [];
    best = s;
    picks.push(p);
  }
  return picks;
}

/** "Pick: the corkscrew", "Pick: a + b (tied)", "Pick: a + b + 1 more (tied)"; null when the stop has no pick. */
export function pickLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `Pick: ${names[0]}`;
  const shown = names.length > 2 ? [names[0], names[1], `${names.length - 2} more`] : names;
  return `Pick: ${shown.join(' + ')} (tied)`;
}

/** What the catch-up order needs of a chapter. `posts` are newest first, as the chapters keep them. */
export interface PileChapter<P> {
  posts: P[];
}

/**
 * The catch-up pile: what you haven't stamped, this stop first and newest first, then back through the earlier stops
 * (chapters come newest stop first). Each entry says which chapter it came from (0 is this stop).
 */
export function catchUpOrder<P extends VotePost>(chapters: Array<PileChapter<P>>, uid: string, pending: Pending = {}): Array<{ post: P; chapter: number }> {
  const out: Array<{ post: P; chapter: number }> = [];
  chapters.forEach((c, chapter) => {
    for (const post of toStamp(c.posts, uid, pending)) out.push({ post, chapter });
  });
  return out;
}

/** The pill: "Next to stamp · 3 left here", or, with nothing left at this stop, "Next to stamp · 5 earlier". */
export function pillText(here: number, earlier: number): string | null {
  if (here > 0) return `Next to stamp · ${here} left here`;
  if (earlier > 0) return `Next to stamp · ${earlier} earlier`;
  return null;
}

/** The pile's heading line: "1 of 3 here · then 5 earlier", "2 of 8 earlier". */
export function pileLine(index: number, order: Array<{ chapter: number }>): string {
  const here = order.filter((o) => o.chapter === 0).length;
  const earlier = order.length - here;
  if (index < here) return `${index + 1} of ${here} here${earlier > 0 ? ` · then ${earlier} earlier` : ''}`;
  return `${index - here + 1} of ${earlier} earlier`;
}

/** The top card's score as a label: "+3". */
export const scoreLabel = (score: number): string => (score > 0 ? `+${score}` : String(score));

/** "Since 22:40". */
export const sinceLine = (from: string | null): string | null => (from ? `Since ${from}` : null);

/** The card under the top one after it changed hands: "The corkscrew · +3 · 22:40–23:19". */
export function underLine(title: string, score: number | null, from: string | null, to: string | null): string {
  const hours = from && to ? `${from}–${to}` : from ? `from ${from}` : null;
  return [title, score === null ? null : scoreLabel(score), hours].filter(Boolean).join(' · ');
}

/** The top card's by-line: "Priya · Murder weapon · the Royal Oak, 22:12" (parts left out when unknown). */
export function topByLine(parts: { who: string | null; what: string | null; stop: string | null; time: string | null }): string {
  const where = [parts.stop, parts.time].filter(Boolean).join(', ');
  return [parts.who, parts.what, where || null].filter(Boolean).join(' · ');
}

/** The heading line: "55 entries tonight". */
export const tonightLine = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'} tonight`;
