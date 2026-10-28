// The mystery pack's case file (closeCase, its closing hook): the verdict from the incriminating photos, each award's
// rule, the time of death as an instant, and the points timeline. Pure: plain ClosingInput, no store.
import { describe, expect, it } from 'vitest';
import { getPack } from '../src/shared/packs/index.js';
import { clockInstant, closeCase, type CaseAward } from '../src/shared/packs/mystery/caseClosed.js';
import type { ClosingInput } from '../src/shared/packs/types.js';
import { defaultSettingsFor } from '../src/shared/packs/index.js';

const MIN = 60_000;
// Saturday 24 October 2026 in London (BST): 19:00 is 18:00 UTC; the case closes at 00:41, 23:41 UTC.
const START = Date.UTC(2026, 9, 24, 18, 0);
const END = Date.UTC(2026, 9, 24, 23, 41);
const at = (min: number) => START + min * MIN;

type Over = Partial<Omit<ClosingInput, 'players'>> & { players?: Array<Partial<ClosingInput['players'][number]> & { uid: string }> };

/** A night with players a–d (in rank order, ranks from points unless given), nothing else unless `over` adds it. */
function night(over: Over = {}): ClosingInput {
  const raw = over.players ?? ['a', 'b', 'c', 'd'].map((uid) => ({ uid }));
  const players = raw.map((p, i) => ({
    displayName: p.uid.toUpperCase(),
    points: 0,
    rank: i + 1,
    joinedAt: at(-60),
    bookedAt: at(-30),
    relation: null,
    ...p,
  }));
  return {
    startedAt: START,
    endedAt: END,
    timeZone: 'Europe/London',
    settings: defaultSettingsFor(getPack('mystery')),
    ledger: [],
    guesses: [],
    submissions: [],
    globals: [],
    feed: [],
    top: null,
    rewards: [],
    motives: [],
    policeCalls: [],
    checkins: [],
    facts: [],
    ...over,
    players,
  };
}

const line = (uid: string, min: number, delta: number, reason: ClosingInput['ledger'][number]['reason'] = 'cleared', note: string | null = null) => ({
  uid,
  t: at(min),
  delta,
  reason,
  ref: null,
  note,
});

const award = (awards: CaseAward[], id: CaseAward['id']) => awards.find((a) => a.id === id);
const winners = (n: ClosingInput, id: CaseAward['id']) => award(closeCase(n).awards, id)?.uids ?? [];

/** The incriminating evidence mission, closed with this tally (yes/no when `yesNo`), and its entries tagging players. */
function incriminating(entries: Array<{ id: string; by: string; tags: string; votes: number; status?: 'approved' | 'sealed' | 'rejected' }>, opts: { yesNo?: boolean; status?: 'closed' | 'voting'; tally?: boolean } = {}) {
  const tally = opts.tally === false ? null : Object.fromEntries(entries.map((e) => [e.id, e.votes]));
  return {
    globals: [
      {
        id: 'g-inc',
        storyId: 's-incriminating',
        kind: 'mission' as const,
        status: opts.status ?? ('closed' as const),
        startsAt: at(0),
        winnerUids: [],
        winningSubmissionIds: [],
        tally: opts.yesNo ? Object.fromEntries(entries.map((e) => [e.id, e.votes - 1])) : tally,
        yesNo: opts.yesNo ? Object.fromEntries(entries.map((e) => [e.id, { yes: e.votes, no: 1 }])) : null,
      },
    ],
    submissions: entries.map((e) => ({
      id: e.id,
      uid: e.by,
      kind: 'global' as const,
      questId: 'g-inc',
      status: e.status ?? ('approved' as const),
      checked: null,
      taggedUid: e.tags,
      t: at(10),
    })),
  };
}

