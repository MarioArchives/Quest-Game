// Engine plan edge case 4: the seed script picks a pack, guards game/state against a pack switch, fills
// settings without ever replacing GM values, and only seeds demo parts the pack has.
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettingsFor, getPack } from '../../functions/src/shared/packs/index.ts';
import { demoParts, planPeriodics, planRoute, planSettings, planState, resolvePackId } from './seed-plan.mjs';

describe('resolvePackId', () => {
  it('takes --pack <id> and --pack=<id>', () => {
    expect(resolvePackId(['--demo', '--pack', 'starter'], {})).toBe('starter');
    expect(resolvePackId(['--pack=starter'], {})).toBe('starter');
  });

  it('falls back to GAME_PACK, then the default pack', () => {
    expect(resolvePackId([], { GAME_PACK: 'starter' })).toBe('starter');
    expect(resolvePackId([], {})).toBe('lancaster');
    expect(resolvePackId([], { GAME_PACK: '' })).toBe('lancaster');
  });

  it('the flag wins over the environment', () => {
    expect(resolvePackId(['--pack', 'lancaster'], { GAME_PACK: 'starter' })).toBe('lancaster');
  });

  it('throws on an unknown pack, naming the known ones', () => {
    expect(() => resolvePackId(['--pack', 'nope'], {})).toThrow(/nope/);
    expect(() => resolvePackId(['--pack', 'nope'], {})).toThrow(/lancaster/);
    expect(() => resolvePackId([], { GAME_PACK: 'nope' })).toThrow(/nope/);
  });

  it('throws when --pack has no value', () => {
    expect(() => resolvePackId(['--pack'], {})).toThrow(/--pack/);
    expect(() => resolvePackId(['--pack='], {})).toThrow(/--pack/);
  });
});

describe('planState', () => {
  it('creates a lobby that names the pack when there is no state', () => {
    const plan = planState(undefined, 'starter', { switchPack: false });
    expect(plan.action).toBe('create');
    expect(plan.data).toEqual({ status: 'lobby', startedAt: null, endedAt: null, nextGlobalQuestAt: null, announcement: null, pack: 'starter' });
  });

  it('adds the pack to a state seeded before packs existed', () => {
    const plan = planState({ status: 'active' }, 'lancaster', { switchPack: false });
    expect(plan).toMatchObject({ action: 'set-pack', data: { pack: 'lancaster' } });
    expect(planState({ status: 'active', pack: null }, 'lancaster', { switchPack: false }).action).toBe('set-pack');
  });

  it('keeps a state that already names this pack', () => {
    expect(planState({ status: 'active', pack: 'starter' }, 'starter', { switchPack: false }).action).toBe('keep');
  });

  it('refuses to switch a game to another pack, naming both', () => {
    const plan = planState({ status: 'active', pack: 'lancaster' }, 'starter', { switchPack: false });
    expect(plan.action).toBe('refuse');
    expect(plan.data).toBeUndefined();
    expect(plan.message).toMatch(/lancaster/);
    expect(plan.message).toMatch(/starter/);
    expect(plan.message).toMatch(/--switch-pack/);
  });

  it('switches with --switch-pack', () => {
    expect(planState({ status: 'active', pack: 'lancaster' }, 'starter', { switchPack: true })).toMatchObject({
      action: 'switch',
      data: { pack: 'starter' },
    });
  });
});

