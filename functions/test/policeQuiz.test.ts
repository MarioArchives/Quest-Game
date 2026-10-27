// What the police ask (plan "Police that sound official, a question bank, …", edge cases 2, 5 and 6): the question
// bank (`quizQuestion`), matching a reply to an option (`answerOf`), the GM's view of an answer (`choiceLabel`), and
// validatePack's checks on a pack's quiz. Pure: no store.
import { describe, expect, it } from 'vitest';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import type { PoliceQuizItem, RelationChoice } from '../src/shared/packs/types.js';
import { policeQuestion } from '../src/shared/police.js';
import { answerOf, choiceLabel, quizQuestion, type QuizQuestion, type QuizSource } from '../src/shared/policeQuiz.js';
import { Stamp } from '../src/shared/store/stamp.js';
import type { Fact } from '../src/shared/types.js';
import { seededRng } from './helpers.js';
import { testPack } from './packs.js';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 24, 21, 0);

const RELATIONS: RelationChoice[] = [
  { id: 'lover', label: 'Lover', phrase: "Bob's lover" },
  { id: 'ex', label: 'Ex', phrase: "Bob's ex" },
  { id: 'boss', label: 'Boss', phrase: "Bob's boss" },
  { id: 'parent', label: 'Parent', phrase: "Bob's parent" },
];

const person = (uid: string, name: string, points: number, over: Partial<QuizSource['players'][number]> = {}): QuizSource['players'][number] => ({
  uid,
  name,
  points,
  playing: true,
  particulars: null,
  ...over,
});

const fact = (over: Partial<Fact>): Fact => ({ key: 'x', label: 'X', value: null, entries: [], storyId: null, at: Stamp.fromMillis(NOW - 30 * MIN), ...over });

const WEAPON = fact({
  key: 'weapon',
  label: 'Murder weapon',
  entries: [{ submissionId: 'w1', uid: 'cleo', displayName: 'Cleo', caption: 'The dart', imagePath: null, thumbPath: null, videoPath: null, votes: 3 }],
  others: ['A pint glass', 'The jukebox', 'A beer mat'],
  storyId: 's-weapon',
});

const SOURCE: QuizSource = {
  players: [
    person('mia', 'Mia Lane', 12, { particulars: { heightCm: 170, marks: null, relation: 'lover' } }),
    person('zed', 'Zed Park', -15),
    person('cleo', 'Cleo', 3, { particulars: { heightCm: null, marks: null, relation: 'boss' } }),
    person('dan', 'Dan', 0),
    person('gone', 'Gone Away', -40, { playing: false }),
  ],
  facts: [fact({ key: 'timeOfDeath', label: 'Time of death', value: '23:02', storyId: 's-time' }), WEAPON],
  stops: [
    { name: 'Big Hands', order: 1, revealed: true, startsAtMs: NOW - 60 * MIN },
    { name: 'The Grosvenor', order: 2, revealed: true, startsAtMs: NOW - 5 * MIN },
    { name: 'YES', order: 3, revealed: false, startsAtMs: NOW + 60 * MIN },
  ],
  settings: { confidantAbove: 10, poiBelow: -10 },
  relations: RELATIONS,
  nowMs: NOW,
};

const ask = (item: PoliceQuizItem, src: QuizSource | null = SOURCE, uid = 'mia', seed = 1) => quizQuestion([item], src, uid, seededRng(seed));
const right = (q: QuizQuestion) => q.options![Number(q.expected) - 1]!;
const isSum = (q: QuizQuestion) => q.quiz === 'sum' && q.options === null && /^What's \d+ [+×] \d+\?$/.test(q.question);
const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

/** The question is multiple choice with 3 or 4 unique options, the answer among them once. */
function expectChoice(q: QuizQuestion, answer: string) {
  expect(q.options).not.toBeNull();
  expect(q.options!.length).toBeGreaterThanOrEqual(3);
  expect(q.options!.length).toBeLessThanOrEqual(4);
  expect(new Set(q.options).size).toBe(q.options!.length);
  expect(right(q)).toBe(answer);
  expect(q.options!.filter((o) => o === answer)).toHaveLength(1);
}