describe('the verdict', () => {
  it('closes on the player whose tagged photos drew the most votes, summed over every photo that tags them', () => {
    const v = closeCase(
      night(incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 3 }, { id: 'e2', by: 'b', tags: 'd', votes: 2 }, { id: 'e3', by: 'c', tags: 'b', votes: 4 }])),
    ).verdict;
    expect(v).toMatchObject({ opened: true, uids: ['d'], tally: { d: 5, b: 4 }, photos: { d: 2, b: 1 } });
  });

  it('counts the damning (yes) votes in a yes/no vote, not yes minus no', () => {
    const v = closeCase(night(incriminating([{ id: 'e1', by: 'a', tags: 'c', votes: 3 }, { id: 'e2', by: 'b', tags: 'd', votes: 2 }], { yesNo: true }))).verdict;
    expect(v.tally).toEqual({ c: 3, d: 2 });
    expect(v.uids).toEqual(['c']);
  });

  it('names accomplices on a tie, in standings order', () => {
    const v = closeCase(night(incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 2 }, { id: 'e2', by: 'd', tags: 'b', votes: 2 }]))).verdict;
    expect(v.uids).toEqual(['b', 'd']);
  });

  it('leaves the case open when no tagged photo drew a vote', () => {
    const v = closeCase(night(incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 0 }]))).verdict;
    expect(v).toMatchObject({ opened: true, uids: [] });
  });

  it('leaves the case open when the vote never opened (closed with no tally) or the mission never ran', () => {
    expect(closeCase(night(incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 0 }], { tally: false }))).verdict).toMatchObject({ opened: false, uids: [], tally: {} });
    expect(closeCase(night()).verdict).toEqual({ opened: false, tally: {}, photos: {}, uids: [], motiveBy: {} });
  });

  it('ignores entries that were never revealed, thrown out, or tag someone no longer in the game', () => {
    const v = closeCase(
      night(
        incriminating([
          { id: 'e1', by: 'a', tags: 'd', votes: 5, status: 'sealed' },
          { id: 'e2', by: 'b', tags: 'd', votes: 5, status: 'rejected' },
          { id: 'e3', by: 'b', tags: 'gone', votes: 9 },
          { id: 'e4', by: 'c', tags: 'a', votes: 1 },
        ]),
      ),
    ).verdict;
    expect(v.uids).toEqual(['a']);
    expect(v.tally).toEqual({ a: 1 });
  });

  it("records who wrote the motive against each of them (a player's own or none is left out)", () => {
    const v = closeCase(
      night({
        ...incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 2 }, { id: 'e2', by: 'd', tags: 'b', votes: 2 }]),
        motives: [{ uid: 'd', byUid: 'c' }, { uid: 'b', byUid: null }, { uid: 'a', byUid: 'd' }],
      }),
    ).verdict;
    expect(v.motiveBy).toEqual({ d: 'c' });
  });
});

describe('awards from the verdict', () => {
  const base = () => ({
    ...incriminating([{ id: 'e1', by: 'a', tags: 'd', votes: 5 }, { id: 'e2', by: 'b', tags: 'c', votes: 2 }, { id: 'e3', by: 'c', tags: 'b', votes: 2 }]),
    motives: [{ uid: 'd', byUid: 'a' }],
  });

  it('Murderer is the verdict, with their votes and photos; Allegedly Innocent the runners-up on at least 1', () => {
    const awards = closeCase(night(base())).awards;
    expect(award(awards, 'murderer')).toEqual({ id: 'murderer', uids: ['d'], n: { d: { votes: 5, photos: 1 } } });
    expect(award(awards, 'innocent')?.uids).toEqual(['b', 'c']);
  });

  it('Poison Pen goes to whoever wrote the motive against the one the case closed on', () => {
    expect(winners(night(base()), 'pen')).toEqual(['a']);
  });

  it('no verdict: no Murderer, no Allegedly Innocent, no Poison Pen', () => {
    const awards = closeCase(night({ motives: [{ uid: 'd', byUid: 'a' }] })).awards;
    expect(['murderer', 'innocent', 'pen'].map((id) => award(awards, id as CaseAward['id']))).toEqual([undefined, undefined, undefined]);
  });
});

