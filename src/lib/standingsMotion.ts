// Moving standings: scores glide from what this viewer last saw (or from 0 the first time) to where they are now, and
// the changes since then are called out. Pure helpers; the screen runs the clock.

export type PointsByUid = Record<string, number>;

/** Fast at first, settling gently: 0 → 0, 1 → 1. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Each player's score part of the way (`progress`, 0–1) from `from` to `to`; someone new starts at 0. */
export function tweenPoints(from: PointsByUid, to: PointsByUid, progress: number): PointsByUid {
  const out: PointsByUid = {};
  for (const [uid, end] of Object.entries(to)) {
    const start = from[uid] ?? 0;
    out[uid] = progress >= 1 ? end : start + (end - start) * progress;
  }
  return out;
}

/** What changed for each player still here: non-zero differences only, and nothing for someone not seen before. */
export function pointDeltas(before: PointsByUid | null, after: PointsByUid): PointsByUid {
  const out: PointsByUid = {};
  if (!before) return out;
  for (const [uid, now] of Object.entries(after)) {
    const then = before[uid];
    if (then !== undefined && then !== now) out[uid] = now - then;
  }
  return out;
}

/** The scores this viewer last saw, from storage: null unless it is an object of whole numbers. */
export function parseSeen(raw: string | null): PointsByUid | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out: PointsByUid = {};
    for (const [uid, points] of Object.entries(value)) {
      if (typeof points !== 'number' || !Number.isInteger(points)) return null;
      out[uid] = points;
    }
    return out;
  } catch {
    return null;
  }
}

/** Players' uids ranked by these scores, highest first, ties by name (as the standings sort them). */
export function rankUids(players: ReadonlyArray<{ uid: string; name: string }>, points: PointsByUid): string[] {
  return [...players]
    .sort((a, b) => (points[b.uid] ?? 0) - (points[a.uid] ?? 0) || a.name.localeCompare(b.name))
    .map((p) => p.uid);
}
