// Revision 4 E2: the reaction emoji allowed by firestore.rules are exactly REACTION_EMOJI (same order),
// so the app can never offer an emoji the rules would refuse, or vice versa.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REACTION_EMOJI } from '../../functions/src/shared/types';

describe('reaction emoji', () => {
  it('firestore.rules allows exactly the REACTION_EMOJI list', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const match = rules.match(/request\.resource\.data\.emoji in \[([^\]]*)\]/);
    expect(match, 'emoji list not found in firestore.rules').not.toBeNull();
    const fromRules = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(fromRules).toEqual([...REACTION_EMOJI]);
  });

  it('offers a wide, duplicate-free set', () => {
    expect(REACTION_EMOJI.length).toBeGreaterThanOrEqual(24);
    expect(new Set(REACTION_EMOJI).size).toBe(REACTION_EMOJI.length);
  });
});
