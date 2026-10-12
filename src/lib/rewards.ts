// Helpers for the reward choice pop-up.
import type { Doc, Player, Reward } from '../shared';

/** Who you can frame: every other player still playing (not left), highest score first. */
export function frameTargets(players: ReadonlyArray<Doc<Player>>, meUid: string): Array<Doc<Player>> {
  return players
    .filter((p) => p.id !== meUid && !p.left)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.displayName.localeCompare(b.displayName));
}

/** Your oldest pending reward, or null. */
export function pendingReward(rewards: ReadonlyArray<Doc<Reward>>): Doc<Reward> | null {
  const pending = rewards.filter((r) => r.status === 'pending');
  return pending.reduce<Doc<Reward> | null>((a, r) => (!a || r.createdAt.toMillis() < a.createdAt.toMillis() ? r : a), null);
}