describe('planSettings', () => {
  let defaults: ReturnType<typeof defaultSettingsFor>;
  beforeEach(() => {
    defaults = defaultSettingsFor(getPack('lancaster'));
  });

  it('writes the full defaults when there is no settings doc', () => {
    expect(planSettings(undefined, defaults, { reset: false })).toEqual({ mode: 'set', data: defaults, added: Object.keys(defaults) });
  });

  it('writes the full defaults on --reset-settings, even over GM values', () => {
    const plan = planSettings({ ...defaults, questPoints: 5 }, defaults, { reset: true });
    expect(plan.mode).toBe('set');
    expect(plan.data).toEqual(defaults);
  });

  it('adds only missing keys and never replaces a GM value', () => {
    const { questPoints: _q, rerollLimit: _r, ...rest } = defaults;
    const existing = { ...rest, rerollLimit: 2, fraudPenalty: 999 };
    const plan = planSettings(existing, defaults, { reset: false });
    expect(plan.mode).toBe('merge');
    expect(plan.data).toEqual({ questPoints: defaults.questPoints });
    expect(plan.added).toEqual(['questPoints']);
  });

  it('fills missing scoring params one by one, keeping the GM ones', () => {
    const existing = { ...defaults, scoringParams: { witnessReward: 3 } };
    const plan = planSettings(existing, defaults, { reset: false });
    expect(plan.mode).toBe('merge');
    expect(plan.data).toEqual({ scoringParams: { decayPctPerHour: defaults.scoringParams.decayPctPerHour, floorPct: defaults.scoringParams.floorPct } });
    expect(plan.added.sort()).toEqual(['scoringParams.decayPctPerHour', 'scoringParams.floorPct']);
  });

  it('adds scoring and scoringParams to a settings doc from before rule sets', () => {
    const { scoring: _s, scoringParams: _p, ...old } = defaults;
    const plan = planSettings({ ...old, globalEntryPoints: 0 }, defaults, { reset: false });
    expect(plan.data).toEqual({ scoring: 'classic', scoringParams: defaults.scoringParams });
    expect(plan.added).toEqual(expect.arrayContaining(['scoring', 'scoringParams']));
  });

  it('does nothing when nothing is missing (legacy keys are left alone)', () => {
    expect(planSettings({ ...defaults, globalEntryPoints: 0 }, defaults, { reset: false })).toEqual({ mode: 'none', data: {}, added: [] });
  });
});

describe('demoParts', () => {
  it('map pins only with the map, a side quest only with side quests', () => {
    expect(demoParts({ guesses: true, sideQuests: true, map: true })).toEqual({ locations: true, sideQuest: true });
    expect(demoParts({ guesses: true, sideQuests: true, map: false })).toEqual({ locations: false, sideQuest: true });
    expect(demoParts({ guesses: true, sideQuests: false, map: true })).toEqual({ locations: true, sideQuest: false });
  });
});

describe('planRoute', () => {
  it('turns the pack’s route into hidden, untimed stops route-1..n in order', () => {
    const plan = planRoute(getPack('mystery'));
    expect(plan.map((s) => s.id)).toEqual(['route-1', 'route-2', 'route-3', 'route-4', 'route-5', 'route-6']);
    expect(plan.map((s) => s.data.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan[0].data).toEqual({
      name: 'The Badger',
      lat: 53.48162,
      lng: -2.23408,
      order: 1,
      address: '24 Dale Street, M1 1FY',
      placeRef: 'osm:node/3114683531',
      placeName: 'The Badger',
      startsAt: null,
      endsAt: null,
      revealed: false,
    });
    expect(plan.every((s) => s.data.revealed === false)).toBe(true);
  });

  it('is empty for packs with no stops or no route', () => {
    expect(planRoute(getPack('lancaster'))).toEqual([]);
    expect(planRoute(getPack('starter'))).toEqual([]);
    expect(planRoute({ ...getPack('mystery'), features: { ...getPack('mystery').features, stops: false } })).toEqual([]);
    expect(planRoute({ ...getPack('mystery'), route: undefined })).toEqual([]);
  });
});

describe('planPeriodics', () => {
  it("turns the pack's periodic missions into running series with nothing sent yet", () => {
    const plan = planPeriodics(getPack('mystery'));
    expect(plan.map((p) => p.id)).toEqual(['roll-call']);
    expect(plan[0]!.data).toMatchObject({ name: 'Roll call', intervalMin: 60, windowMin: 15, penalty: 5, count: 4, sent: 0, status: 'running', nextAt: null });
    expect(plan[0]!.data.prompts.length).toBe(10);
  });

  it('is empty for packs without periodic missions', () => {
    expect(planPeriodics(getPack('lancaster'))).toEqual([]);
    expect(planPeriodics({ ...getPack('mystery'), features: { ...getPack('mystery').features, checkins: false } })).toEqual([]);
  });
});