describe('awards from the police', () => {
  const call = (uid: string, status: 'passed' | 'failed' | 'missed' | 'cancelled' | 'open', by: string | null = null) => ({
    uid,
    kind: by ? ('tip' as const) : ('watch' as const),
    byUid: by,
    status,
    t: at(30),
  });

  it('Most Called needs at least 2 settled calls, ties all win, and cancelled or open calls do not count', () => {
    const n = night({ policeCalls: [call('a', 'passed'), call('a', 'missed'), call('a', 'cancelled'), call('b', 'failed'), call('b', 'passed'), call('c', 'open'), call('c', 'cancelled')] });
    const a = award(closeCase(n).awards, 'called');
    expect(a?.uids).toEqual(['a', 'b']);
    expect(a?.n.a).toEqual({ calls: 2, passed: 1, failed: 0, missed: 1 });
    expect(winners(night({ policeCalls: [call('a', 'passed')] }), 'called')).toEqual([]);
  });

  it('Least Responsive adds missed calls, missed roll calls and skipped story missions', () => {
    const n = night({
      policeCalls: [call('a', 'missed')],
      checkins: [{ id: 'k1', startsAt: at(60), endsAt: at(75), status: 'closed', missedUids: ['b', 'a'], answers: [] }],
      ledger: [line('b', 120, -2, 'skipped'), line('b', 130, -2, 'skipped')],
    });
    const a = award(closeCase(n).awards, 'unresponsive');
    expect(a?.uids).toEqual(['b']);
    expect(a?.n.b).toEqual({ police: 0, rollCalls: 1, skipped: 2 });
  });

  it('Biggest Snitch is the most tip-offs, with how many ended missed or failed', () => {
    const n = night({ policeCalls: [call('b', 'missed', 'a'), call('c', 'passed', 'a'), call('d', 'failed', 'c')] });
    const a = award(closeCase(n).awards, 'snitch');
    expect(a).toEqual({ id: 'snitch', uids: ['a'], n: { a: { tips: 2, landed: 1 } } });
  });
});