describe('with no quiz', () => {
  it('asks exactly the old sum, using the random numbers the same way', () => {
    const a = seededRng(3);
    const b = seededRng(3);
    expect(quizQuestion(undefined, SOURCE, 'mia', a)).toEqual({ ...policeQuestion(b), options: null, quiz: 'sum' });
    expect(a()).toBe(b());
    const c = seededRng(3);
    expect(quizQuestion([{ kind: 'fixed', ask: 'Who?', answer: 'Bob', decoys: ['Rob', 'Bill'] }], null, 'mia', c)).toEqual({
      ...policeQuestion(seededRng(3)),
      options: null,
      quiz: 'sum',
    });
  });
});

describe('the kinds of question', () => {
  it('a sum is a typed number', () => {
    expect(isSum(ask({ kind: 'sum' }))).toBe(true);
  });

  it('a fixed question offers the answer among its decoys', () => {
    const q = ask({ kind: 'fixed', ask: 'Who was the victim?', answer: 'Bob', decoys: ['Rob', 'Bill', 'Barry', 'Dave'] });
    expect(q.question).toBe('Who was the victim?');
    expect(q.quiz).toBe('fixed');
    expectChoice(q, 'Bob');
    for (const o of q.options!) expect(['Bob', 'Rob', 'Bill', 'Barry', 'Dave']).toContain(o);
  });

  it('shuffles: the answer is not always in the same place', () => {
    const places = new Set(seeds.map((s) => ask({ kind: 'fixed', ask: 'Who?', answer: 'Bob', decoys: ['Rob', 'Bill', 'Barry'] }, SOURCE, 'mia', s).expected));
    expect(places.size).toBeGreaterThan(1);
  });

  it("a time fact: the time, and nearby times that aren't it", () => {
    const q = ask({ kind: 'fact', fact: 'timeOfDeath', ask: 'What time was Bob killed?', decoys: 'times' });
    expectChoice(q, '23:02');
    const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    for (const o of q.options!) {
      expect(o).toMatch(/^\d\d:\d\d$/);
      if (o !== '23:02') {
        const d = Math.min(Math.abs(minutes(o) - minutes('23:02')), 1440 - Math.abs(minutes(o) - minutes('23:02')));
        expect(d).toBeGreaterThanOrEqual(12);
        expect(d).toBeLessThanOrEqual(95);
      }
    }
  });

  it('a fact not settled yet is not asked: a sum instead', () => {
    expect(isSum(ask({ kind: 'fact', fact: 'scene', ask: 'Where did it happen?' }))).toBe(true);
    expect(isSum(ask({ kind: 'fact', fact: 'timeOfDeath', ask: 'When?', decoys: 'times' }, { ...SOURCE, facts: [] }))).toBe(true);
  });

  it("a mission's fact: a winning entry, with the entries that didn't win as decoys", () => {
    const q = ask({ kind: 'fact', fact: 'weapon', ask: 'What was the murder weapon?' });
    expectChoice(q, 'The dart');
    for (const o of q.options!) expect(['The dart', 'A pint glass', 'The jukebox', 'A beer mat']).toContain(o);
  });

  it("tops up a mission fact's decoys from the item's own list", () => {
    const thin = { ...SOURCE, facts: [{ ...WEAPON, others: ['A pint glass'] }] };
    const q = ask({ kind: 'fact', fact: 'weapon', ask: 'What was it?', decoys: ['A candlestick', 'A rope'] }, thin);
    expectChoice(q, 'The dart');
    expect(q.options!.some((o) => o === 'A candlestick' || o === 'A rope')).toBe(true);
  });

  it('a mission fact with no winner, or only an overlong caption, is not asked', () => {
    expect(isSum(ask({ kind: 'fact', fact: 'weapon', ask: 'What?' }, { ...SOURCE, facts: [{ ...WEAPON, entries: [] }] }))).toBe(true);
    const long = { ...WEAPON, entries: [{ ...WEAPON.entries[0]!, caption: 'x'.repeat(49) }] };
    expect(isSum(ask({ kind: 'fact', fact: 'weapon', ask: 'What?' }, { ...SOURCE, facts: [long] }))).toBe(true);
  });

  it('the prime suspect: the lowest points among those still playing, other players as decoys', () => {
    const q = ask({ kind: 'standing', pick: 'lowest', ask: "Who's our prime suspect right now?" });
    expectChoice(q, 'Zed');
    for (const o of q.options!) expect(['Mia', 'Zed', 'Cleo', 'Dan']).toContain(o);
  });

  it('the most trusted: the highest points', () => {
    expectChoice(ask({ kind: 'standing', pick: 'highest', ask: "Who's our most trusted informant?" }, SOURCE, 'zed'), 'Mia');
  });

  it('a tie at that end is not asked', () => {
    const tied = { ...SOURCE, players: [...SOURCE.players, person('ivy', 'Ivy', -15)] };
    expect(isSum(ask({ kind: 'standing', pick: 'lowest', ask: 'Who?' }, tied))).toBe(true);
  });

  it('two players sharing a first name are shown in full', () => {
    const twins = { ...SOURCE, players: [person('s1', 'Sam Hill', -20), person('s2', 'Sam Ray', 5), person('dan', 'Dan', 0), person('mia', 'Mia', 1)] };
    const q = ask({ kind: 'standing', pick: 'lowest', ask: 'Who?' }, twins);
    expectChoice(q, 'Sam Hill');
    expect(q.options).not.toContain('Sam');
  });

  it("the bar they're in: the latest revealed stop that has started, other bars as decoys, never the route's", () => {
    const item: PoliceQuizItem = { kind: 'stop', ask: 'Which bar are you in?', decoys: ['Cane & Grain', 'Terrace', 'Big Hands', 'Northern Monk'] };
    for (const s of seeds.slice(0, 10)) {
      const q = ask(item, SOURCE, 'mia', s);
      expectChoice(q, 'The Grosvenor');
      expect(q.options).not.toContain('YES');
      expect(q.options).not.toContain('Big Hands');
    }
  });

  it('a bar question is not asked without a started revealed stop, or without enough decoys', () => {
    const none = { ...SOURCE, stops: SOURCE.stops.map((x) => ({ ...x, revealed: false })) };
    expect(isSum(ask({ kind: 'stop', ask: 'Which bar?', decoys: ['A', 'B', 'C'] }, none))).toBe(true);
    expect(isSum(ask({ kind: 'stop', ask: 'Which bar?', decoys: ['Big Hands', 'A'] }))).toBe(true);
  });

  it('the watch-list count is a typed number', () => {
    const q = ask({ kind: 'watch-count', ask: 'How many people are on our watch list?' });
    expect(q).toMatchObject({ question: 'How many people are on our watch list?', expected: '1', options: null, quiz: 'watch-count' });
  });

  it('the watch-list count is not asked with the line switched off', () => {
    expect(isSum(ask({ kind: 'watch-count', ask: 'How many?' }, { ...SOURCE, settings: { confidantAbove: 10, poiBelow: null } }))).toBe(true);
  });

  it('their own relation: the label they gave, other labels as decoys; not asked without one', () => {
    const q = ask({ kind: 'own', field: 'relation', ask: 'What did you tell us your relation to Bob was?' });
    expectChoice(q, 'Lover');
    for (const o of q.options!) expect(RELATIONS.map((r) => r.label)).toContain(o);
    expect(isSum(ask({ kind: 'own', field: 'relation', ask: 'What?' }, SOURCE, 'zed'))).toBe(true);
  });

  it('their own height, in centimetres; not asked without one', () => {
    const q = ask({ kind: 'own', field: 'height', ask: 'How tall did you tell us you were?' });
    expectChoice(q, '170 cm');
    for (const o of q.options!) {
      expect(o).toMatch(/^\d{3} cm$/);
      if (o !== '170 cm') {
        const d = Math.abs(Number(o.slice(0, 3)) - 170);
        expect(d).toBeGreaterThanOrEqual(4);
        expect(d).toBeLessThanOrEqual(12);
      }
    }
    expect(isSum(ask({ kind: 'own', field: 'height', ask: 'How tall?' }, SOURCE, 'cleo'))).toBe(true);
  });

  it("whose relation: the one other player who gave it, by its phrase; never the one being asked", () => {
    const q = ask({ kind: 'whose', field: 'relation', ask: 'Who told us they were {value}?' }, SOURCE, 'zed');
    expect(["Who told us they were Bob's lover?", "Who told us they were Bob's boss?"]).toContain(q.question);
    expectChoice(q, q.question.includes('lover') ? 'Mia' : 'Cleo');
    expect(q.options).not.toContain('Zed');
  });

  it('whose relation is not asked when no relation is held by exactly one other player', () => {
    const shared = {
      ...SOURCE,
      players: SOURCE.players.map((p) => (p.uid === 'cleo' ? { ...p, particulars: { heightCm: null, marks: null, relation: 'lover' } } : p)),
    };
    expect(isSum(ask({ kind: 'whose', field: 'relation', ask: 'Who told us they were {value}?' }, shared, 'zed'))).toBe(true);
  });
});

