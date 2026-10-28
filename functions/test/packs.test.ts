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

  describe("an arc's new fields (plan \"Mystery pack: minimal notifications, Bob's story arc…\", edge case 10)", () => {
    const photo = { id: 's-photo', title: 'Incriminating evidence', description: 'x', judging: 'vote' as const, longRun: true, windowMin: 720, entry: { tag: 'player' as const } };
    const time = { id: 's-time', kind: 'announce' as const, title: 'Time of death', description: 'At 11:02 pm.', fact: { key: 'timeOfDeath', label: 'Time of death', value: '23:02' } };
    const reveal = { id: 's-reveal', kind: 'announce' as const, title: 'Revealed', description: 'Vote now.', opensVoteOn: 's-photo' };
    const weapon = {
      id: 's-weapon', title: 'The weapon', description: 'x', judging: 'vote' as const, entry: { caption: 'required' as const },
      votePoints: 2, tieBonus: 1, records: { key: 'weapon', label: 'The weapon' },
    };
    const withStory = (story: unknown[]) => {
      const p = testPack();
      return { ...p, catalogue: { ...p.catalogue, story: story as NonNullable<GamePack['catalogue']['story']> } };
    };

    it('accepts long-running missions up to 720 minutes, every kind of entry, vote points, tie bonuses, facts and announcements', () => {
      expect(validatePack(withStory([photo, time, reveal, weapon]))).toEqual([]);
      expect(validatePack(withStory([
        { ...weapon, id: 's-a', entry: { media: 'video' }, votePoints: 0, tieBonus: 0, records: undefined },
        { ...weapon, id: 's-b', entry: { media: 'text', tag: 'assigned' }, judging: 'submit', records: undefined },
      ]))).toEqual([]);
    });

    const V = /vote points|votePoints|per vote/i;
    const OPENS = /opensVoteOn|opens the vote|opens a vote|vote on/i;
    it.each([
      ['an announcement with a way of judging', [{ ...time, judging: 'vote' }], 's-time', /judg/i],
      ['an announcement with points', [{ ...time, points: 3 }], 's-time', /points/i],
      ['an announcement with a window', [{ ...time, windowMin: 20 }], 's-time', /window|minute/i],
      ['an announcement with entry settings', [{ ...time, entry: { media: 'photo' } }], 's-time', /entry/i],
      ['an announcement with vote points', [{ ...time, votePoints: 2 }], 's-time', V],
      ['a mission with no way of judging', [{ ...weapon, judging: undefined }], 's-weapon', /judg/i],
      ['an announcement opening the vote on a mission not in the story', [photo, { ...reveal, opensVoteOn: 's-nope' }], 's-reveal', OPENS],
      ['an announcement opening the vote on another announcement', [time, { ...reveal, opensVoteOn: 's-time' }], 's-reveal', OPENS],
      ['a mission (not an announcement) opening a vote', [photo, { ...weapon, opensVoteOn: 's-photo' }], 's-weapon', OPENS],
      ['a fact with a blank key', [{ ...time, fact: { key: ' ', label: 'Time', value: '23:02' } }], 's-time', /fact|key/i],
      ['a fact with a blank value', [{ ...time, fact: { key: 'timeOfDeath', label: 'Time', value: '' } }], 's-time', /fact|value/i],
      ['a recorded fact with a blank label', [{ ...weapon, records: { key: 'weapon', label: '  ' } }], 's-weapon', /record|label|fact/i],
      ['a long-running window of 721 minutes', [{ ...photo, windowMin: 721 }], 's-photo', /window|minute/i],
      ['a 181-minute window on a mission that is not long-running', [{ ...weapon, windowMin: 181 }], 's-weapon', /window|minute/i],
      ['negative vote points', [{ ...weapon, votePoints: -1 }], 's-weapon', V],
      ['fractional vote points', [{ ...weapon, votePoints: 1.5 }], 's-weapon', V],
      ['a negative tie bonus', [{ ...weapon, tieBonus: -1 }], 's-weapon', /tie/i],
      ['an unknown kind of media', [{ ...weapon, entry: { media: 'audio' } }], 's-weapon', /media/i],
      ['an unknown kind of tag', [{ ...weapon, entry: { tag: 'team' } }], 's-weapon', /tag/i],
      ['an unknown kind', [{ ...weapon, kind: 'interlude' }], 's-weapon', /kind/i],
    ])('rejects %s, naming the mission and what is wrong', (_label, story, id, what) => {
      const problems = validatePack(withStory(story));
      expect(problems.some((line) => line.includes(id) && what.test(line)), problems.join('\n')).toBe(true);
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

  it('speaks of tampering missions, group missions, submissions, case files, periodic missions and a log book', () => {
    const p = getPack('mystery');
    expect(p.terms).toEqual({
      quest: { one: 'tampering mission', many: 'tampering missions' },
      sideQuest: { one: 'group mission', many: 'group missions' },
      witness: { one: 'witness', many: 'witnesses' },
      claim: { one: 'submission', many: 'submissions' },
      gm: { one: 'GM', many: 'GMs' },
      wrap: { one: 'case file', many: 'case files' },
      checkin: { one: 'periodic mission', many: 'periodic missions' },
      feed: { one: 'log book', many: 'log books' },
    });
  });

  it('scores every move as 5 points (a confirmed mission only through its reward), with a guess limit of 3, and scores may go below zero', () => {
    const s = defaultSettingsFor(getPack('mystery'));
    expect(s).toMatchObject({
      questPoints: 0,
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

  it('opens on Manchester city centre with a six-bar route, Oxford Road to the Northern Quarter, and footprints between stops', () => {
    const p = getPack('mystery');
    expect(p.map).toMatchObject({ centre: { lat: 53.4731, lng: -2.2343 }, zoom: 14, placeName: 'Manchester city centre', routeStyle: 'footprints' });
    expect(p.map?.barSearch).toMatchObject({ name: 'Manchester' });
    expect(p.route?.map((s) => s.name)).toEqual(['Big Hands', 'The Grosvenor', 'YES', 'The Badger', 'Flok', 'The Mother of Invention']);
    expect(p.route?.find((s) => s.name === 'Flok')).toEqual({ name: 'Flok', lat: 53.48276, lng: -2.23372, address: '5 Stevenson Square, M1 1DN', placeRef: 'osm:node/6358776626' });
    // Every stop has an address; all but The Mother of Invention (newer than the map) come from OpenStreetMap.
    expect(p.route?.every((s) => s.address)).toBe(true);
    expect(p.route?.filter((s) => !s.placeRef?.startsWith('osm:')).map((s) => s.name)).toEqual(['The Mother of Invention']);
    // All in the city centre, within the bar search's box and about a kilometre and a quarter of the map's centre.
    for (const s of p.route ?? []) {
      expect(Math.abs(s.lat - p.map!.centre.lat), s.name).toBeLessThan(0.012);
      expect(Math.abs(s.lng - p.map!.centre.lng), s.name).toBeLessThan(0.012);
    }
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

  it('has a story to fire in order: s- ids, missions judged both ways, announcements judged neither way, every one valid', () => {
    const story = getPack('mystery').catalogue.story ?? [];
    expect(story.length).toBeGreaterThanOrEqual(5);
    expect(story.every((q) => q.id.startsWith('s-') && q.title.trim() && q.description.trim())).toBe(true);
    const missions = story.filter((q) => (q.kind ?? 'mission') === 'mission');
    expect(new Set(missions.map((q) => q.judging))).toEqual(new Set(['vote', 'submit']));
    expect(story.filter((q) => q.kind === 'announce').every((q) => q.judging === undefined)).toBe(true);
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

  it('calls the feed a feed unless the pack says otherwise (the mystery pack: a log book)', () => {
    expect(termForms(DARE_TERMS).feed.one).toBe('feed');
    expect(termForms(getPack('lancaster').terms).feed.One).toBe('Feed');
    expect(termForms(getPack('mystery').terms).feed).toEqual({ one: 'log book', One: 'Log book', many: 'log books', Many: 'Log books' });
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

describe('the way of voting and the vote’s question (plan "Voting takeover…", edge case 1)', () => {
  it('the engine votes one each; the mystery pack votes yes or no on every entry', () => {
    expect(DEFAULT_SETTINGS.voteStyle).toBe('pick');
    expect(defaultSettingsFor(getPack('lancaster')).voteStyle).toBe('pick');
    expect(defaultSettingsFor(getPack('starter')).voteStyle).toBe('pick');
    expect(defaultSettingsFor(getPack('mystery')).voteStyle).toBe('yesno');
  });

  it("the mystery pack's voted story missions ask their questions", () => {
    const story = getPack('mystery').catalogue.story ?? [];
    const asks = Object.fromEntries(story.filter((s) => s.question).map((s) => [s.id, s.question]));
    expect(asks).toEqual({
      's-incriminating': 'Most damning?',
      's-old-days': 'Best memory of Bob?',
      's-weapon': 'What killed Bob?',
      's-alibi': 'Best alibi?',
      's-scene': 'Where did it happen?',
    });
  });

  const withStory = (story: unknown[]) => {
    const p = testPack();
    return { ...p, catalogue: { ...p.catalogue, story: story as NonNullable<GamePack['catalogue']['story']> } };
  };
  const vote = { id: 's-vote', title: 'The weapon', description: 'x', judging: 'vote' as const };

  it('accepts a question on a mission judged by a vote, and none at all', () => {
    expect(validatePack(withStory([{ ...vote, question: 'What killed Bob?' }]))).toEqual([]);
    expect(validatePack(withStory([vote]))).toEqual([]);
  });

  it.each([
    ['a blank question', [{ ...vote, question: '  ' }], 's-vote'],
    ['a question that is not words', [{ ...vote, question: 42 }], 's-vote'],
    ['a question over 60 characters', [{ ...vote, question: 'W'.repeat(61) }], 's-vote'],
    ['a question on a mission judged by submission', [{ ...vote, judging: 'submit', question: 'Who?' }], 's-vote'],
    [
      'a question on an announcement',
      [{ id: 's-note', kind: 'announce', title: 'Note', description: 'x', question: 'Who?' }],
      's-note',
    ],
  ])('rejects %s, naming the mission and the question', (_label, story, id) => {
    const problems = validatePack(withStory(story));
    expect(problems.some((line) => line.includes(id) && /question/i.test(line)), problems.join('\n')).toBe(true);
  });
});
