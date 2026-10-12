// Every pack's catalogue (functions/src/shared/packs/<id>/quests.json), checked the way Revision 3 checked
// Lancaster's: no location-dependent quests, no win rules (side quests are decided by everyone's vote),
// proof for the witness, no video. Ids, prefixes and points are checked by validatePack.
import { describe, expect, it } from 'vitest';
import { getPack, packIds } from '../../functions/src/shared/packs/index.ts';

describe.each(['lancaster', 'starter', 'mystery'])('the %s catalogue', (id) => {
  const pool = () =>
    getPack(id).catalogue as unknown as {
      personal: Array<Record<string, unknown>>;
      global: Array<Record<string, unknown>>;
    };

  it('is registered', () => {
    expect(packIds()).toContain(id);
  });

  it('has unique ids', () => {
    const ids = [...pool().personal, ...pool().global].map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no quest is tied to a venue and no side quest carries a win rule', () => {
    for (const q of [...pool().personal, ...pool().global]) {
      expect(q, String(q.id)).not.toHaveProperty('venueId');
      expect(q, String(q.id)).not.toHaveProperty('winRule');
      expect(typeof q.title).toBe('string');
      expect(typeof q.description).toBe('string');
    }
  });

  it('titles are unique per scope (guesses are picked by title)', () => {
    for (const list of [pool().personal, pool().global]) {
      const titles = list.map((q) => String(q.title).toLowerCase());
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('every personal quest tells the witness what proof to expect', () => {
    for (const q of pool().personal) expect(q.description, String(q.id)).toMatch(/Proof: \S/);
  });

  it('never mentions video: evidence is a photo and/or a comment only (plan edge 1)', () => {
    for (const q of [...pool().personal, ...pool().global]) {
      expect(`${q.title} ${q.description}`, String(q.id)).not.toMatch(/\b(videos?|film(s|ed|ing)?|footage)\b/i);
    }
  });

  it('side-quest windows fit what the GM console allows (5-180 min)', () => {
    for (const q of pool().global) {
      expect(Number.isInteger(q.windowMin), String(q.id)).toBe(true);
      expect(q.windowMin as number).toBeGreaterThanOrEqual(5);
      expect(q.windowMin as number).toBeLessThanOrEqual(180);
    }
  });
});

describe('the lancaster catalogue', () => {
  it('keeps its healthy pool of personal and side quests', () => {
    const pool = getPack('lancaster').catalogue;
    expect(pool.personal.length).toBeGreaterThanOrEqual(60);
    expect(pool.global.length).toBeGreaterThanOrEqual(15);
  });
});
