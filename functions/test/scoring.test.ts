// Engine plan edge cases 13 and 16-22 for the pure scoring code: the rule sets, the checks the engine runs on
// what they return, the zero floor and transfers, fallbacks, and House-rules descriptions. No emulator needed.
import { describe, expect, it } from 'vitest';
import { termForms } from '../src/shared/packs/terms.js';
import type { Features } from '../src/shared/packs/types.js';
import {
  appliedDelta,
  paramDefaults,
  participants,
  planScore,
  resolveParams,
  resolveRules,
  roundPoints,
  scoreEvent,
} from '../src/shared/scoring/engine.js';
import { classic, countdown, getRules, heist, RULESETS } from '../src/shared/scoring/index.js';
import type { ScoreContext, ScoreEvent, ScoreLine, ScoringRules } from '../src/shared/scoring/types.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { Settings } from '../src/shared/types.js';
import { DARE_TERMS } from './packs.js';
import { getPack } from '../src/shared/packs/index.js';

const HOUR = 3_600_000;
const START = new Date('2026-10-10T10:00:00Z');
const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  questPoints: 100,
  sideQuestPoints: 100,
  exposePenalty: 50,
  correctGuessReward: 25,
  wrongGuessCost: 10,
  fraudPenalty: 50,
  rejectPenalty: 25,
  pointsFloorZero: false,
  scoring: 'classic',
  scoringParams: {},
};

function sctx(rules: ScoringRules, over: Partial<ScoreContext> = {}): ScoreContext {
  return { settings: SETTINGS, params: resolveParams(rules, undefined), now: START, startedAt: null, ...over };
}

const pts = (uid: string, delta: number, reason: string): ScoreLine => ({ kind: 'points', uid, delta, reason } as ScoreLine);

const approved = (questPoints: number | null = null, approver: string | null = 'bob'): ScoreEvent => ({
  kind: 'questApproved',
  uid: 'alice',
  approver,
  questPoints,
});

/** A rule set that returns whatever lines it is given, to test the engine's checks. */
function fake(lines: ScoreLine[]): ScoringRules {
  return { id: 'fake', name: 'Fake', summary: 'Test only', params: [], score: () => lines, describe: () => [] };
}

describe('E13. classic is exactly the old maths', () => {
  const run = (e: ScoreEvent, settings: Partial<Settings> = {}) =>
    scoreEvent(classic, e, sctx(classic, { settings: { ...SETTINGS, ...settings } }));

  it('quest approved: +questPoints to the claimant, nothing to the witness', () => {
    expect(run(approved())).toEqual([pts('alice', 100, 'quest')]);
  });

  it('claim rejected: -rejectPenalty', () => {
    expect(run({ kind: 'claimRejected', uid: 'alice' })).toEqual([pts('alice', -25, 'rejected')]);
  });

  it('fraud: -fraudPenalty', () => {
    expect(run({ kind: 'fraudFine', uid: 'alice' })).toEqual([pts('alice', -50, 'fraud')]);
  });

  it('right guess: the target loses exposePenalty first, then the guesser gains correctGuessReward', () => {
    expect(run({ kind: 'guessRight', guesser: 'alice', target: 'bob' })).toEqual([
      pts('bob', -50, 'exposed'),
      pts('alice', 25, 'guess-correct'),
    ]);
  });

  it('wrong guess: the guesser loses wrongGuessCost and the target gets nothing', () => {
    expect(run({ kind: 'guessWrong', guesser: 'alice', target: 'bob' })).toEqual([pts('alice', -10, 'guess-wrong')]);
  });

  it("side quest won: the side quest's bonus", () => {
    expect(run({ kind: 'sideQuestWon', uid: 'alice', bonus: 80, votes: 3 })).toEqual([pts('alice', 80, 'global-win')]);
  });

  it('a fine set to 0 gives no line at all (so no ledger entry)', () => {
    expect(run({ kind: 'claimRejected', uid: 'alice' }, { rejectPenalty: 0 })).toEqual([]);
    expect(run({ kind: 'guessRight', guesser: 'alice', target: 'bob' }, { correctGuessReward: 0 })).toEqual([
      pts('bob', -50, 'exposed'),
    ]);
  });
});

