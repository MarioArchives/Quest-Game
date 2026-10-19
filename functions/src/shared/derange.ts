// Dealing each player another player (a mission with entry.tag 'assigned'): a shuffle where nobody gets themself.

/**
 * Who each id is dealt: a permutation of `ids` with no fixed points, drawn with `rng`, as giver → target. Needs at
 * least two ids. The ids are sorted first, so the deal depends on the random numbers and not on the order given.
 * The ids are shuffled into a ring and each is dealt the next one along, so everybody is somebody's target.
 */
export function derange(ids: string[], rng: () => number): Record<string, string> {
  const ring = [...ids].sort();
  if (ring.length < 2) throw new Error('derange needs at least two ids.');
  if (new Set(ring).size !== ring.length) throw new Error('derange needs distinct ids.');
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [ring[i], ring[j]] = [ring[j]!, ring[i]!];
  }
  return Object.fromEntries(ring.map((giver, i) => [giver, ring[(i + 1) % ring.length]!]));
}