describe('picking among the items', () => {
  const victim: PoliceQuizItem = { kind: 'fixed', ask: 'Who was the victim?', answer: 'Bob', decoys: ['Rob', 'Bill'], weight: 10 };

  it('a heavier item comes up more often, and the same random numbers pick the same question', () => {
    const picks = seeds.map((s) => quizQuestion([{ kind: 'sum', weight: 1 }, victim], SOURCE, 'mia', seededRng(s)).quiz);
    expect(picks.filter((k) => k === 'fixed').length).toBeGreaterThan(picks.length / 2);
    expect(quizQuestion([{ kind: 'sum' }, victim], SOURCE, 'mia', seededRng(9))).toEqual(quizQuestion([{ kind: 'sum' }, victim], SOURCE, 'mia', seededRng(9)));
  });

  it('skips items that cannot be asked now', () => {
    for (const s of seeds.slice(0, 10)) {
      const q = quizQuestion([{ kind: 'fact', fact: 'scene', ask: 'Where?', weight: 10 }, { kind: 'fixed', ask: 'Who?', answer: 'Bob', decoys: ['Rob', 'Bill'] }], SOURCE, 'mia', seededRng(s));
      expect(q.quiz).toBe('fixed');
    }
  });
});

describe('answerOf', () => {
  it('takes an option by its number, its text (case, punctuation and a leading a/an/the aside) or its digits', () => {
    const names = ['Bob', 'Rob', 'Bill'];
    expect(answerOf('2', names)).toBe('2');
    expect(answerOf('option 2', names)).toBe('2');
    expect(answerOf(' 3 ', names)).toBe('3');
    expect(answerOf('bob.', names)).toBe('1');
    expect(answerOf('The Bob', names)).toBe('1');
    expect(answerOf('  BILL!', names)).toBe('3');
    const times = ['22:15', '23:02', '00:30'];
    expect(answerOf('23:02', times)).toBe('2');
    expect(answerOf('2302', times)).toBe('2');
    const things = ['A pint glass', 'The dart', 'A beer mat'];
    expect(answerOf('dart', things)).toBe('2');
    expect(answerOf('the dart', things)).toBe('2');
    expect(answerOf('pint glass', things)).toBe('1');
  });

  it('nothing that matches, or a number out of range, is no answer', () => {
    expect(answerOf('nonsense', ['Bob', 'Rob'])).toBe('');
    expect(answerOf('', ['Bob', 'Rob'])).toBe('');
    expect(answerOf('7', ['Bob', 'Rob'])).toBe('');
  });

  it("a typed number is the reply's digits", () => {
    expect(answerOf('56', null)).toBe('56');
    expect(answerOf(' 56!', undefined)).toBe('56');
    expect(answerOf('fifty six', null)).toBe('');
  });
});

