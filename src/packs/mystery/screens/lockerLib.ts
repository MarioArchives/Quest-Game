// Pure helpers for the Evidence Locker (the mystery pack's GM console).
import type { GlobalQuest, Reward, Switchboard } from '../../../shared';

/** The locker's four folder tabs, in order; Tonight opens first. */
export const LOCKER_TABS = ['tonight', 'suspects', 'missions', 'setup'] as const;
export type LockerTab = (typeof LOCKER_TABS)[number];

/** The tab an arrow key, Home or End moves to along the row (wrapping round at the ends); null for any other key. */
export function stepTab<T>(tabs: readonly T[], current: T, key: string): T | null {
  const i = Math.max(0, tabs.indexOf(current));
  if (key === 'ArrowRight') return tabs[(i + 1) % tabs.length]!;
  if (key === 'ArrowLeft') return tabs[(i - 1 + tabs.length) % tabs.length]!;
  if (key === 'Home') return tabs[0]!;
  if (key === 'End') return tabs[tabs.length - 1]!;
  return null;
}

/**
 * The phone lines are down and the GM should know: calls are on, and the switchboard has sent everyone to the app (or
 * is trying a call to see) by itself. Lines the GM switched off by hand are their own choice, not an alarm.
 */
export function linesAlarm(sb: Pick<Switchboard, 'mode' | 'manual'> | null, policePhone: boolean): boolean {
  return policePhone && sb !== null && sb.mode !== 'phone' && !sb.manual;
}

export type JobKind = 'lines' | 'door' | 'statement' | 'entries' | 'story';

export interface JobsInput {
  linesDown: boolean;
  /** Join requests and waiting statements, any order (`at` in ms). */
  joins: { id: string; at: number }[];
  statements: { id: string; at: number }[];
  /** The group mission whose entries wait for the GM's check, if one does. */
  checking: string | null;
  /** The story mission up next, if any; it is a job only while the case is open and no group mission takes entries. */
  story: { nextId: string | null; caseOpen: boolean; taking: boolean };
}

/**
 * Tonight's jobs, most urgent first: the phone lines (harm while they're down), the door, the statements and then
 * the entries to check (each oldest first), and the next story mission to fire.
 */
export function tonightJobs(input: JobsInput): { kind: JobKind; id: string }[] {
  const oldest = (list: { id: string; at: number }[]) => [...list].sort((a, b) => a.at - b.at);
  const { nextId, caseOpen, taking } = input.story;
  return [
    ...(input.linesDown ? [{ kind: 'lines' as const, id: 'lines' }] : []),
    ...oldest(input.joins).map((j) => ({ kind: 'door' as const, id: j.id })),
    ...oldest(input.statements).map((s) => ({ kind: 'statement' as const, id: s.id })),
    ...(input.checking ? [{ kind: 'entries' as const, id: input.checking }] : []),
    ...(nextId && caseOpen && !taking ? [{ kind: 'story' as const, id: nextId }] : []),
  ];
}

/** Where a group mission came from, on its folder: "Story mission", "From the GM" or "Random drop". */
export function missionKind(m: Pick<GlobalQuest, 'source' | 'storyId'>, gm: string): string {
  if (m.source === 'story' || m.storyId) return 'Story mission';
  if (m.source === 'gm-custom') return `From the ${gm}`;
  return 'Random drop';
}

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

/** How long something has waited, on a tag: "just now", "14 min", "1 h 5 min", "2 h" (never negative). */
export function waited(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  if (total === 0) return 'just now';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** How long the case has been running: "45m", "3h 12m", "2h" (whole minutes, never negative). */
export function runningFor(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}
