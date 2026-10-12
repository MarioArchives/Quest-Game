// The registry of scoring rule sets. Add one by writing a ScoringRules module and listing it here.
import { classic } from './classic.ts';
import { countdown } from './countdown.ts';
import { heist } from './heist.ts';
import type { ScoringRules } from './types.ts';

export { classic, countdown, heist };

/** Every rule set, by id. */
export const RULESETS: Record<string, ScoringRules> = { classic, countdown, heist };

/** The rule set with this id, or undefined. */
export function getRules(id: string | null | undefined): ScoringRules | undefined {
  return id && Object.hasOwn(RULESETS, id) ? RULESETS[id] : undefined;
}
