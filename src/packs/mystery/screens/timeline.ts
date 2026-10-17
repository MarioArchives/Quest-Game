// Pure helpers for the Board's feed: posts grouped into one chapter per revealed stop, the walk between stops,
// and the mono kicker each kind of post wears. Pack-only (the words and the route belong to this game).
import type { FeedType } from '../../../shared';

/** What chaptering needs from a post. */
export interface TimedPost {
  type: string;
  ref?: string | null;
  /** When it was posted (epoch ms). */
  ms: number;
}

/** What chaptering needs from a stop (a `RouteStop` fits). */
export interface ChapterStop {
  id: string;
  number: number;
  name: string;
  lat: number;
  lng: number;
  revealed: boolean;
  startMs: number | null;
}

export interface Walk {
  metres: number;
  minutes: number;
}

export interface Chapter<P extends TimedPost, S extends ChapterStop> {
  /** The stop this chapter is at; null for "Before the crawl" (or the one headerless list). */
  stop: S | null;
  startMs: number | null;
  /** Newest first. */
  posts: P[];
  /** True for the newest stop chapter. */
  now: boolean;
  /** False only for the single plain list used when no stop has a chapter. */
  headed: boolean;
  /** The walk from the stop before this one (the next chapter down); null when either side has no stop. */
  walk: Walk | null;
}

const WALK_M_PER_MIN = 80;

/** Straight-line distance in metres between two points. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The straight-line walk between two stops at 80 m a minute: metres to the nearest 10, at least a minute. */
export function walk(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Walk {
  const metres = Math.round(haversine(from.lat, from.lng, to.lat, to.lng) / 10) * 10;
  return { metres, minutes: Math.max(1, Math.round(metres / WALK_M_PER_MIN)) };
}

/** "560 M · 7 MIN WALK", "1.2 KM · 15 MIN WALK". */
export function walkLabel(w: Walk): string {
  const dist = w.metres < 1000 ? `${w.metres} M` : `${(w.metres / 1000).toFixed(1)} KM`;
  return `${dist} · ${w.minutes} MIN WALK`;
}

/**
 * Posts grouped into chapters, newest first. A revealed stop starts its chapter at its own time, else when its
 * `stop-revealed` post was written (a revealed stop with neither stays out). A post belongs to the latest chapter
 * that began at or before it; earlier ones fall into a last "Before the crawl" chapter. With no chapter at all
 * the posts come back as one plain, headerless list. NOW marks the newest chapter that has begun by `nowMs`.
 */
export function chapterize<P extends TimedPost, S extends ChapterStop>(posts: P[], stops: S[], nowMs = Infinity): Chapter<P, S>[] {
  const revealedAt = new Map<string, number>();
  for (const p of posts) {
    if (p.type !== 'stop-revealed' || !p.ref) continue;
    const seen = revealedAt.get(p.ref);
    if (seen === undefined || p.ms < seen) revealedAt.set(p.ref, p.ms);
  }
  const starts = stops
    .filter((s) => s.revealed)
    .map((stop) => ({ stop, startMs: stop.startMs ?? revealedAt.get(stop.id) ?? null }))
    // A stop timed for later has no chapter yet: the map's "Next" shows it until the group gets there.
    .filter((c): c is { stop: S; startMs: number } => c.startMs !== null && c.startMs <= nowMs)
    .sort((a, b) => b.startMs - a.startMs || b.stop.number - a.stop.number); // newest first

  const sorted = [...posts].sort((a, b) => b.ms - a.ms);
  if (starts.length === 0) {
    return sorted.length === 0 ? [] : [{ stop: null, startMs: null, posts: sorted, now: false, headed: false, walk: null }];
  }

  const chapters: Chapter<P, S>[] = starts.map((c) => ({ stop: c.stop, startMs: c.startMs, posts: [], now: false, headed: true, walk: null }));
  // The group is at the newest stop that has started.
  chapters[0]!.now = true;
  const before: P[] = [];
  for (const post of sorted) {
    const home = chapters.find((c) => (c.startMs as number) <= post.ms);
    (home ? home.posts : before).push(post);
  }
  chapters.forEach((c, i) => {
    const older = chapters[i + 1]?.stop;
    if (c.stop && older) c.walk = walk(older, c.stop);
  });
  if (before.length > 0) chapters.push({ stop: null, startMs: null, posts: before, now: false, headed: true, walk: null });
  return chapters;
}

/** The mono kicker over each kind of post. `witness` is the first name of whoever confirmed a claim. */
export function kicker(type: FeedType, opts: { entry?: boolean; witness?: string | null } = {}): string {
  switch (type) {
    case 'approved':
      return opts.entry ? 'ENTRY BAGGED' : opts.witness ? `CONFIRMED · ${opts.witness.toUpperCase()}` : 'CONFIRMED';
    case 'rejected': return 'REJECTED';
    case 'fraud': return 'OVERRULED';
    case 'exposed': return 'COVER BLOWN';
    case 'framed': return 'ANONYMOUS TIP';
    case 'global-open': return 'GROUP MISSION OPEN';
    case 'checking': return 'ENTRIES CLOSED';
    case 'voting-open': return 'VOTING OPEN';
    case 'global-won': return 'GROUP MISSION SOLVED';
    case 'announcement': return 'FROM THE GM';
    case 'status': return 'CASE UPDATE';
    case 'adjust': return 'GM ADJUSTMENT';
    case 'left': return 'LEFT THE CRAWL';
    case 'join': return 'NEW SUSPECT';
    case 'stop-revealed': return 'NEW LOCATION';
    case 'checkin-open': return 'ANSWER NOW';
    case 'checkin-answer': return 'PRESENT';
    case 'checkin-closed': return "TIME'S UP";
    case 'global-scored': return 'GROUP MISSION SCORED';
    case 'standing': return 'STANDING CHANGED';
    case 'police-call': return 'POLICE ON THE LINE';
    case 'police-tip': return 'TIP-OFF FILED';
    case 'police-result': return 'POLICE REPORT';
  }
}