describe('awards from points and the log book', () => {
  it('Greatest Hustler: the most earned before any losses', () => {
    const n = night({ ledger: [line('a', 10, 5), line('a', 20, 5), line('a', 30, -10, 'exposed'), line('b', 10, 5)] });
    expect(award(closeCase(n).awards, 'hustler')).toEqual({ id: 'hustler', uids: ['a'], n: { a: { earned: 10, lost: 10 } } });
  });

  it("Least Liked: the most Doubtful stamps on a player's own entries (not frames or exposures about them)", () => {
    const n = night({
      feed: [
        { id: 'f1', type: 'approved', uid: 'a', actorUid: null, up: 1, down: 2, t: at(10) },
        { id: 'f2', type: 'checkin-answer', uid: 'a', actorUid: null, up: 0, down: 1, t: at(20) },
        { id: 'f3', type: 'framed', uid: 'b', actorUid: null, up: 0, down: 9, t: at(30) },
        { id: 'f4', type: 'approved', uid: 'c', actorUid: null, up: 0, down: 2, t: at(30) },
      ],
    });
    expect(award(closeCase(n).awards, 'disliked')).toEqual({ id: 'disliked', uids: ['a'], n: { a: { doubtful: 3, posts: 2 } } });
  });

  it('Most Popular Submission is the top entry when the case closed, if its owner is still in the game', () => {
    expect(award(closeCase(night({ top: { feedId: 'f1', uid: 'c', up: 9, down: 1 } })).awards, 'popular')).toEqual({ id: 'popular', uids: ['c'], n: { c: { up: 9, down: 1 } } });
    expect(winners(night({ top: { feedId: 'f1', uid: 'gone', up: 9, down: 1 } }), 'popular')).toEqual([]);
    expect(winners(night(), 'popular')).toEqual([]);
  });

  it('Top of the Table and Wooden Spoon follow the final ranks; nobody gets the spoon when everyone ties', () => {
    const n = night({ players: [{ uid: 'a', points: 34, rank: 1 }, { uid: 'b', points: 27, rank: 2 }, { uid: 'c', points: -13, rank: 3 }] });
    const awards = closeCase(n).awards;
    expect(award(awards, 'champion')).toEqual({ id: 'champion', uids: ['a'], n: { a: { points: 34, lead: 7 } } });
    expect(award(awards, 'spoon')).toEqual({ id: 'spoon', uids: ['c'], n: { c: { points: -13 } } });
    const tied = night({ players: [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 1 }] });
    expect(winners(tied, 'champion')).toEqual(['a', 'b']);
    expect(winners(tied, 'spoon')).toEqual([]);
  });

  it('Peaked Too Early: led on more than nothing at some moment and finished bottom (three players or more)', () => {
    const ledger = [line('c', 10, 20), line('a', 30, 25), line('c', 40, -33, 'exposed'), line('b', 50, 5)];
    const n = night({ ledger, players: [{ uid: 'a', points: 25, rank: 1 }, { uid: 'b', points: 5, rank: 2 }, { uid: 'c', points: -13, rank: 3 }] });
    expect(award(closeCase(n).awards, 'early')).toEqual({ id: 'early', uids: ['c'], n: { c: { peak: 20, at: at(10), lost: 33 } } });
    const two = night({ ledger: [line('b', 10, 5), line('b', 20, -10, 'exposed')], players: [{ uid: 'a', points: 0, rank: 1 }, { uid: 'b', points: -5, rank: 2 }] });
    expect(winners(two, 'early')).toEqual([]);
  });

  it('Back from the Brink: a person of interest at some moment, a trusted confidant at the close', () => {
    const ledger = [line('b', 10, -16, 'exposed'), line('b', 60, 27), line('a', 70, -11, 'exposed')];
    const n = night({ ledger, players: [{ uid: 'b', points: 11, rank: 1 }, { uid: 'a', points: -11, rank: 2 }] });
    expect(award(closeCase(n).awards, 'brink')).toEqual({ id: 'brink', uids: ['b'], n: { b: { low: -16, at: at(10), points: 11 } } });
  });

  it("The GM's Pet: the most the GM added by hand, at least +1", () => {
    const n = night({ ledger: [line('a', 10, 1, 'adjust', 'for the Macarena'), line('b', 20, -1, 'adjust', 'heckling')] });
    expect(award(closeCase(n).awards, 'pet')).toEqual({ id: 'pet', uids: ['a'], n: { a: { points: 1 } } });
  });
});

