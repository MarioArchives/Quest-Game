/**
 * Count side-quest votes. `votes` are the voted-for submission ids (one per voter); `entryIds` are the
 * approved entries that can win. Votes for anything else are ignored. Everyone tied on the highest
 * count (> 0) wins; no votes means no winners. Shared by the server tally and the UI.
 */
export function tallyVotes(
  votes: readonly string[],
  entryIds: readonly string[],
): { counts: Record<string, number>; winners: string[] } {
  const ids = [...new Set(entryIds)];
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  for (const vote of votes) {
    if (Object.hasOwn(counts, vote)) counts[vote] += 1;
  }
  const top = Math.max(0, ...ids.map((id) => counts[id]));
  const winners = top > 0 ? ids.filter((id) => counts[id] === top) : [];
  return { counts, winners };
}
