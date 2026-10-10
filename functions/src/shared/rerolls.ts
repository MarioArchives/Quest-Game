// Shared by the functions and the app: how many rerolls a player has, including GM-granted extras.

export function rerollAllowance(rerollLimit: number, player: { extraRerolls?: number | null }): number {
  return rerollLimit + (player.extraRerolls ?? 0);
}

export function rerollsLeft(
  rerollLimit: number,
  player: { rerollsUsed?: number | null; extraRerolls?: number | null },
): number {
  return Math.max(0, rerollAllowance(rerollLimit, player) - (player.rerollsUsed ?? 0));
}