describe('awards from charges and tampering', () => {
  it('Sharp Eye: the most charges upheld, with how many were made', () => {
    const g = (guesser: string, target: string, correct: boolean) => ({ guesserUid: guesser, targetUid: target, correct, t: at(10) });
    const n = night({ guesses: [g('a', 'b', true), g('a', 'c', true), g('a', 'd', false), g('b', 'a', true)] });
    expect(award(closeCase(n).awards, 'sharp')).toEqual({ id: 'sharp', uids: ['a'], n: { a: { upheld: 2, made: 3 } } });
  });

  it('Puppet Master counts frames chosen and never says who was framed', () => {
    const n = night({
      rewards: [
        { uid: 'a', status: 'framed', targetUid: 'b', t: at(10) },
        { uid: 'a', status: 'framed', targetUid: 'c', t: at(20) },
        { uid: 'b', status: 'cleaned', targetUid: null, t: at(30) },
        { uid: 'c', status: 'framed', targetUid: 'a', t: at(40) },
      ],
    });
    const file = closeCase(n);
    expect(award(file.awards, 'puppet')).toEqual({ id: 'puppet', uids: ['a'], n: { a: { frames: 2 } } });
    expect(JSON.stringify(file)).not.toContain('targetUid');
  });

  it('Fall Guy: framed the most, at least twice', () => {
    const ledger = [line('b', 10, -5, 'framed'), line('b', 15, -5, 'framed'), line('c', 20, -5, 'framed')];
    expect(award(closeCase(night({ ledger })).awards, 'fallguy')).toEqual({ id: 'fallguy', uids: ['b'], n: { b: { framed: 2 } } });
    expect(winners(night({ ledger: ledger.slice(2) }), 'fallguy')).toEqual([]);
  });

  it('Untouchable: two tampering missions or more, never exposed, never framed', () => {
    const mission = (id: string, uid: string) => ({ id, uid, kind: 'personal' as const, questId: `q-${id}`, status: 'approved' as const, checked: null, taggedUid: null, t: at(10) });
    const n = night({
      submissions: [mission('1', 'a'), mission('2', 'a'), mission('3', 'b'), mission('4', 'b'), mission('5', 'c'), mission('6', 'c'), mission('7', 'd')],
      guesses: [{ guesserUid: 'd', targetUid: 'b', correct: true, t: at(20) }],
      ledger: [line('c', 30, -5, 'framed')],
    });
    expect(award(closeCase(n).awards, 'untouchable')).toEqual({ id: 'untouchable', uids: ['a'], n: { a: { missions: 2 } } });
  });

  it('Whore: told the booking desk they were Bob’s sidepiece', () => {
    expect(winners(night({ players: [{ uid: 'a', relation: 'lover' }, { uid: 'b', relation: 'sidepiece' }] }), 'sidepiece')).toEqual(['b']);
  });
});

describe('awards from the story', () => {
  const won = (storyId: string, winnerUids: string[], status: 'closed' | 'voting' = 'closed') => ({
    globals: [
      {
        id: `g-${storyId}`,
        storyId,
        kind: 'mission' as const,
        status,
        startsAt: at(60),
        winnerUids,
        winningSubmissionIds: winnerUids.map((u) => `w-${u}`),
        tally: Object.fromEntries(winnerUids.map((u) => [`w-${u}`, 2])),
        yesNo: Object.fromEntries(winnerUids.map((u) => [`w-${u}`, { yes: 3, no: 1 }])),
      },
    ],
    submissions: winnerUids.map((u) => ({ id: `w-${u}`, uid: u, kind: 'global' as const, questId: `g-${storyId}`, status: 'approved' as const, checked: null, taggedUid: null, t: at(70) })),
  });

  it.each([
    ['s-alibi', 'alibi'],
    ['s-weapon', 'weapon'],
    ['s-scene', 'scout'],
    ['s-old-days', 'farewell'],
  ] as const)('%s won: %s, ties all win, with the damning (yes) votes', (storyId, id) => {
    expect(award(closeCase(night(won(storyId, ['c', 'a']))).awards, id)).toEqual({ id, uids: ['a', 'c'], n: { a: { votes: 3 }, c: { votes: 3 } } });
    expect(winners(night(won(storyId, ['a'], 'voting')), id)).toEqual([]);
  });

  it('Never Left His Side: entered every story mission that took entries since joining', () => {
    const g = (id: string, startsAt: number) => ({ id, storyId: `s-${id}`, kind: 'mission' as const, status: 'closed' as const, startsAt, winnerUids: [], winningSubmissionIds: [], tally: {}, yesNo: null });
    const sub = (uid: string, questId: string) => ({ id: `${uid}-${questId}`, uid, kind: 'global' as const, questId, status: 'approved' as const, checked: null, taggedUid: null, t: at(100) });
    const n = night({
      globals: [g('m1', at(10)), g('m2', at(100)), { ...g('beat', at(50)), kind: 'announce' }],
      submissions: [sub('a', 'm1'), sub('a', 'm2'), sub('b', 'm2'), sub('c', 'm1')],
      players: [{ uid: 'a' }, { uid: 'b', joinedAt: at(60) }, { uid: 'c' }, { uid: 'd' }],
    });
    expect(award(closeCase(n).awards, 'loyal')).toEqual({ id: 'loyal', uids: ['a', 'b'], n: { a: { missions: 2 }, b: { missions: 1 } } });
  });
});