describe('choiceLabel', () => {
  it('shows the option with its number, and anything else as it is', () => {
    expect(choiceLabel(['Bob', 'Rob'], '2')).toBe('2 · Rob');
    expect(choiceLabel(null, '56')).toBe('56');
    expect(choiceLabel(['Bob'], '9')).toBe('9');
    expect(choiceLabel(['Bob'], '')).toBe('');
  });
});

describe("validatePack and a pack's quiz", () => {
  const withQuiz = (policeQuiz: unknown[], over: Record<string, unknown> = {}) =>
    validatePack(testPack({ features: { police: true, stops: true }, booking: { relations: RELATIONS }, policeQuiz: policeQuiz as PoliceQuizItem[], ...over })).join('\n');

  it('accepts every kind', () => {
    expect(
      withQuiz([
        { kind: 'sum', weight: 2 },
        { kind: 'fixed', ask: 'Who was the victim?', answer: 'Bob', decoys: ['Rob', 'Bill'] },
        { kind: 'fact', fact: 'timeOfDeath', ask: 'When?', decoys: 'times' },
        { kind: 'fact', fact: 'weapon', ask: 'What?' },
        { kind: 'standing', pick: 'lowest', ask: 'Who?' },
        { kind: 'stop', ask: 'Which bar?', decoys: ['A', 'B'] },
        { kind: 'watch-count', ask: 'How many?' },
        { kind: 'own', field: 'relation', ask: 'What relation?' },
        { kind: 'own', field: 'height', ask: 'How tall?' },
        { kind: 'whose', field: 'relation', ask: 'Who told us they were {value}?' },
      ]),
    ).toBe('');
  });

  it.each([
    ['fixed decoys that include the answer', [{ kind: 'fixed', ask: 'Who?', answer: 'Bob', decoys: ['Bob', 'Rob'] }], {}, /decoy/i],
    ['a fixed question with one decoy', [{ kind: 'fixed', ask: 'Who?', answer: 'Bob', decoys: ['Rob'] }], {}, /decoy/i],
    ['a whose question without {value}', [{ kind: 'whose', field: 'relation', ask: 'Who?' }], {}, /\{value\}/],
    ['a relation question without a relation list', [{ kind: 'own', field: 'relation', ask: 'What?' }], { booking: undefined }, /relation/i],
    ['a stop question without the stops feature', [{ kind: 'stop', ask: 'Which?', decoys: ['A', 'B'] }], { features: { police: true, stops: false } }, /stop/i],
    ['a weight of 0', [{ kind: 'sum', weight: 0 }], {}, /weight/i],
    ['a weight of 11', [{ kind: 'sum', weight: 11 }], {}, /weight/i],
    ['a fractional weight', [{ kind: 'sum', weight: 1.5 }], {}, /weight/i],
    ['a blank question', [{ kind: 'watch-count', ask: ' ' }], {}, /ask|question/i],
    ['a question over 80 characters', [{ kind: 'watch-count', ask: 'x'.repeat(81) }], {}, /ask|question/i],
    ['an unknown kind', [{ kind: 'riddle', ask: 'Why?' }], {}, /kind/i],
    ['a quiz with the police off', [{ kind: 'sum' }], { features: { police: false } }, /police/i],
  ])('refuses %s', (_label, quiz, over, what) => {
    expect(withQuiz(quiz, over)).toMatch(what);
  });
});

