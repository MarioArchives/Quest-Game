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

  it('titles are unique per scope (guesses are picked by title)', () => {
    for (const list of [pool.personal, pool.global]) {
      const titles = list.map((q) => String(q.title).toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('every personal quest tells the witness what proof to expect', () => {
    for (const q of pool.personal) expect(q.description, String(q.id)).toMatch(/Proof: \S/);
  });

  it('never mentions video: evidence is a photo and/or a comment only (plan edge 1)', () => {
    for (const q of [...pool.personal, ...pool.global]) {
      expect(`${q.title} ${q.description}`, String(q.id)).not.toMatch(/\b(videos?|film(s|ed|ing)?|footage)\b/i);
    }
  });

  it('side-quest windows fit what the GM console allows (5-180 min)', () => {
    for (const q of pool.global) {
      expect(Number.isInteger(q.windowMin), String(q.id)).toBe(true);
      expect(q.windowMin as number).toBeGreaterThanOrEqual(5);
      expect(q.windowMin as number).toBeLessThanOrEqual(180);
    }
  });
});