describe('roll calls and the time of death', () => {
  const death = { key: 'timeOfDeath', value: '23:02', entries: [], at: at(250) };
  const checkin = (id: string, start: number, answers: Array<[string, number]>, missedUids: string[] = []) => ({
    id,
    startsAt: at(start),
    endsAt: at(start + 15),
    status: 'closed' as const,
    missedUids,
    answers: answers.map(([uid, min]) => ({ uid, t: at(min) })),
  });

  it('places the time of death on the night, even after midnight (23:02 BST is 22:02 UTC)', () => {
    expect(closeCase(night({ facts: [death] })).deathAt).toBe(Date.UTC(2026, 9, 24, 22, 2));
    expect(clockInstant('23:02', START, END, 'Europe/London')).toBe(Date.UTC(2026, 9, 24, 22, 2));
  });

  it('has no time of death without the fact, with a malformed one, or one outside the night', () => {
    expect(closeCase(night()).deathAt).toBeNull();
    expect(clockInstant('11 pm', START, END, 'Europe/London')).toBeNull();
    expect(clockInstant('25:00', START, END, 'Europe/London')).toBeNull();
    expect(clockInstant('18:30', START, END, 'Europe/London')).toBeNull();
  });

  it('Last Seen Alive is the last roll-call answer at or before the time of death', () => {
    // 23:02 BST is 242 minutes after 19:00.
    const n = night({ facts: [death], checkins: [checkin('k1', 180, [['a', 182], ['b', 190]]), checkin('k2', 238, [['c', 239], ['d', 243]])] });
    expect(award(closeCase(n).awards, 'lastseen')).toEqual({ id: 'lastseen', uids: ['c'], n: { c: { at: at(239) } } });
    expect(winners(night({ checkins: n.checkins }), 'lastseen')).toEqual([]);
  });

  it('Present and Correct: answered every roll call since booking in', () => {
    const n = night({
      checkins: [checkin('k1', 0, [['a', 2]], ['b', 'c']), checkin('k2', 60, [['a', 62], ['b', 63]], ['c']), { ...checkin('k3', 120, []), status: 'open' }],
      players: [{ uid: 'a' }, { uid: 'b', bookedAt: at(30) }, { uid: 'c' }, { uid: 'd', bookedAt: at(200) }],
    });
    expect(award(closeCase(n).awards, 'present')).toEqual({ id: 'present', uids: ['a', 'b'], n: { a: { answered: 2 }, b: { answered: 1 } } });
  });
});

describe('the case file', () => {
  it('keeps every points line of the players still in, oldest first, with the GM’s note only on their adjustments', () => {
    const n = night({
      ledger: [line('b', 30, 1, 'adjust', 'for the Macarena'), line('a', 10, 5, 'cleared', 'stray'), line('gone', 20, 5)],
    });
    expect(closeCase(n).timeline).toEqual([
      { uid: 'a', t: at(10), delta: 5, reason: 'cleared', note: null },
      { uid: 'b', t: at(30), delta: 1, reason: 'adjust', note: 'for the Macarena' },
    ]);
  });

  it('prints the awards in a fixed order and is plain data (no undefined, survives JSON)', () => {
    const n = night({
      ledger: [line('a', 10, 5), line('b', 20, -5, 'framed'), line('b', 25, -5, 'framed')],
      players: [{ uid: 'a', points: 5, rank: 1, relation: 'sidepiece' }, { uid: 'b', points: -10, rank: 2 }],
    });
    const file = closeCase(n);
    expect(file.awards.map((a) => a.id)).toEqual(['hustler', 'sidepiece', 'champion', 'spoon', 'fallguy']);
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });

  it('is the mystery pack’s closing hook', () => {
    expect(getPack('mystery').closing).toBe(closeCase);
  });
});
