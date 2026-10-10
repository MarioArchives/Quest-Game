/**
 * Standard competition ranking ("1224"): sorted by score descending, ties share a rank
 * and the next rank skips. Stable for equal scores. Used by the leaderboard and endGame.
 */
export function competitionRanks<T>(items: readonly T[], score: (item: T) => number): Array<T & { rank: number }> {
  const scored = items.map((item) => ({ item, s: score(item) }));
  // Array.prototype.sort is stable, so equal scores keep their input order.
  const sorted = [...scored].sort((a, b) => b.s - a.s);
  const out: Array<T & { rank: number }> = [];
  let rank = 1;
  for (const [i, { item, s }] of sorted.entries()) {
    if (i > 0 && s < sorted[i - 1].s) rank = i + 1;
    out.push({ ...item, rank });
  }
  return out;
}
