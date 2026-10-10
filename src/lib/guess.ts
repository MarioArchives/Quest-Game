export interface MyGuess {
  targetUid: string;
  createdAt: number;
}

/** Milliseconds until the caller may guess targetUid again (0 when allowed). */
export function guessCooldownRemaining(
  myGuesses: readonly MyGuess[],
  targetUid: string,
  nowMs: number,
  cooldownMin: number,
): number {
  let latest = -Infinity;
  for (const guess of myGuesses) {
    if (guess.targetUid === targetUid && guess.createdAt > latest) latest = guess.createdAt;
  }
  if (latest === -Infinity) return 0;
  return Math.max(0, latest + cooldownMin * 60_000 - nowMs);
}
