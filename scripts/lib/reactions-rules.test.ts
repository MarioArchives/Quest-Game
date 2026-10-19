// Revision 4 E2: firestore.rules and the app agree on how long a reaction emoji may be, so the app never
// offers one the rules would refuse. (Any emoji is allowed; REACTION_EMOJI is just the picker's quick set.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VOTABLE_FEED_TYPES } from '../../functions/src/shared/feedVotes.ts';
import { REACTION_EMOJI } from '../../functions/src/shared/types.ts';
import { REACTION_MAX_CODE_POINTS } from '../../src/lib/emoji.ts';

describe('reaction emoji', () => {
  it('firestore.rules caps a reaction at REACTION_MAX_CODE_POINTS non-ASCII code points', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const match = rules.match(/request\.resource\.data\.emoji\.matches\('\[\^\\\\x00-\\\\x7F\]\{1,(\d+)\}'\)/);
    expect(match, 'emoji pattern not found in firestore.rules').not.toBeNull();
    expect(Number(match![1])).toBe(REACTION_MAX_CODE_POINTS);
  });

  it('offers a wide, duplicate-free quick set', () => {
    expect(REACTION_EMOJI.length).toBeGreaterThanOrEqual(24);
    expect(new Set(REACTION_EMOJI).size).toBe(REACTION_EMOJI.length);
  });
});

describe('vote reactions', () => {
  it('firestore.rules lists exactly the votable feed types', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const match = rules.match(/post\.type in \[([^\]]+)\]/);
    expect(match, 'votable list not found in firestore.rules').not.toBeNull();
    const listed = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...VOTABLE_FEED_TYPES].sort());
  });
});
