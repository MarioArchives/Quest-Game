// Pure helpers for the Evidence Locker (the mystery pack's GM console).
import type { Reward } from '../../../shared';

export type LockerFilter = 'all' | 'door' | 'statements' | 'entries' | 'confirmed';

/** A steady four-digit case number for a tag, from its document id ("TAG 4172"). */
export function tagNumber(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9000;
  return String(h + 1000);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sealed envelope's one-liner: "2 frames, 1 destroyed exhibit and 1 reward unused". */
export function lockerSummary(rewards: Pick<Reward, 'status'>[]): string {
  const count = (s: Reward['status']) => rewards.filter((r) => r.status === s).length;
  const parts = [
    [count('framed'), plural(count('framed'), 'frame', 'frames')],
    [count('cleaned'), plural(count('cleaned'), 'destroyed exhibit', 'destroyed exhibits')],
    [count('pending'), `${plural(count('pending'), 'reward', 'rewards')} unused`],
  ]
    .filter(([n]) => n !== 0)
    .map(([, text]) => text as string);
  if (parts.length === 0) return 'Nothing sealed yet';
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/** How long the case has been running: "45m", "3h 12m", "2h" (whole minutes, never negative). */
export function runningFor(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
