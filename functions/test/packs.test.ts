// Engine plan edge cases 1-3 and 5 (pack registry, validation, mismatch, noun forms) and part of 22
// (settings defaults). Pure: no emulator needed.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PACK_ID, defaultSettingsFor, getPack, packIds, packMismatch, validatePack } from '../src/shared/packs/index.js';
import { capitalise, nounForms, termForms } from '../src/shared/packs/terms.js';
import type { GamePack } from '../src/shared/packs/types.js';
import { paramDefaults } from '../src/shared/scoring/engine.js';
import { RULESETS } from '../src/shared/scoring/index.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import { DARE_TERMS, testPack } from './packs.js';

describe('E1. getPack and the registry', () => {
  it('lists every pack, sorted', () => {
    expect(packIds()).toEqual(expect.arrayContaining(['lancaster', 'starter']));
    expect(packIds()).toEqual([...packIds()].sort());
  });

  it('defaults to lancaster when no id is given', () => {
    expect(DEFAULT_PACK_ID).toBe('lancaster');
    expect(getPack().id).toBe('lancaster');
    expect(getPack(undefined).id).toBe('lancaster');
    expect(getPack(null).id).toBe('lancaster');
    expect(getPack('').id).toBe('lancaster');
  });

  it('returns the pack with that id', () => {
    expect(getPack('starter').id).toBe('starter');
    expect(getPack('lancaster').id).toBe('lancaster');
  });

  it('throws on an unknown id and names the packs that exist', () => {
    expect(() => getPack('nope')).toThrow(/nope/);
    expect(() => getPack('nope')).toThrow(/lancaster/);
    expect(() => getPack('nope')).toThrow(/starter/);
  });
});

describe('E2. validatePack', () => {
  it.each(['lancaster', 'starter'])('the %s pack is valid', (id) => {
    expect(validatePack(getPack(id))).toEqual([]);
  });

  it('every registered pack is valid', () => {
    for (const id of packIds()) expect(validatePack(getPack(id)), id).toEqual([]);
  });

  // Each case breaks one thing in an otherwise valid pack; the message must say what is wrong.
  const broken: Array<[string, (p: GamePack) => GamePack, RegExp]> = [
    ['an empty term', (p) => ({ ...p, terms: { ...p.terms, witness: { one: '', many: 'witnesses' } } }), /term|witness/i],
    ['an empty plural', (p) => ({ ...p, terms: { ...p.terms, quest: { one: 'quest', many: ' ' } } }), /term|quest/i],
    ['an unknown default rule set', (p) => ({ ...p, scoring: 'no-such-rules' }), /scor|rule/i],
    ['the map on without a map config', (p) => ({ ...p, map: null }), /map/i],
    [
      'side quests on but none in the catalogue',
      (p) => ({ ...p, catalogue: { ...p.catalogue, global: [] } }),
      /side quest|global/i,
    ],
    ['an invalid time zone', (p) => ({ ...p, timeZone: 'Mars/Olympus_Mons' }), /time ?zone/i],
    ['an unsafe id', (p) => ({ ...p, id: 'Bad Id!' }), /\bid\b/i],
    [
      'duplicate quest ids',
      (p) => ({ ...p, catalogue: { ...p.catalogue, personal: [...p.catalogue.personal, p.catalogue.personal[0]!] } }),
      /duplicate/i,
    ],
    [
      'a personal quest without the p- prefix',
      (p) => ({ ...p, catalogue: { ...p.catalogue, personal: [{ ...p.catalogue.personal[0]!, id: 'x-1' }, ...p.catalogue.personal.slice(1)] } }),
      /prefix|p-/i,
    ],
    [
      'a side quest without the g- prefix',
      (p) => ({ ...p, catalogue: { ...p.catalogue, global: [{ ...p.catalogue.global[0]!, id: 'p-side' }, ...p.catalogue.global.slice(1)] } }),
      /prefix|g-/i,
    ],
    [
      'a personal quest without a Proof: line',
      (p) => ({
        ...p,
        catalogue: { ...p.catalogue, personal: [{ ...p.catalogue.personal[0]!, description: 'Just do it.' }, ...p.catalogue.personal.slice(1)] },
      }),
      /proof/i,
    ],
    [
      'quest points of zero',
      (p) => ({ ...p, catalogue: { ...p.catalogue, personal: [{ ...p.catalogue.personal[0]!, points: 0 }, ...p.catalogue.personal.slice(1)] } }),
      /points/i,
    ],
    [
      'fractional quest points',
      (p) => ({ ...p, catalogue: { ...p.catalogue, personal: [{ ...p.catalogue.personal[0]!, points: 12.5 }, ...p.catalogue.personal.slice(1)] } }),
      /points/i,
    ],
  ];

  it.each(broken)('rejects %s', (_label, breakIt, message) => {
    const problems = validatePack(breakIt(getPack('lancaster')));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(message);
  });

  it('allows no side quests in the catalogue when side quests are off', () => {
    const p = testPack({ features: { sideQuests: false } });
    expect(validatePack({ ...p, catalogue: { ...p.catalogue, global: [] } })).toEqual([]);
  });

  it('allows the map on without venues (it then shows just the players)', () => {
    expect(validatePack({ ...getPack('lancaster'), venues: [] })).toEqual([]);
  });

  it('allows no map and no venues when the map is off', () => {
    expect(validatePack(testPack({ features: { map: false }, map: null, venues: [] }))).toEqual([]);
  });

  it('accepts positive whole quest points', () => {
    const p = getPack('lancaster');
    const personal = [{ ...p.catalogue.personal[0]!, points: 30 }, ...p.catalogue.personal.slice(1)];
    expect(validatePack({ ...p, catalogue: { ...p.catalogue, personal } })).toEqual([]);
  });
});

