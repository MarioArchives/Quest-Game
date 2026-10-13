// Periodic missions (packs with checkins): the GM's series of check-ins. Each series sends a request to everyone
// every `intervalMin`, open for `windowMin`, up to `count` times (0 = no limit); missing one costs `penalty`. Shared
// by the functions (checks on every write), the pack checks, the seed script and the mock.
import type { GamePack, PeriodicSeed } from './packs/types.ts';
import type { Periodic } from './types.ts';

/** What the GM sets on a series. */
export type PeriodicFields = Pick<Periodic, 'name' | 'prompts' | 'intervalMin' | 'windowMin' | 'penalty' | 'count'>;

export const PERIODIC_LIMITS = {
  nameMax: 40,
  promptMax: 200,
  promptsMax: 30,
  intervalMin: [5, 1440],
  windowMin: [1, 180],
  penaltyMax: 10000,
  countMax: 100,
} as const;

const whole = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Everything wrong with a series' fields, in plain words; empty when they are fine. */
export function periodicProblems(f: Partial<Record<keyof PeriodicFields, unknown>>): string[] {
  const L = PERIODIC_LIMITS;
  const problems: string[] = [];
  if (typeof f.name !== 'string' || f.name.trim().length < 1 || f.name.trim().length > L.nameMax) problems.push(`Give it a name of 1 to ${L.nameMax} characters.`);
  if (!Array.isArray(f.prompts) || f.prompts.length < 1 || f.prompts.length > L.promptsMax) {
    problems.push(`Give it 1 to ${L.promptsMax} prompts.`);
  } else if (f.prompts.some((p) => typeof p !== 'string' || p.trim().length < 1 || p.trim().length > L.promptMax)) {
    problems.push(`Each prompt must be 1 to ${L.promptMax} characters.`);
  }
  if (!whole(f.intervalMin, L.intervalMin[0], L.intervalMin[1])) problems.push(`Send one every ${L.intervalMin[0]} to ${L.intervalMin[1]} minutes.`);
  if (!whole(f.windowMin, L.windowMin[0], L.windowMin[1])) problems.push(`The time to answer is ${L.windowMin[0]} to ${L.windowMin[1]} minutes.`);
  if (!whole(f.penalty, 0, L.penaltyMax)) problems.push(`The fine is a whole number from 0 to ${L.penaltyMax}.`);
  if (!whole(f.count, 0, L.countMax)) problems.push(`How many is a whole number from 0 (no limit) to ${L.countMax}.`);
  return problems;
}

/** Trimmed copies of fields that passed `periodicProblems`. */
export function cleanPeriodic(f: PeriodicFields): PeriodicFields {
  return { ...f, name: f.name.trim(), prompts: f.prompts.map((p) => p.trim()) };
}

/** True once a series with a limit has sent them all. */
export const periodicDone = (p: Pick<Periodic, 'count' | 'sent'>): boolean => p.count > 0 && p.sent >= p.count;

/** The pack's starting series as documents to create (missing ids only), running from the start. */
export function periodicSeeds(pack: GamePack): Array<{ id: string; data: Omit<Periodic, 'createdAt'> }> {
  if (!pack.features.checkins) return [];
  return (pack.periodics ?? []).map(({ id, ...f }: PeriodicSeed) => ({
    id,
    data: { ...cleanPeriodic(f), sent: 0, status: 'running', nextAt: null },
  }));
}