describe("the mystery pack's quiz", () => {
  const mystery = getPack('mystery');

  it('asks every kind, sums twice as often, and the victim is Bob among Rob, Bill, Barry and Dave', () => {
    const quiz = mystery.policeQuiz!;
    const kinds = new Set(quiz.map((q) => (q.kind === 'own' || q.kind === 'whose' ? `${q.kind}:${q.field}` : q.kind === 'standing' ? `standing:${q.pick}` : q.kind)));
    for (const k of ['sum', 'fixed', 'fact', 'standing:lowest', 'standing:highest', 'stop', 'watch-count', 'own:relation', 'own:height', 'whose:relation']) {
      expect(kinds, k).toContain(k);
    }
    expect(quiz.find((q) => q.kind === 'sum')!.weight).toBe(2);
    const victim = quiz.find((q) => q.kind === 'fixed') as Extract<PoliceQuizItem, { kind: 'fixed' }>;
    expect(victim.answer).toBe('Bob');
    expect([...victim.decoys].sort()).toEqual(['Barry', 'Bill', 'Dave', 'Rob']);
    const facts = quiz.filter((q) => q.kind === 'fact').map((q) => (q as Extract<PoliceQuizItem, { kind: 'fact' }>).fact).sort();
    expect(facts).toEqual(['scene', 'timeOfDeath', 'weapon']);
    const route = (mystery.route ?? []).map((s) => s.name);
    const stop = quiz.find((q) => q.kind === 'stop') as Extract<PoliceQuizItem, { kind: 'stop' }>;
    for (const d of stop.decoys) expect(route).not.toContain(d);
  });
});
