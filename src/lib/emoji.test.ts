// Reactions: any single emoji from the keyboard, as well as the quick set.
import { describe, expect, it } from 'vitest';
import { REACTION_EMOJI } from '../../functions/src/shared/types';
import { orderReactions, REACTION_MAX_CODE_POINTS, singleEmoji } from './emoji';

describe('singleEmoji', () => {
  it('accepts every emoji in the quick set', () => {
    for (const emoji of REACTION_EMOJI) expect(singleEmoji(emoji)).toBe(emoji);
  });

  it.each([
    ['an emoji outside the quick set', '💩'],
    ['a skin tone', '👍🏽'],
    ['a flag', '🇬🇧'],
    ['a subdivision flag', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    ['a ZWJ sequence with skin tones', '👩🏽‍❤️‍💋‍👨🏿'],
    ['a family', '👨‍👩‍👧‍👦'],
    ['a heart without the emoji variation selector', '❤'],
  ])('accepts %s', (_label, emoji) => {
    expect(singleEmoji(emoji)).toBe(emoji);
    expect([...emoji].length).toBeLessThanOrEqual(REACTION_MAX_CODE_POINTS);
  });

  it('trims the spaces a keyboard leaves around it', () => {
    expect(singleEmoji('  🦆 ')).toBe('🦆');
  });

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['plain text', 'lol'],
    ['two emoji', '🔥🔥'],
    ['an emoji and text', '🔥!'],
    ['an emoji and a space-separated emoji', '🔥 😂'],
    ['a keycap', '1️⃣'],
    ['non-ASCII text', 'é'],
    ['a CJK character', '日'],
    ['a symbol that is not an emoji', '→'],
  ])('refuses %s', (_label, input) => {
    expect(singleEmoji(input)).toBeNull();
  });
});

describe('orderReactions', () => {
  it('puts the quick set first in its own order, then the others sorted, once each', () => {
    expect(orderReactions(['🦆', '😂', '🔥', '💩', '😂'])).toEqual(['🔥', '😂', '💩', '🦆']);
  });

  it('is empty when nobody has reacted', () => {
    expect(orderReactions([])).toEqual([]);
  });
});