describe("E14 (pure). a quest's own points", () => {
  it('classic pays the quest points when the quest has them, else questPoints', () => {
    expect(scoreEvent(classic, approved(30), sctx(classic))).toEqual([pts('alice', 30, 'quest')]);
    expect(scoreEvent(classic, approved(null), sctx(classic))).toEqual([pts('alice', 100, 'quest')]);
  });
});

describe('E16. the engine checks what a rule set returns', () => {
  it('roundPoints rounds half away from zero and never returns -0', () => {
    expect(roundPoints(2.5)).toBe(3);
    expect(roundPoints(-2.5)).toBe(-3);
    expect(roundPoints(2.4)).toBe(2);
    expect(roundPoints(-2.4)).toBe(-2);
    expect(roundPoints(7)).toBe(7);
    expect(Object.is(roundPoints(-0.4), 0)).toBe(true);
    expect(Object.is(roundPoints(-0), 0)).toBe(true);
  });

  it('roundPoints throws on NaN and Infinity', () => {
    expect(() => roundPoints(Number.NaN)).toThrow(RangeError);
    expect(() => roundPoints(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => roundPoints(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('participants are the uids the event names', () => {
    expect(participants(approved(null, 'bob')).sort()).toEqual(['alice', 'bob']);
    expect(participants(approved(null, null))).toEqual(['alice']);
    expect(participants({ kind: 'guessRight', guesser: 'alice', target: 'bob' }).sort()).toEqual(['alice', 'bob']);
    expect(participants({ kind: 'guessWrong', guesser: 'alice', target: 'bob' }).sort()).toEqual(['alice', 'bob']);
    expect(participants({ kind: 'claimRejected', uid: 'carol' })).toEqual(['carol']);
    expect(participants({ kind: 'fraudFine', uid: 'carol' })).toEqual(['carol']);
    expect(participants({ kind: 'sideQuestWon', uid: 'carol', bonus: 100, votes: 2 })).toEqual(['carol']);
  });

  it('rounds fractional amounts', () => {
    const rules = fake([
      pts('alice', 92.5, 'quest'),
      { kind: 'transfer', from: 'bob', to: 'alice', amount: 10.5, fromReason: 'exposed', toReason: 'guess-correct' },
    ]);
    expect(scoreEvent(rules, approved(), sctx(rules))).toEqual([
      pts('alice', 93, 'quest'),
      { kind: 'transfer', from: 'bob', to: 'alice', amount: 11, fromReason: 'exposed', toReason: 'guess-correct' },
    ]);
  });

  it('drops lines that round to zero', () => {
    const rules = fake([
      pts('alice', 0.4, 'quest'),
      pts('bob', 0, 'witness'),
      { kind: 'transfer', from: 'bob', to: 'alice', amount: 0, fromReason: 'exposed', toReason: 'guess-correct' },
    ]);
    expect(scoreEvent(rules, approved(), sctx(rules))).toEqual([]);
  });

  it('refuses NaN and Infinity', () => {
    const nan = fake([pts('alice', Number.NaN, 'quest')]);
    expect(() => scoreEvent(nan, approved(), sctx(nan))).toThrow(/finite|NaN/i);
    const inf = fake([{ kind: 'transfer', from: 'bob', to: 'alice', amount: Infinity, fromReason: 'exposed', toReason: 'guess-correct' }]);
    expect(() => scoreEvent(inf, approved(), sctx(inf))).toThrow(/finite|Infinity/i);
  });

  it('refuses a line for a uid the event does not name', () => {
    const rules = fake([pts('mallory', 10, 'quest')]);
    expect(() => scoreEvent(rules, approved(), sctx(rules))).toThrow(/mallory/);
    const transfer = fake([{ kind: 'transfer', from: 'mallory', to: 'alice', amount: 5, fromReason: 'exposed', toReason: 'guess-correct' }]);
    expect(() => scoreEvent(transfer, approved(), sctx(transfer))).toThrow(/mallory/);
  });

  it('refuses a line for the approver when there is none', () => {
    const rules = fake([pts('bob', 10, 'witness')]);
    expect(() => scoreEvent(rules, approved(null, null), sctx(rules))).toThrow(/bob/);
  });

  it('refuses a negative transfer', () => {
    const rules = fake([{ kind: 'transfer', from: 'bob', to: 'alice', amount: -5, fromReason: 'exposed', toReason: 'guess-correct' }]);
    expect(() => scoreEvent(rules, approved(), sctx(rules))).toThrow(/negative/i);
  });

  it('appliedDelta: the floor stops a loss at zero, never trims a gain or lifts a negative total', () => {
    expect(appliedDelta(10, -25, true)).toBe(-10);
    expect(appliedDelta(-5, -10, true)).toBe(0);
    expect(appliedDelta(-5, 10, true)).toBe(10);
    expect(appliedDelta(10, -25, false)).toBe(-25);
    expect(Object.is(appliedDelta(0, -5, true), 0)).toBe(true);
    expect(Object.is(appliedDelta(3, -0, true), 0)).toBe(true);
  });
});

describe('E16/E17. planScore', () => {
  const balances = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it('applies lines in order and threads the totals', () => {
    const { entries, balances: after } = planScore(
      [pts('bob', -50, 'exposed'), pts('alice', 25, 'guess-correct'), pts('alice', -10, 'adjust')],
      balances({ alice: 100, bob: 200 }),
      false,
    );
    expect(entries).toEqual([
      { uid: 'bob', reason: 'exposed', requested: -50, delta: -50 },
      { uid: 'alice', reason: 'guess-correct', requested: 25, delta: 25 },
      { uid: 'alice', reason: 'adjust', requested: -10, delta: -10 },
    ]);
    expect(Object.fromEntries(after)).toEqual({ alice: 115, bob: 150 });
  });

  it('does not change the balances it was given', () => {
    const before = balances({ alice: 100 });
    planScore([pts('alice', 5, 'quest')], before, false);
    expect(before.get('alice')).toBe(100);
  });

  it('applies the zero floor to a loss but keeps the entry (requested vs applied)', () => {
    const { entries, balances: after } = planScore([pts('alice', -25, 'rejected')], balances({ alice: 10 }), true);
    expect(entries).toEqual([{ uid: 'alice', reason: 'rejected', requested: -25, delta: -10 }]);
    expect(after.get('alice')).toBe(0);
  });

  it('skips a line for someone with no player doc (a GM who is not playing)', () => {
    const { entries, balances: after } = planScore(
      [pts('alice', 100, 'quest'), pts('gm', 10, 'witness')],
      balances({ alice: 0 }),
      false,
    );
    expect(entries).toEqual([{ uid: 'alice', reason: 'quest', requested: 100, delta: 100 }]);
    expect(after.has('gm')).toBe(false);
  });

  it('writes no entry for a zero line', () => {
    expect(planScore([pts('alice', 0, 'quest')], balances({ alice: 5 }), false).entries).toEqual([]);
  });

  const steal: ScoreLine = { kind: 'transfer', from: 'bob', to: 'alice', amount: 50, fromReason: 'exposed', toReason: 'guess-correct' };

  it('a transfer with the floor off moves the full amount', () => {
    const { entries, balances: after } = planScore([steal], balances({ alice: 0, bob: 10 }), false);
    expect(entries).toEqual([
      { uid: 'bob', reason: 'exposed', requested: -50, delta: -50 },
      { uid: 'alice', reason: 'guess-correct', requested: 50, delta: 50 },
    ]);
    expect(Object.fromEntries(after)).toEqual({ alice: 50, bob: -40 });
  });

  it('a transfer with the floor on gives the receiver only what was taken', () => {
    const { entries, balances: after } = planScore([steal], balances({ alice: 0, bob: 10 }), true);
    expect(entries).toEqual([
      { uid: 'bob', reason: 'exposed', requested: -50, delta: -10 },
      { uid: 'alice', reason: 'guess-correct', requested: 50, delta: 10 },
    ]);
    expect(Object.fromEntries(after)).toEqual({ alice: 10, bob: 0 });
  });

  it('a transfer from someone already below zero, with the floor on, moves nothing but still records both sides', () => {
    const { entries, balances: after } = planScore([steal], balances({ alice: 0, bob: -5 }), true);
    expect(entries).toEqual([
      { uid: 'bob', reason: 'exposed', requested: -50, delta: 0 },
      { uid: 'alice', reason: 'guess-correct', requested: 50, delta: 0 },
    ]);
    expect(Object.fromEntries(after)).toEqual({ alice: 0, bob: -5 });
  });

  it('skips a transfer if either side is not a player', () => {
    expect(planScore([steal], balances({ bob: 100 }), false).entries).toEqual([]);
    expect(planScore([steal], balances({ alice: 100 }), false).entries).toEqual([]);
  });
});

describe('E18. fallbacks', () => {
  it('uses settings.scoring when it is a known rule set', () => {
    expect(resolveRules({ scoring: 'heist' }, { scoring: 'classic' }).id).toBe('heist');
  });

  it("falls back to the pack's default for an unknown or missing id", () => {
    expect(resolveRules({ scoring: 'nope' }, { scoring: 'countdown' }).id).toBe('countdown');
    expect(resolveRules({ scoring: undefined as unknown as string }, { scoring: 'countdown' }).id).toBe('countdown');
  });

  it("falls back to classic when the pack's default is unknown too", () => {
    expect(resolveRules({ scoring: 'nope' }, { scoring: 'also-nope' }).id).toBe('classic');
  });

  it('resolveParams fills defaults for missing, non-numeric and non-finite values', () => {
    expect(resolveParams(countdown, undefined)).toEqual({ decayPctPerHour: 5, floorPct: 25 });
    expect(resolveParams(countdown, null)).toEqual({ decayPctPerHour: 5, floorPct: 25 });
    expect(resolveParams(countdown, { decayPctPerHour: '7', floorPct: Number.NaN })).toEqual({ decayPctPerHour: 5, floorPct: 25 });
    expect(resolveParams(countdown, { decayPctPerHour: Infinity })).toEqual({ decayPctPerHour: 5, floorPct: 25 });
  });

  it('resolveParams clamps to min and max and keeps only its own keys', () => {
    expect(resolveParams(countdown, { decayPctPerHour: 500, floorPct: -3, witnessReward: 99 })).toEqual({
      decayPctPerHour: 100,
      floorPct: 0,
    });
    expect(resolveParams(heist, { witnessReward: 7, floorPct: 50 })).toEqual({ witnessReward: 7 });
    expect(resolveParams(classic, { witnessReward: 7 })).toEqual({});
  });

  it('paramDefaults gathers every default', () => {
    expect(paramDefaults(Object.values(RULESETS))).toEqual({ decayPctPerHour: 5, floorPct: 25, witnessReward: 10 });
  });
});

describe('E19. countdown', () => {
  const run = (e: ScoreEvent, now: Date, startedAt: Date | null = START, params?: Record<string, number>) =>
    scoreEvent(countdown, e, sctx(countdown, { now, startedAt, params: params ?? resolveParams(countdown, undefined) }));

  it('pays in full before the game starts', () => {
    expect(run(approved(), at(5), null)).toEqual([pts('alice', 100, 'quest')]);
  });

  it('pays in full at the start, and if the clock reads earlier than the start', () => {
    expect(run(approved(), at(0))).toEqual([pts('alice', 100, 'quest')]);
    expect(run(approved(), at(-1))).toEqual([pts('alice', 100, 'quest')]);
  });

  it('loses decayPctPerHour per hour since the start', () => {
    expect(run(approved(), at(2))).toEqual([pts('alice', 90, 'quest')]);
    expect(run(approved(), at(10))).toEqual([pts('alice', 50, 'quest')]);
  });

  it('rounds the result (92.5 → 93; 28.5 → 29)', () => {
    expect(run(approved(), at(1.5))).toEqual([pts('alice', 93, 'quest')]);
    expect(run(approved(30), at(1))).toEqual([pts('alice', 29, 'quest')]);
  });

  it('reaches the floor exactly and never goes below it', () => {
    expect(run(approved(), at(15))).toEqual([pts('alice', 25, 'quest')]);
    expect(run(approved(), at(40))).toEqual([pts('alice', 25, 'quest')]);
  });

  it('a floor of 0 can bring a quest down to nothing (no line)', () => {
    expect(run(approved(), at(12), START, { decayPctPerHour: 10, floorPct: 0 })).toEqual([]);
  });

  it('scores everything else like classic', () => {
    expect(run({ kind: 'claimRejected', uid: 'alice' }, at(3))).toEqual([pts('alice', -25, 'rejected')]);
    expect(run({ kind: 'guessRight', guesser: 'alice', target: 'bob' }, at(3))).toEqual([
      pts('bob', -50, 'exposed'),
      pts('alice', 25, 'guess-correct'),
    ]);
    expect(run({ kind: 'sideQuestWon', uid: 'alice', bonus: 100, votes: 1 }, at(30))).toEqual([pts('alice', 100, 'global-win')]);
  });
});

describe('E20 (pure). heist', () => {
  const run = (e: ScoreEvent, params?: Record<string, number>) =>
    scoreEvent(heist, e, sctx(heist, { params: params ?? resolveParams(heist, undefined) }));

  it('approval pays the claimant and the approver gets witnessReward', () => {
    expect(run(approved())).toEqual([pts('alice', 100, 'quest'), pts('bob', 10, 'witness')]);
  });

  it('no approver, or a reward of 0, means no witness line', () => {
    expect(run(approved(null, null))).toEqual([pts('alice', 100, 'quest')]);
    expect(run(approved(), { witnessReward: 0 })).toEqual([pts('alice', 100, 'quest')]);
  });

  it('a right guess steals exposePenalty from the target', () => {
    expect(run({ kind: 'guessRight', guesser: 'alice', target: 'bob' })).toEqual([
      { kind: 'transfer', from: 'bob', to: 'alice', amount: 50, fromReason: 'exposed', toReason: 'guess-correct' },
    ]);
  });

  it('a wrong guess pays wrongGuessCost to the target as a bounty', () => {
    expect(run({ kind: 'guessWrong', guesser: 'alice', target: 'bob' })).toEqual([
      { kind: 'transfer', from: 'alice', to: 'bob', amount: 10, fromReason: 'guess-wrong', toReason: 'bounty' },
    ]);
  });

  it('rejections, fraud fines and side-quest wins are classic', () => {
    expect(run({ kind: 'claimRejected', uid: 'alice' })).toEqual([pts('alice', -25, 'rejected')]);
    expect(run({ kind: 'fraudFine', uid: 'alice' })).toEqual([pts('alice', -50, 'fraud')]);
    expect(run({ kind: 'sideQuestWon', uid: 'alice', bonus: 100, votes: 2 })).toEqual([pts('alice', 100, 'global-win')]);
  });

  it('with the floor on, a steal from a poor target only moves what they had', () => {
    const lines = run({ kind: 'guessRight', guesser: 'alice', target: 'bob' });
    const { entries } = planScore(lines, new Map([['alice', 100], ['bob', 20]]), true);
    expect(entries).toEqual([
      { uid: 'bob', reason: 'exposed', requested: -50, delta: -20 },
      { uid: 'alice', reason: 'guess-correct', requested: 50, delta: 20 },
    ]);
  });
});

describe('E22. rule sets describe themselves and their numbers', () => {
  const all = Object.values(RULESETS);

  it('the registry has classic, countdown and heist, each under its own id', () => {
    expect(Object.keys(RULESETS).sort()).toEqual(['classic', 'countdown', 'heist']);
    for (const [id, rules] of Object.entries(RULESETS)) expect(rules.id).toBe(id);
    expect(getRules('heist')).toBe(heist);
    expect(getRules('nope')).toBeUndefined();
    expect(getRules(null)).toBeUndefined();
  });

  it('every rule set has a name, a summary and sane params with unique keys', () => {
    const keys: string[] = [];
    for (const rules of all) {
      expect(rules.name.trim(), rules.id).not.toBe('');
      expect(rules.summary.trim(), rules.id).not.toBe('');
      for (const p of rules.params) {
        keys.push(p.key);
        expect(p.label.trim(), p.key).not.toBe('');
        expect(p.min, p.key).toBeLessThanOrEqual(p.max);
        expect(p.default, p.key).toBeGreaterThanOrEqual(p.min);
        expect(p.default, p.key).toBeLessThanOrEqual(p.max);
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
    expect(countdown.params.map((p) => p.key).sort()).toEqual(['decayPctPerHour', 'floorPct']);
    expect(heist.params.map((p) => p.key)).toEqual(['witnessReward']);
    expect(classic.params).toEqual([]);
  });

  const text = (rules: ScoringRules, settings: Settings = SETTINGS) =>
    rules
      .describe(settings, resolveParams(rules, undefined), termForms(DARE_TERMS))
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');

  it.each(['classic', 'countdown', 'heist'])('%s lists the points numbers it uses, in the pack’s words', (id) => {
    const rules = RULESETS[id]!;
    const rows = rules.describe(SETTINGS, resolveParams(rules, undefined), termForms(DARE_TERMS));
    expect(rows.length).toBeGreaterThan(0);
    for (const [label, value] of rows) {
      expect(label.trim()).not.toBe('');
      expect(value.trim()).not.toBe('');
    }
    const t = text(rules, { ...SETTINGS, questPoints: 120, rejectPenalty: 35 });
    expect(t).toContain('120');
    expect(t).toContain('35');
    expect(t).toMatch(/dare/i);
    expect(t).not.toMatch(/quest/i);
  });

  it('countdown shows its decay and floor', () => {
    const t = countdown.describe(SETTINGS, { decayPctPerHour: 7, floorPct: 33 }, termForms(DARE_TERMS)).flat().join(' ');
    expect(t).toMatch(/\b7\b/);
    expect(t).toMatch(/\b33\b/);
  });

  it('heist shows the witness reward, named by the pack', () => {
    const t = heist.describe(SETTINGS, { witnessReward: 13 }, termForms(DARE_TERMS)).flat().join(' ');
    expect(t).toMatch(/\b13\b/);
    expect(t).toMatch(/judge/i);
  });
});

describe('M16. reward choice and the skip penalty, in every rule set', () => {
  const ids = ['classic', 'countdown', 'heist'];
  const MORE: Settings = { ...SETTINGS, cleanPoints: 37, framePoints: 43, sideQuestSkipPenalty: 21 };
  const run = (rules: ScoringRules, e: ScoreEvent, settings: Settings = MORE) =>
    scoreEvent(rules, e, sctx(rules, { settings, startedAt: START, now: at(30) }));

  it.each(ids)('%s scores them like classic: never decayed, never a transfer', (id) => {
    const rules = RULESETS[id]!;
    expect(run(rules, { kind: 'rewardClean', uid: 'alice' })).toEqual([pts('alice', 37, 'cleared')]);
    expect(run(rules, { kind: 'rewardFrame', uid: 'alice', target: 'bob' })).toEqual([pts('bob', -43, 'framed')]);
    expect(run(rules, { kind: 'sideQuestSkipped', uid: 'carol' })).toEqual([pts('carol', -21, 'skipped')]);
  });

  it.each(ids)('%s gives no line for amounts set to 0', (id) => {
    const rules = RULESETS[id]!;
    const zero = { ...MORE, cleanPoints: 0, framePoints: 0, sideQuestSkipPenalty: 0 };
    expect(run(rules, { kind: 'rewardClean', uid: 'alice' }, zero)).toEqual([]);
    expect(run(rules, { kind: 'rewardFrame', uid: 'alice', target: 'bob' }, zero)).toEqual([]);
    expect(run(rules, { kind: 'sideQuestSkipped', uid: 'carol' }, zero)).toEqual([]);
  });

  it('the framer is a participant of a frame (but gets no line); the others name one player', () => {
    expect(participants({ kind: 'rewardFrame', uid: 'alice', target: 'bob' }).sort()).toEqual(['alice', 'bob']);
    expect(participants({ kind: 'rewardClean', uid: 'alice' })).toEqual(['alice']);
    expect(participants({ kind: 'sideQuestSkipped', uid: 'carol' })).toEqual(['carol']);
  });

  const ALL = { guesses: true, sideQuests: true, map: true };
  const rows = (id: string, features: Features, settings: Settings = MORE) => {
    const rules = RULESETS[id]!;
    return rules.describe(settings, resolveParams(rules, undefined), termForms(DARE_TERMS), features).map(([l, v]) => `${l}: ${v}`).join('\n');
  };

  it.each(ids)('%s lists the reward choice only for packs that have it', (id) => {
    const off = rows(id, ALL);
    expect(off).not.toMatch(/\b37\b/);
    expect(off).not.toMatch(/\b43\b/);
    const on = rows(id, { ...ALL, rewardChoice: true });
    expect(on).toMatch(/\b37\b/);
    expect(on).toMatch(/\b43\b/);
    expect(on).toMatch(/dare/i);
    expect(on).not.toMatch(/quest/i);
  });

  it.each(ids)('%s lists the skip penalty only when it is set and side quests are on', (id) => {
    const on = rows(id, ALL);
    expect(on).toMatch(/\b21\b/);
    expect(on).toMatch(/showdown/i);
    expect(rows(id, ALL, { ...MORE, sideQuestSkipPenalty: 0 })).not.toMatch(/skip/i);
    expect(rows(id, { ...ALL, sideQuests: false })).not.toMatch(/\b21\b/);
  });
});

describe('C2. a missed check-in, in every rule set', () => {
  const ids = ['classic', 'countdown', 'heist'];
  const run = (rules: ScoringRules, e: ScoreEvent) => scoreEvent(rules, e, sctx(rules, { settings: SETTINGS, startedAt: START, now: at(30) }));

  it.each(ids)('%s charges the penalty the check-in opened with (not the current setting), never decayed or moved', (id) => {
    const rules = RULESETS[id]!;
    expect(run(rules, { kind: 'checkinMissed', uid: 'carol', penalty: 9 })).toEqual([pts('carol', -9, 'missed')]);
    expect(run(rules, { kind: 'checkinMissed', uid: 'carol', penalty: 0 })).toEqual([]);
  });

  it('names only the player who missed it', () => {
    expect(participants({ kind: 'checkinMissed', uid: 'carol', penalty: 5 })).toEqual(['carol']);
  });

  const ALL = { guesses: true, sideQuests: true, map: true };
  const rows = (id: string, features: Features) => {
    const rules = RULESETS[id]!;
    return rules.describe(SETTINGS, resolveParams(rules, undefined), termForms(DARE_TERMS), features).map(([l, v]) => `${l}: ${v}`).join('\n');
  };

  it.each(ids)('%s lists it only for packs with periodic missions (each sets its own fine)', (id) => {
    expect(rows(id, { ...ALL, checkins: true })).toMatch(/Check-in missed: you lose its fine if you don't answer in time \(the host sets it\)/);
    expect(rows(id, ALL)).not.toMatch(/check-in/i);
  });
});

describe('Story missions and police check-ins, in every rule set (plan edge case 37)', () => {
  const ids = ['classic', 'countdown', 'heist'];
  // Late in the game, so countdown would show any decay it wrongly applied.
  const run = (rules: ScoringRules, e: ScoreEvent, settings: Partial<Settings> = {}) =>
    scoreEvent(rules, e, sctx(rules, { settings: { ...SETTINGS, sideQuestSkipPenalty: 7, ...settings }, startedAt: START, now: at(30) }));

  it.each(ids)('%s pays each entrant of a mission judged by submission its points', (id) => {
    expect(run(RULESETS[id]!, { kind: 'sideQuestEntered', uid: 'alice', points: 5 })).toEqual([pts('alice', 5, 'global-entry')]);
    expect(run(RULESETS[id]!, { kind: 'sideQuestEntered', uid: 'alice', points: 0 })).toEqual([]);
  });

  it.each(ids)('%s pays the fastest entry its bonus', (id) => {
    expect(run(RULESETS[id]!, { kind: 'sideQuestFastest', uid: 'bob', bonus: 3 })).toEqual([pts('bob', 3, 'fastest')]);
    expect(run(RULESETS[id]!, { kind: 'sideQuestFastest', uid: 'bob', bonus: 0 })).toEqual([]);
  });

  it.each(ids)("%s charges a skip the mission's own fine when it has one, else the setting", (id) => {
    expect(run(RULESETS[id]!, { kind: 'sideQuestSkipped', uid: 'carol', penalty: 4 })).toEqual([pts('carol', -4, 'skipped')]);
    expect(run(RULESETS[id]!, { kind: 'sideQuestSkipped', uid: 'carol', penalty: 0 })).toEqual([]);
    expect(run(RULESETS[id]!, { kind: 'sideQuestSkipped', uid: 'carol' })).toEqual([pts('carol', -7, 'skipped')]);
  });

  it.each(ids)('%s pays a passed police check-in the points it opened with', (id) => {
    expect(run(RULESETS[id]!, { kind: 'policePassed', uid: 'alice', points: 3 })).toEqual([pts('alice', 3, 'police-pass')]);
  });

  it.each(ids)('%s charges a failed or missed police check-in the fine it opened with', (id) => {
    expect(run(RULESETS[id]!, { kind: 'policeFailed', uid: 'alice', penalty: 2, missed: false })).toEqual([pts('alice', -2, 'police-fail')]);
    expect(run(RULESETS[id]!, { kind: 'policeFailed', uid: 'alice', penalty: 2, missed: true })).toEqual([pts('alice', -2, 'police-missed')]);
    expect(run(RULESETS[id]!, { kind: 'policeFailed', uid: 'alice', penalty: 0, missed: true })).toEqual([]);
  });

  it('each names only its own player', () => {
    expect(participants({ kind: 'sideQuestEntered', uid: 'alice', points: 5 })).toEqual(['alice']);
    expect(participants({ kind: 'sideQuestFastest', uid: 'bob', bonus: 3 })).toEqual(['bob']);
    expect(participants({ kind: 'policePassed', uid: 'carol', points: 3 })).toEqual(['carol']);
    expect(participants({ kind: 'policeFailed', uid: 'carol', penalty: 2, missed: true })).toEqual(['carol']);
  });
});

describe('Yes/no votes in the House rules, in every rule set (plan "Voting takeover…", edge case 6)', () => {
  const ids = ['classic', 'countdown', 'heist'];
  const ALL = { guesses: true, sideQuests: true, map: true };
  const rows = (id: string, settings: Settings) => {
    const rules = RULESETS[id]!;
    return rules.describe(settings, resolveParams(rules, undefined), termForms(DARE_TERMS), ALL).map(([l, v]) => `${l}: ${v}`).join('\n');
  };

  it.each(ids)('%s says a yes/no vote is won on the yeses less the noes, and keeps the old line for one vote each', (id) => {
    expect(rows(id, { ...SETTINGS, voteStyle: 'yesno' })).toMatch(/\+100 for the most yes votes less the noes \(ties all win\)/);
    const pick = rows(id, { ...SETTINGS, voteStyle: 'pick' });
    expect(pick).toMatch(/\+100 for the most votes \(ties all win\)/);
    expect(pick).not.toMatch(/noes/);
  });
});

describe('the top of the log book (plan "+5 for the log book\'s top entry", edge case 13)', () => {
  const ids = ['classic', 'countdown', 'heist'];
  const WITH: Settings = { ...SETTINGS, topEntryPoints: 5 };
  const run = (rules: ScoringRules, e: ScoreEvent) => scoreEvent(rules, e, sctx(rules, { settings: WITH, startedAt: START, now: at(30) }));
  const rows = (id: string, settings: Settings) => {
    const rules = RULESETS[id]!;
    return rules.describe(settings, resolveParams(rules, undefined), termForms(getPack('mystery').terms)).map(([l, v]) => `${l}: ${v}`).join('\n');
  };

  it.each(ids)('%s pays the points to that player, never decayed, never a transfer', (id) => {
    expect(run(RULESETS[id]!, { kind: 'topEntry', uid: 'alice', points: 5 })).toEqual([pts('alice', 5, 'top-entry')]);
    expect(run(RULESETS[id]!, { kind: 'topEntry', uid: 'alice', points: 0 })).toEqual([]);
  });

  it('names one player', () => {
    expect(participants({ kind: 'topEntry', uid: 'alice', points: 5 })).toEqual(['alice']);
  });

  it.each(ids)('%s lists it in the house rules only when it pays', (id) => {
    expect(rows(id, WITH)).toMatch(/Top of the log book: \+5 while your entry holds it/);
    expect(rows(id, { ...WITH, topEntryPoints: 0 })).not.toMatch(/Top of the log book/);
  });
});

describe('agreeing with the room (verdict points)', () => {
  const ids = ['classic', 'countdown', 'heist'];
  const WITH: Settings = { ...SETTINGS, verdictPoints: 1 };
  const run = (rules: ScoringRules, e: ScoreEvent) => scoreEvent(rules, e, sctx(rules, { settings: WITH, startedAt: START, now: at(30) }));
  const rows = (id: string, settings: Settings) => {
    const rules = RULESETS[id]!;
    return rules.describe(settings, resolveParams(rules, undefined), termForms(getPack('mystery').terms)).map(([l, v]) => `${l}: ${v}`).join('\n');
  };

  it.each(ids)('%s pays the points to that player, as a verdict line', (id) => {
    expect(run(RULESETS[id]!, { kind: 'verdictAgreed', uid: 'alice', points: 1 })).toEqual([pts('alice', 1, 'verdict')]);
    expect(run(RULESETS[id]!, { kind: 'verdictAgreed', uid: 'alice', points: 0 })).toEqual([]);
  });

  it('names one player', () => {
    expect(participants({ kind: 'verdictAgreed', uid: 'alice', points: 1 })).toEqual(['alice']);
  });

  it.each(ids)('%s lists it in the house rules only when it pays', (id) => {
    expect(rows(id, WITH)).toMatch(/Agree with the room: \+1 when your eye or heart on an entry matches its verdict/);
    expect(rows(id, { ...WITH, verdictPoints: 0 })).not.toMatch(/Agree with the room/);
  });
});
