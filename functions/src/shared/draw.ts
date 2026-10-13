// Drawing a random side-quest template: shared by the timer, the GM's "Fire random" and its preview, so a
// reshuffle offers what the server would have picked.

/**
 * A template to open next, from the active global templates (sorted by id, so a pinned `rng` is repeatable).
 * Ones no side quest has used yet come first; once every one has been used, any of them. `skip` lists the ids
 * already offered in this draw, oldest first: a reshuffle shows something not seen yet (unused first, then used),
 * and once it has shown them all, anything but the one on screen. Null when there are no templates.
 */
export function drawTemplate<T extends { id: string }>(
  templates: readonly T[],
  usedIds: Iterable<string | null>,
  rng: () => number,
  skip: readonly string[] = [],
): T | null {
  const candidates = [...templates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return null;
  const used = new Set(usedIds);
  const seen = new Set(skip);
  const current = skip[skip.length - 1];
  const unseen = (list: T[]) => list.filter((t) => !seen.has(t.id));
  const pool = [
    unseen(candidates.filter((t) => !used.has(t.id))),
    unseen(candidates),
    candidates.filter((t) => t.id !== current),
    candidates,
  ].find((list) => list.length > 0) as T[];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
}
