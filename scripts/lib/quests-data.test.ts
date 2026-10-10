// Revision 3 V21: the seeded quest pool has no location-dependent quests and no win rules
// (side quests are decided by everyone's vote).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pool = JSON.parse(readFileSync(new URL('../data/quests.json', import.meta.url), 'utf8')) as {
  personal: Array<Record<string, unknown>>;
  global: Array<Record<string, unknown>>;
};

describe('scripts/data/quests.json', () => {
  it('has a healthy pool of personal and side quests with unique ids', () => {
    expect(pool.personal.length).toBeGreaterThanOrEqual(60);
    expect(pool.global.length).toBeGreaterThanOrEqual(15);
    const ids = [...pool.personal, ...pool.global].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no quest is tied to a venue and no side quest carries a win rule', () => {
    for (const q of [...pool.personal, ...pool.global]) {
      expect(q, String(q.id)).not.toHaveProperty('venueId');
      expect(q, String(q.id)).not.toHaveProperty('winRule');
      expect(typeof q.title).toBe('string');
      expect(typeof q.description).toBe('string');
    }
  });
});