describe('the two built-in packs', () => {
  it('lancaster keeps the festival game exactly as it was', () => {
    const p = getPack('lancaster');
    expect(p.name).toBe('Festival Quest');
    expect(p.features).toEqual({ guesses: true, sideQuests: true, map: true });
    expect(p.timeZone).toBe('Europe/London');
    expect(p.locale).toBe('en-GB');
    expect(p.scoring).toBe('classic');
    expect(p.terms.quest).toEqual({ one: 'quest', many: 'quests' });
    expect(p.terms.sideQuest).toEqual({ one: 'side quest', many: 'side quests' });
    expect(p.terms.witness).toEqual({ one: 'witness', many: 'witnesses' });
    expect(p.terms.claim).toEqual({ one: 'claim', many: 'claims' });
    expect(p.terms.gm).toEqual({ one: 'GM', many: 'GMs' });
    expect(p.map).not.toBeNull();
    expect(p.venues.length).toBeGreaterThan(0);
    expect(p.catalogue.personal.length).toBeGreaterThanOrEqual(60);
    expect(p.catalogue.global.length).toBeGreaterThanOrEqual(15);
  });

  it('starter is a plain template: a map without venues, its own words, a small catalogue', () => {
    const p = getPack('starter');
    expect(p.name).toBe('Quest Game');
    expect(p.features).toEqual({ guesses: true, sideQuests: true, map: true });
    expect(p.map).not.toBeNull();
    expect(p.venues).toEqual([]);
    expect(p.scoring).toBe('classic');
    expect(p.terms.quest).toEqual({ one: 'challenge', many: 'challenges' });
    expect(p.terms.sideQuest).toEqual({ one: 'bonus round', many: 'bonus rounds' });
    expect(p.terms.wrap.one.toLowerCase()).toBe('recap');
    expect(p.catalogue.personal.length).toBeGreaterThanOrEqual(10);
    expect(p.catalogue.global.length).toBeGreaterThanOrEqual(4);
  });
});

describe('E3. packMismatch', () => {
  it('is fine when game/state names the same pack', () => {
    expect(packMismatch('lancaster', 'lancaster')).toBe(false);
  });

  it('is fine when game/state names no pack (a game seeded before packs)', () => {
    expect(packMismatch(undefined, 'starter')).toBe(false);
    expect(packMismatch(null, 'starter')).toBe(false);
    expect(packMismatch('', 'starter')).toBe(false);
  });

  it('is a mismatch when game/state names another pack', () => {
    expect(packMismatch('starter', 'lancaster')).toBe(true);
  });
});

describe('E5. noun forms', () => {
  it('capitalises only the first letter', () => {
    expect(capitalise('side quest')).toBe('Side quest');
    expect(capitalise('GM')).toBe('GM');
    expect(capitalise('éclair')).toBe('Éclair');
    expect(capitalise('')).toBe('');
  });

  it('gives all four forms of a multi-word noun', () => {
    expect(nounForms({ one: 'side quest', many: 'side quests' })).toEqual({
      one: 'side quest',
      One: 'Side quest',
      many: 'side quests',
      Many: 'Side quests',
    });
  });

  it('keeps acronyms as they are', () => {
    expect(nounForms({ one: 'GM', many: 'GMs' })).toEqual({ one: 'GM', One: 'GM', many: 'GMs', Many: 'GMs' });
  });

  it('takes the plural from the pack, never by adding an s', () => {
    expect(nounForms({ one: 'witness', many: 'witnesses' }).many).toBe('witnesses');
    expect(nounForms({ one: 'witness', many: 'witnesses' }).Many).toBe('Witnesses');
  });

  it('termForms covers every term', () => {
    const t = termForms(DARE_TERMS);
    expect(t.quest.Many).toBe('Dares');
    expect(t.sideQuest.One).toBe('Showdown');
    expect(t.witness.one).toBe('judge');
    expect(t.claim.many).toBe('bids');
    expect(t.gm.One).toBe('Host');
    expect(t.wrap.One).toBe('Recap');
  });
});

describe('E22 (defaults). settings for a pack', () => {
  it('the engine defaults no longer have globalEntryPoints and score classic', () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty('globalEntryPoints');
    expect(DEFAULT_SETTINGS.scoring).toBe('classic');
  });

  it('lancaster: the engine defaults, classic scoring and every rule set param default', () => {
    const s = defaultSettingsFor(getPack('lancaster'));
    expect(s).toEqual({
      ...DEFAULT_SETTINGS,
      ...getPack('lancaster').settings,
      scoring: 'classic',
      scoringParams: paramDefaults(Object.values(RULESETS)),
    });
    expect(Object.keys(s.scoringParams)).toEqual(expect.arrayContaining(['decayPctPerHour', 'floorPct', 'witnessReward']));
    expect(s).not.toHaveProperty('globalEntryPoints');
  });

  it("a pack's overrides and default rule set win over the engine's", () => {
    const s = defaultSettingsFor(testPack({ settings: { questPoints: 50, rerollLimit: 3 }, scoring: 'heist' }));
    expect(s.questPoints).toBe(50);
    expect(s.rerollLimit).toBe(3);
    expect(s.scoring).toBe('heist');
    expect(s.fraudPenalty).toBe(DEFAULT_SETTINGS.fraudPenalty);
  });
});
