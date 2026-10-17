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
    expect(packIds()).toEqual(expect.arrayContaining(['lancaster', 'mystery', 'starter']));
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
  it.each(['lancaster', 'starter', 'mystery'])('the %s pack is valid', (id) => {
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

  describe('the bar search area', () => {
    const withArea = (barSearch: unknown) => ({ ...getPack('mystery'), map: { ...getPack('mystery').map!, barSearch } }) as ReturnType<typeof getPack>;
    it('is fine as a named box with south < north and west < east', () => {
      expect(validatePack(withArea({ name: 'Manchester', south: 53.34, west: -2.32, north: 53.545, east: -2.146 }))).toEqual([]);
    });
    it.each([
      ['no name', { name: ' ', south: 53.34, west: -2.32, north: 53.545, east: -2.146 }],
      ['south above north', { name: 'X', south: 53.6, west: -2.32, north: 53.545, east: -2.146 }],
      ['west east of east', { name: 'X', south: 53.34, west: -2.1, north: 53.545, east: -2.146 }],
      ['a latitude past 90', { name: 'X', south: 53.34, west: -2.32, north: 95, east: -2.146 }],
      ['a missing edge', { name: 'X', south: 53.34, west: -2.32, north: NaN, east: -2.146 }],
    ])('rejects %s', (_label, area) => {
      expect(validatePack(withArea(area)).join('\n')).toMatch(/bar search area/);
    });
  });

  describe('a route', () => {
    const withRoute = (route: NonNullable<ReturnType<typeof getPack>['route']>) => ({ ...getPack('mystery'), route });
    it('is fine when every stop has a name and a place', () => {
      expect(validatePack(withRoute([{ name: 'The Crown', lat: 53.4, lng: -2.2 }]))).toEqual([]);
      expect(validatePack(withRoute([{ name: 'The Crown', lat: 53.4, lng: -2.2, address: '770 Wilmslow Road', placeRef: 'osm:node/1' }]))).toEqual([]);
    });
    it.each([
      ['a blank name', { name: ' ', lat: 53.4, lng: -2.2 }],
      ['a 61 character name', { name: 'x'.repeat(61), lat: 53.4, lng: -2.2 }],
      ['a latitude over 90', { name: 'A', lat: 91, lng: -2.2 }],
      ['a longitude under -180', { name: 'A', lat: 53, lng: -181 }],
      ['a missing coordinate', { name: 'A', lat: NaN, lng: -2.2 }],
      ['a blank address', { name: 'A', lat: 53.4, lng: -2.2, address: ' ' }],
      ['a 201 character address', { name: 'A', lat: 53.4, lng: -2.2, address: 'x'.repeat(201) }],
      ['an 81 character place reference', { name: 'A', lat: 53.4, lng: -2.2, placeRef: 'x'.repeat(81) }],
    ])('rejects %s', (_label, stop) => {
      expect(validatePack(withRoute([stop])).join('\n')).toMatch(/Route stop 1/);
    });
    it('needs the stops feature', () => {
      const p = { ...getPack('mystery'), features: { ...getPack('mystery').features, stops: false } };
      expect(validatePack(p).join('\n')).toMatch(/stops feature is off/);
    });
  });

  describe('periodic missions', () => {
    const seed = { id: 'drinks', name: 'Drinks check', prompts: ['Show us your drink'], intervalMin: 60, windowMin: 15, penalty: 5, count: 4 };
    const on = (periodics: unknown[] = [seed]) => ({
      ...getPack('lancaster'),
      features: { ...getPack('lancaster').features, checkins: true },
      periodics: periodics as NonNullable<ReturnType<typeof getPack>['periodics']>,
    });
    it('are optional, and fine when every field is in range', () => {
      expect(validatePack(on([]))).toEqual([]);
      expect(validatePack(on())).toEqual([]);
    });
    it.each([
      ['no prompts', { prompts: [] }],
      ['a blank prompt', { prompts: ['  '] }],
      ['a 201-character prompt', { prompts: ['x'.repeat(201)] }],
      ['a blank name', { name: ' ' }],
      ['a 4-minute interval', { intervalMin: 4 }],
      ['a fractional fine', { penalty: 2.5 }],
      ['a bad id', { id: 'Drinks Check' }],
    ])('rejects one with %s', (_label, over) => {
      expect(validatePack(on([{ ...seed, ...over }])).join('\n')).toMatch(/Periodic mission 1/);
    });
    it('rejects duplicate ids, and periodic missions without the feature', () => {
      expect(validatePack(on([seed, seed])).join('\n')).toMatch(/duplicate/);
      expect(validatePack({ ...getPack('lancaster'), periodics: [seed] }).join('\n')).toMatch(/checkins feature is off/);
    });
    it('rejects a blank name for them', () => {
      const p = on();
      expect(validatePack({ ...p, terms: { ...p.terms, checkin: { one: ' ', many: 'x' } } }).join('\n')).toMatch(/checkin/);
    });
  });

  describe('story missions (plan edge case 19)', () => {
    const body = { id: 's-body', title: 'The body is found', description: 'Your alibi, as a photo', judging: 'submit' as const };
    const withStory = (story: unknown[], features = {}) => {
      const p = testPack({ features });
      return { ...p, catalogue: { ...p.catalogue, story: story as NonNullable<GamePack['catalogue']['story']> } };
    };

    it('are optional, and fine with s- ids, a way of judging and whole numbers', () => {
      expect(validatePack(withStory([]))).toEqual([]);
      expect(validatePack(withStory([body, { id: 's-will', title: 'The will', description: 'x', judging: 'vote', windowMin: 30, points: 0, fastestBonus: 2, penalty: 0 }]))).toEqual([]);
      expect(validatePack(withStory([{ ...body, windowMin: null, points: null, fastestBonus: null, penalty: null }]))).toEqual([]);
    });

    it.each([
      ['an id without the s- prefix', { id: 'g-body' }, /prefix|s-/],
      ['a blank title', { title: '  ' }, /title/i],
      ['an unknown way of judging', { judging: 'secret' }, /judg/i],
      ['a 4-minute window', { windowMin: 4 }, /window|minute/i],
      ['a 181-minute window', { windowMin: 181 }, /window|minute/i],
      ['negative points', { points: -1 }, /points/i],
      ['fractional points', { points: 1.5 }, /points/i],
      ['a negative fastest bonus', { fastestBonus: -1 }, /fastest|bonus/i],
      ['a fractional fine', { penalty: 2.5 }, /fine|penalty/i],
    ])('rejects one with %s', (_label, over, message) => {
      const problems = validatePack(withStory([{ ...body, ...over }]));
      expect(problems.join('\n')).toMatch(/s-body|Story mission 1/);
      expect(problems.join('\n')).toMatch(message);
    });

    it('rejects an id used twice, in the story or anywhere in the catalogue', () => {
      expect(validatePack(withStory([body, body])).join('\n')).toMatch(/duplicate/i);
      const p = withStory([body]);
      const clash = { ...p, catalogue: { ...p.catalogue, global: [...p.catalogue.global, { id: 's-body', title: 'x', description: 'y' }] } };
      expect(validatePack(clash).join('\n')).toMatch(/duplicate/i);
    });

    it('rejects story missions in a pack with side quests off', () => {
      const p = withStory([body], { sideQuests: false });
      expect(validatePack({ ...p, catalogue: { ...p.catalogue, global: [] } }).join('\n')).toMatch(/story/i);
    });
  });

  describe('the optional standings and police words', () => {
    it('reject a blank one', () => {
      const p = getPack('lancaster');
      for (const key of ['confidant', 'poi', 'policeCall'] as const) {
        expect(validatePack({ ...p, terms: { ...p.terms, [key]: { one: ' ', many: 'x' } } }).join('\n'), key).toMatch(new RegExp(key));
      }
    });
  });

  describe("the GM's quick-button step", () => {
    it('is optional, and fine as a positive whole number', () => {
      expect(validatePack({ ...getPack('lancaster'), gmQuickPoints: undefined })).toEqual([]);
      expect(validatePack({ ...getPack('lancaster'), gmQuickPoints: 1 })).toEqual([]);
    });
    it.each([0, -1, 2.5, NaN])('rejects %s', (step) => {
      expect(validatePack({ ...getPack('lancaster'), gmQuickPoints: step }).join('\n')).toMatch(/gmQuickPoints/);
    });
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

describe('the built-in packs', () => {
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

describe('M18. the mystery pack', () => {
  it('is a murder-mystery pub crawl with every extra on', () => {
    const p = getPack('mystery');
    expect(p.name).toBe('Mystery Pub Crawl');
    expect(p.features).toEqual({ guesses: true, sideQuests: true, map: true, rewardChoice: true, characters: true, stops: true, checkins: true, police: true });
    expect(p.timeZone).toBe('Europe/London');
    expect(p.scoring).toBe('classic');
  });

  it('speaks of tampering missions, group missions, submissions, case files and periodic missions', () => {
    const p = getPack('mystery');
    expect(p.terms).toEqual({
      quest: { one: 'tampering mission', many: 'tampering missions' },
      sideQuest: { one: 'group mission', many: 'group missions' },
      witness: { one: 'witness', many: 'witnesses' },
      claim: { one: 'submission', many: 'submissions' },
      gm: { one: 'GM', many: 'GMs' },
      wrap: { one: 'case file', many: 'case files' },
      checkin: { one: 'periodic mission', many: 'periodic missions' },
    });
  });

  it('scores every move as 5 points, with a guess limit of 3, and scores may go below zero', () => {
    const s = defaultSettingsFor(getPack('mystery'));
    expect(s).toMatchObject({
      questPoints: 5,
      sideQuestPoints: 5,
      exposePenalty: 5,
      correctGuessReward: 5,
      wrongGuessCost: 5,
      fraudPenalty: 5,
      rejectPenalty: 5,
      sideQuestSkipPenalty: 5,
      cleanPoints: 5,
      framePoints: 5,
      guessLimit: 3,
      pointsFloorZero: false,
    });
  });

  it('starts the GM with one periodic mission: a roll call four times a night, an hour apart, 15 minutes to answer, 5 off', () => {
    const p = getPack('mystery');
    expect(p.features.checkins).toBe(true);
    expect(p.terms.checkin).toEqual({ one: 'periodic mission', many: 'periodic missions' });
    expect(p.periodics?.map(({ prompts, ...rest }) => ({ ...rest, prompts: prompts.length }))).toEqual([
      { id: 'roll-call', name: 'Roll call', intervalMin: 60, windowMin: 15, penalty: 5, count: 4, prompts: 10 },
    ]);
    expect(getPack('lancaster').features.checkins).toBeFalsy();
    expect(getPack('lancaster').periodics).toBeUndefined();
  });

  it("nudges by 1 point on the GM's quick buttons; other packs keep the default", () => {
    expect(getPack('mystery').gmQuickPoints).toBe(1);
    expect(getPack('lancaster').gmQuickPoints).toBeUndefined();
    expect(getPack('starter').gmQuickPoints).toBeUndefined();
  });

  it('has a map with no venues yet, and enough missions to deal from', () => {
    const p = getPack('mystery');
    expect(p.map).not.toBeNull();
    expect(p.venues).toEqual([]);
    expect(p.catalogue.personal.length).toBeGreaterThanOrEqual(20);
    expect(p.catalogue.global.length).toBeGreaterThanOrEqual(8);
  });

  it('opens on Didsbury with a seven-pub route and footprints between stops', () => {
    const p = getPack('mystery');
    expect(p.map).toMatchObject({ centre: { lat: 53.4145, lng: -2.2312 }, zoom: 16, placeName: 'Didsbury', routeStyle: 'footprints' });
    expect(p.map?.barSearch).toMatchObject({ name: 'Manchester' });
    expect(p.route?.map((s) => s.name)).toEqual([
      'The Didsbury',
      'Ye Olde Cock Inn',
      'The Crown',
      'The Royal Oak',
      'Fletcher Moss Pub',
      'Dog and Partridge',
      'Head of Steam',
    ]);
    expect(p.route?.[2]).toEqual({ name: 'The Crown', lat: 53.41571, lng: -2.23219, address: '770 Wilmslow Road, M20 2DR', placeRef: 'osm:node/27465378' });
    expect(p.route?.every((s) => s.address && s.placeRef?.startsWith('osm:'))).toBe(true);
  });

  it('has a character and a motive for each demo player', () => {
    const chars = getPack('mystery').demoCharacters ?? [];
    expect(chars.length).toBeGreaterThanOrEqual(4);
    for (const c of chars) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.name.length).toBeLessThanOrEqual(40);
      expect(c.role.trim().length).toBeGreaterThan(0);
      expect(c.motive.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(chars.map((c) => c.name)).size).toBe(chars.length);
  });

  it('the other packs keep every extra off', () => {
    for (const id of ['lancaster', 'starter']) {
      expect(getPack(id).features.rewardChoice ?? false, id).toBe(false);
      expect(getPack(id).features.characters ?? false, id).toBe(false);
      expect(getPack(id).features.police ?? false, id).toBe(false);
      expect(getPack(id).catalogue.story ?? [], id).toEqual([]);
    }
  });

  it('has a story to fire in order: s- ids, both ways of judging, every one valid', () => {
    const story = getPack('mystery').catalogue.story ?? [];
    expect(story.length).toBeGreaterThanOrEqual(5);
    expect(story.every((q) => q.id.startsWith('s-') && q.title.trim() && q.description.trim())).toBe(true);
    expect(new Set(story.map((q) => q.judging))).toEqual(new Set(['vote', 'submit']));
    expect(new Set(story.map((q) => q.id)).size).toBe(story.length);
  });

  it('puts a trusted confidant above 10 and a person of interest below −10, with police check-ins on', () => {
    expect(defaultSettingsFor(getPack('mystery'))).toMatchObject({
      autoSideQuests: true,
      confidantAbove: 10,
      poiBelow: -10,
      policeEveryMin: 30,
      policeTipEveryMin: 60,
      policeWindowMin: 5,
      policePassPoints: 5,
      policeFailPenalty: 5,
    });
  });

  it('the engine defaults keep the new rules off', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ guessLimit: 0, sideQuestSkipPenalty: 0 });
    for (const id of ['lancaster', 'starter']) {
      expect(defaultSettingsFor(getPack(id)), id).toMatchObject({ guessLimit: 0, sideQuestSkipPenalty: 0 });
    }
  });

  it('the engine defaults drop random side quests on the timer and leave the standings off', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      autoSideQuests: true,
      confidantAbove: null,
      poiBelow: null,
      policeEveryMin: 30,
      policeTipEveryMin: 60,
      policeWindowMin: 5,
      policePassPoints: 5,
      policeFailPenalty: 5,
    });
    for (const id of ['lancaster', 'starter']) {
      expect(defaultSettingsFor(getPack(id)), id).toMatchObject({ autoSideQuests: true, confidantAbove: null, poiBelow: null });
    }
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

  it('gives the standings and a police check-in their engine words when the pack names none', () => {
    const t = termForms(DARE_TERMS);
    expect(t.confidant).toEqual({ one: 'trusted confidant', One: 'Trusted confidant', many: 'trusted confidants', Many: 'Trusted confidants' });
    expect(t.poi).toEqual({ one: 'person of interest', One: 'Person of interest', many: 'persons of interest', Many: 'Persons of interest' });
    expect(t.policeCall).toEqual({ one: 'police check-in', One: 'Police check-in', many: 'police check-ins', Many: 'Police check-ins' });
  });

  it("takes the pack's own words for them", () => {
    const t = termForms({ ...DARE_TERMS, poi: { one: 'black sheep', many: 'black sheep' }, policeCall: { one: 'raid', many: 'raids' } });
    expect(t.poi.One).toBe('Black sheep');
    expect(t.policeCall.Many).toBe('Raids');
    expect(t.confidant.one).toBe('trusted confidant');
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
