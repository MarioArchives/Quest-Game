// Police check-ins answered in the app (plan edge cases 25–36), packs with the police feature. A person of interest
// gets a 'watch' call as soon as they become one and then every settings.policeEveryMin (by lastCheckedAt); a trusted
// confidant may tip off the police about another player once every settings.policeTipEveryMin (by lastSnitchedAt).
// A right answer earns the call's passPoints; a wrong one, or none in time, costs its failPenalty.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { answerPoliceCall, runPolice, tipOffPolice } from '../src/game/police.js';
import { resetGame } from '../src/game/reset.js';
import { handlePlayerWritten } from '../src/game/standing.js';
import type { GamePack } from '../src/shared/packs/types.js';
import { cooldownLeftMs, isRightAnswer, policeQuestion } from '../src/shared/police.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  constRng,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  ledgerFor,
  MIN,
  seedAdmin,
  seedGame,
  seedPlayer,
  seededRng,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-police');

const PACK: GamePack = testPack({ features: { police: true } });
/** Lines at ±10; a watch call every 30 min, a tip every 60, 5 min to answer, +3 to pass, −2 to fail. */
const SETTINGS: Partial<Settings> = {
  confidantAbove: 10,
  poiBelow: -10,
  policeEveryMin: 30,
  policeTipEveryMin: 60,
  policeWindowMin: 5,
  policePassPoints: 3,
  policeFailPenalty: 2,
  quietHours: null,
};

describe('policeQuestion, isRightAnswer and cooldownLeftMs (edge case 36)', () => {
  it('asks a sum of two numbers from 2 to 12 and knows the answer', () => {
    const rng = seededRng(7);
    const ops = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { question, expected } = policeQuestion(rng);
      const m = /^What's (\d+) ([+×]) (\d+)\?$/.exec(question);
      expect(m, question).not.toBeNull();
      const [a, op, b] = [Number(m![1]), m![2]!, Number(m![3])];
      for (const n of [a, b]) expect(n >= 2 && n <= 12, question).toBe(true);
      expect(expected).toBe(String(op === '+' ? a + b : a * b));
      ops.add(op);
    }
    expect([...ops].sort()).toEqual(['+', '×']);
  });

  it('takes the answer with any spaces around or inside it', () => {
    expect(isRightAnswer('15', '15')).toBe(true);
    expect(isRightAnswer('  15 ', '15')).toBe(true);
    expect(isRightAnswer('1 5', '15')).toBe(true);
  });

  it('refuses words, other numbers and nothing', () => {
    expect(isRightAnswer('fifteen', '15')).toBe(false);
    expect(isRightAnswer('16', '15')).toBe(false);
    expect(isRightAnswer('150', '15')).toBe(false);
    expect(isRightAnswer('', '15')).toBe(false);
    expect(isRightAnswer('   ', '15')).toBe(false);
  });

  it('counts down the time left until a cooldown is over', () => {
    const now = T0.getTime();
    expect(cooldownLeftMs(null, 30, now)).toBe(0);
    expect(cooldownLeftMs(now - 10 * MIN, 30, now)).toBe(20 * MIN);
    expect(cooldownLeftMs(now - 30 * MIN, 30, now)).toBe(0);
    expect(cooldownLeftMs(now - 45 * MIN, 30, now)).toBe(0);
    expect(cooldownLeftMs(now, 60, now)).toBe(60 * MIN);
  });
});

async function setup(settings: Partial<Settings> = {}, status: 'active' | 'paused' | 'lobby' | 'ended' = 'active') {
  await seedGame(db(), { status, settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid);
}

const as = (uid: string | null, now: Date = T0, pack: GamePack = PACK) => ctx(uid, now, constRng(0), undefined, pack);
const setPoints = (uid: string, points: number, extra: Record<string, unknown> = {}) => db().doc(`players/${uid}`).update({ points, ...extra });
/** The players/{uid} trigger, as it runs after every write to their doc. */
const trigger = (uid: string, now: Date = T0, pack: GamePack = PACK) => handlePlayerWritten(db(), uid, now, constRng(0), pack);
/** Points below the line, then the trigger. */
async function becomePoi(uid: string, now: Date = T0, points = -15) {
  await setPoints(uid, points);
  await trigger(uid, now);
}
const tick = (now: Date, pack: GamePack = PACK) => runPolice(db(), now, constRng(0), pack);
const answer = (uid: string | null, callId: string, given: unknown, now: Date = addMin(T0, 1), pack: GamePack = PACK) =>
  answerPoliceCall(db(), as(uid, now, pack), { callId, answer: given });
const tip = (from: string | null, targetUid: unknown, note: unknown = 'Seen wiping down the candlestick', now: Date = T0, pack: GamePack = PACK) =>
  tipOffPolice(db(), as(from, now, pack), { targetUid, note });

const calls = async () => (await allDocs(db(), 'policeCalls')).sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
const callsFor = async (uid: string) => (await calls()).filter((c) => c.uid === uid);
const openFor = async (uid: string) => (await callsFor(uid)).filter((c) => c.status === 'open');
const call = async (id: string) => (await getData(db(), `policeCalls/${id}`))!;
const player = (uid: string) => getPlayer(db(), uid);
const policeLedger = async (uid: string) =>
  (await ledgerFor(db(), uid)).filter((l) => String(l.reason).startsWith('police')).map((l) => [l.reason, l.delta]);

describe('watch calls for persons of interest (edge cases 25–28)', () => {
  it('becoming a person of interest opens a watch call at once, posted to them', async () => {
    await setup();
    await becomePoi('alice');
    const [c] = await calls();
    expect(c).toMatchObject({
      uid: 'alice',
      kind: 'watch',
      byUid: null,
      note: null,
      status: 'open',
      answer: null,
      answeredAt: null,
      passPoints: 3,
      failPenalty: 2,
    });
    expect(c!.question).toMatch(/^What's \d+ [+×] \d+\?$/);
    expect(c!.expected).toMatch(/^\d+$/);
    expect(toMillis(c!.startsAt)).toBe(T0.getTime());
    expect(toMillis(c!.endsAt)).toBe(addMin(T0, 5).getTime());
    const alice = await player('alice');
    expect(toMillis(alice.lastCheckedAt)).toBe(T0.getTime());
    expect(alice.lastSnitchedAt ?? null).toBeNull();
    const posts = await feedOf(db(), 'police-call');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', ref: c!.id });
  });

  it('the trigger firing again on its own write opens nothing more', async () => {
    await setup();
    await becomePoi('alice');
    await trigger('alice', addMin(T0, 1));
    await trigger('alice', addMin(T0, 2));
    expect(await calls()).toHaveLength(1);
  });

  it('dropping back within 30 min of the last watch call: no call until 30 min have passed, then the timer calls', async () => {
    await setup();
    await becomePoi('alice');
    const [first] = await calls();
    await answer('alice', first!.id, first!.expected, addMin(T0, 1));
    await setPoints('alice', -8);
    await trigger('alice', addMin(T0, 10));
    await becomePoi('alice', addMin(T0, 20), -12);
    expect(await callsFor('alice')).toHaveLength(1);
    expect((await tick(addMin(T0, 25))).opened).toEqual([]);

    const res = await tick(addMin(T0, 30));
    expect(res.opened).toHaveLength(1);
    const latest = await call(res.opened[0]!);
    expect(latest).toMatchObject({ uid: 'alice', kind: 'watch', status: 'open' });
    expect(toMillis((await player('alice')).lastCheckedAt)).toBe(addMin(T0, 30).getTime());
  });

  it('while they stay a person of interest, a new watch call goes out every 30 min after the last', async () => {
    await setup();
    await becomePoi('alice');
    expect((await tick(addMin(T0, 29))).opened).toEqual([]);
    expect((await tick(addMin(T0, 30))).opened).toHaveLength(1);
    expect((await tick(addMin(T0, 45))).opened).toEqual([]);
    expect((await tick(addMin(T0, 60))).opened).toHaveLength(1);
    expect((await callsFor('alice')).map((c) => toMillis(c.startsAt))).toEqual([T0, addMin(T0, 30), addMin(T0, 60)].map((d) => d.getTime()));
  });

  it("never while one of their calls is still open; the next goes once it closes", async () => {
    await setup({ policeWindowMin: 40 });
    await becomePoi('alice');
    expect((await tick(addMin(T0, 30))).opened).toEqual([]);
    const res = await tick(addMin(T0, 41));
    expect(res.missed).toHaveLength(1);
    expect(res.opened).toHaveLength(1);
    expect(await openFor('alice')).toHaveLength(1);
  });

  it('an open tip call holds the watch call back too, and does not count as one', async () => {
    await setup();
    await setPoints('bob', 15);
    await setPoints('alice', -5);
    await tip('bob', 'alice', 'Hovering by the study door', T0);
    await becomePoi('alice', addMin(T0, 1));
    expect(await callsFor('alice')).toHaveLength(1);
    expect((await player('alice')).lastCheckedAt ?? null).toBeNull();

    const res = await tick(addMin(T0, 6));
    expect(res.missed).toHaveLength(1);
    expect(res.opened).toHaveLength(1);
    expect((await call(res.opened[0]!)).kind).toBe('watch');
  });

  it('no watch calls in quiet hours', async () => {
    await setup({ quietHours: { start: '14:00', end: '16:00' } });
    await becomePoi('alice');
    expect((await tick(addMin(T0, 31))).opened).toEqual([]);
    expect(await calls()).toEqual([]);
  });

  it.each(['paused', 'lobby', 'ended'] as const)('no watch calls while the game is %s', async (status) => {
    await setup({}, status);
    await becomePoi('alice');
    expect((await tick(addMin(T0, 31))).opened).toEqual([]);
    expect(await calls()).toEqual([]);
  });

  it('no watch calls for a player who has left', async () => {
    await setup();
    await setPoints('alice', -15, { left: 'frozen' });
    await trigger('alice');
    await tick(addMin(T0, 31));
    expect(await calls()).toEqual([]);
  });

  it('no more watch calls once they climb back out, though an open one stays open and can be answered', async () => {
    await setup();
    await becomePoi('alice');
    await setPoints('alice', 0);
    await trigger('alice', addMin(T0, 1));
    const [c] = await calls();
    expect(c!.status).toBe('open');
    expect(await answer('alice', c!.id, c!.expected, addMin(T0, 2))).toEqual({ status: 'passed', points: 3 });
    expect((await tick(addMin(T0, 31))).opened).toEqual([]);
  });
});

describe('answering (edge case 29)', () => {
  async function openCall() {
    await setup();
    await becomePoi('alice');
    return (await calls())[0]!;
  }

  it('a right answer passes: +passPoints, kept and posted', async () => {
    const c = await openCall();
    expect(await answer('alice', c.id, c.expected)).toEqual({ status: 'passed', points: 3 });
    const after = await call(c.id);
    expect(after).toMatchObject({ status: 'passed', answer: c.expected });
    expect(toMillis(after.answeredAt)).toBe(addMin(T0, 1).getTime());
    expect((await player('alice')).points).toBe(-12);
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
    const posts = await feedOf(db(), 'police-result');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', ref: c.id, points: 3 });
  });

  it('a wrong answer fails: −failPenalty', async () => {
    const c = await openCall();
    expect(await answer('alice', c.id, 'banana')).toEqual({ status: 'failed', points: -2 });
    expect(await call(c.id)).toMatchObject({ status: 'failed', answer: 'banana' });
    expect((await player('alice')).points).toBe(-17);
    expect(await policeLedger('alice')).toEqual([['police-fail', -2]]);
    expect((await feedOf(db(), 'police-result'))[0]).toMatchObject({ uid: 'alice', points: -2 });
  });

  it('takes the right answer with spaces around it', async () => {
    const c = await openCall();
    expect((await answer('alice', c.id, `  ${c.expected} `)).status).toBe('passed');
  });

  it('refuses a second answer, anyone else, a closed call and an unknown one', async () => {
    const c = await openCall();
    await expectCode(answer('bob', c.id, c.expected), 'permission-denied');
    await expectCode(answer('gm', c.id, c.expected), 'permission-denied');
    await expectCode(answer(null, c.id, c.expected), 'unauthenticated');
    await expectCode(answer('alice', 'nope', c.expected), 'not-found');
    await answer('alice', c.id, 'banana');
    await expectCode(answer('alice', c.id, c.expected), 'failed-precondition');
    expect(await policeLedger('alice')).toEqual([['police-fail', -2]]);
  });

  it('refuses an answer once its time is up, even before the timer closes it', async () => {
    const c = await openCall();
    await expectCode(answer('alice', c.id, c.expected, addMin(T0, 5)), 'failed-precondition');
    await tick(addMin(T0, 6));
    await expectCode(answer('alice', c.id, c.expected, addMin(T0, 6)), 'failed-precondition');
  });

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['over 20 characters', 'x'.repeat(21)],
    ['a number rather than text', 15],
    ['no answer at all', undefined],
  ])('refuses %s as an answer', async (_label, given) => {
    const c = await openCall();
    await expectCode(answer('alice', c.id, given), 'invalid-argument');
    expect((await call(c.id)).status).toBe('open');
  });

  it('can be answered while the game is paused, but not once it has ended', async () => {
    const c = await openCall();
    await db().doc('game/state').update({ status: 'paused' });
    expect((await answer('alice', c.id, c.expected)).status).toBe('passed');

    await setPoints('bob', -15);
    await db().doc('game/state').update({ status: 'active' });
    await trigger('bob', addMin(T0, 2));
    const [b] = await openFor('bob');
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(answer('bob', b!.id, b!.expected, addMin(T0, 3)), 'failed-precondition');
  });

  it('each call keeps the points it opened with', async () => {
    const c = await openCall();
    await db().doc('game/settings').update({ policePassPoints: 10, policeFailPenalty: 10 });
    expect(await answer('alice', c.id, c.expected)).toEqual({ status: 'passed', points: 3 });
  });

  it('refuses in a pack without police', async () => {
    const c = await openCall();
    await expectCode(answer('alice', c.id, c.expected, addMin(T0, 1), lancaster()), 'failed-precondition');
  });
});

describe('the timer closing calls (edge case 30)', () => {
  it('marks an unanswered call missed when its time is up and charges the fine once', async () => {
    await setup();
    await becomePoi('alice');
    const [c] = await calls();
    expect((await tick(addMin(T0, 4))).missed).toEqual([]);
    expect((await tick(addMin(T0, 5))).missed).toEqual([c!.id]);
    expect((await call(c!.id)).status).toBe('missed');
    expect((await player('alice')).points).toBe(-17);
    expect(await policeLedger('alice')).toEqual([['police-missed', -2]]);
    const posts = await feedOf(db(), 'police-result');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', ref: c!.id, points: -2 });

    expect((await tick(addMin(T0, 6))).missed).toEqual([]);
    expect(await policeLedger('alice')).toEqual([['police-missed', -2]]);
  });

  it('calls off the open call of a player who has left, with no fine', async () => {
    await setup();
    await becomePoi('alice');
    const [c] = await calls();
    await db().doc('players/alice').update({ left: 'out' });
    const res = await tick(addMin(T0, 6));
    expect(res.cancelled).toEqual([c!.id]);
    expect(res.missed).toEqual([]);
    expect((await call(c!.id)).status).toBe('cancelled');
    expect(await policeLedger('alice')).toEqual([]);
  });
});

describe('tips from a trusted confidant (edge cases 28, 31–32)', () => {
  async function confidant(uid = 'bob', points = 15) {
    await setup();
    await setPoints(uid, points);
  }

  it('opens a tip call on the target with the note, names both in the post, and starts their cooldown', async () => {
    await confidant();
    const { callId } = await tip('bob', 'alice', '  Seen wiping down the candlestick  ');
    expect(await call(callId)).toMatchObject({
      uid: 'alice',
      kind: 'tip',
      byUid: 'bob',
      note: 'Seen wiping down the candlestick',
      status: 'open',
      passPoints: 3,
      failPenalty: 2,
    });
    expect(toMillis((await call(callId)).endsAt)).toBe(addMin(T0, 5).getTime());
    expect(toMillis((await player('bob')).lastSnitchedAt)).toBe(T0.getTime());
    expect((await player('bob')).lastCheckedAt ?? null).toBeNull();
    expect((await player('alice')).lastCheckedAt ?? null).toBeNull();
    const posts = await feedOf(db(), 'police-tip');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', actorUid: 'bob', ref: callId, note: 'Seen wiping down the candlestick' });
    expect(posts[0]!.text).toMatch(/Bob/);
    expect(posts[0]!.text).toMatch(/Alice/);
  });

  it('a tip call is answered like any other', async () => {
    await confidant();
    const { callId } = await tip('bob', 'alice');
    const c = await call(callId);
    expect(await answer('alice', callId, c.expected)).toEqual({ status: 'passed', points: 3 });
  });

  it('only a trusted confidant can tip, judged on their points right now', async () => {
    await confidant('bob', 10);
    await expectCode(tip('bob', 'alice'), 'permission-denied');
    await setPoints('bob', -15);
    await expectCode(tip('bob', 'alice'), 'permission-denied');
    await setPoints('bob', 5, { standing: 'confidant' });
    await expectCode(tip('bob', 'alice'), 'permission-denied');
    await setPoints('bob', 11, { standing: null });
    await expect(tip('bob', 'alice')).resolves.toMatchObject({ callId: expect.any(String) });
  });

  it('once an hour by lastSnitchedAt, even after losing and regaining confidant', async () => {
    await confidant();
    await tip('bob', 'alice', 'One', T0);
    await expectCode(tip('bob', 'carol', 'Two', addMin(T0, 30)), 'failed-precondition');
    await setPoints('bob', 0);
    await setPoints('bob', 15);
    await expectCode(tip('bob', 'carol', 'Two', addMin(T0, 59)), 'failed-precondition');
    await expect(tip('bob', 'carol', 'Two', addMin(T0, 60))).resolves.toMatchObject({ callId: expect.any(String) });
  });

  it('refuses themselves, a player who has left and an unknown player', async () => {
    await confidant();
    await expectCode(tip('bob', 'bob'), 'invalid-argument');
    await expectCode(tip('bob', 'nobody'), 'not-found');
    await expectCode(tip('bob', 7), 'invalid-argument');
    await db().doc('players/carol').update({ left: 'frozen' });
    await expectCode(tip('bob', 'carol'), 'failed-precondition');
    expect(await calls()).toEqual([]);
    expect((await player('bob')).lastSnitchedAt ?? null).toBeNull();
  });

  it.each([
    ['an empty note', ''],
    ['a note of only spaces', '   '],
    ['a note over 200 characters', 'x'.repeat(201)],
    ['no note', null],
  ])('refuses %s', async (_label, note) => {
    await confidant();
    await expectCode(tip('bob', 'alice', note), 'invalid-argument');
    expect(await calls()).toEqual([]);
  });

  it('refuses a target already being questioned, without spending the cooldown', async () => {
    await confidant();
    await becomePoi('alice');
    await expectCode(tip('bob', 'alice'), 'failed-precondition');
    expect((await player('bob')).lastSnitchedAt ?? null).toBeNull();
    await expect(tip('bob', 'carol')).resolves.toMatchObject({ callId: expect.any(String) });
  });

  it('refuses outside a running game, from a non-player, signed out, and in a pack without police', async () => {
    await confidant();
    await expectCode(tip('gm', 'alice'), 'permission-denied');
    await expectCode(tip(null, 'alice'), 'unauthenticated');
    await expectCode(tip('bob', 'alice', 'x', T0, lancaster()), 'failed-precondition');
    for (const status of ['paused', 'lobby', 'ended'] as const) {
      await db().doc('game/state').update({ status });
      await expectCode(tip('bob', 'alice'), 'failed-precondition');
    }
    expect(await calls()).toEqual([]);
  });

  it("tips never touch the target's watch clock, and watch calls never touch anyone's tip clock", async () => {
    await confidant();
    await becomePoi('alice');
    const [w] = await calls();
    await answer('alice', w!.id, w!.expected, addMin(T0, 1));
    await tip('bob', 'alice', 'Still shifty', addMin(T0, 10));
    expect(toMillis((await player('alice')).lastCheckedAt)).toBe(T0.getTime());
    expect((await player('alice')).lastSnitchedAt ?? null).toBeNull();
    await tick(addMin(T0, 16));
    const res = await tick(addMin(T0, 30));
    expect(res.opened).toHaveLength(1);
    expect(toMillis((await player('bob')).lastSnitchedAt)).toBe(addMin(T0, 10).getTime());
  });
});

describe('packs without police, and the game around them (edge cases 33–34)', () => {
  it('in a pack without police nobody is called, though standings still change', async () => {
    await setup();
    await setPoints('alice', -15);
    await trigger('alice', T0, lancaster());
    expect((await player('alice')).standing).toBe('poi');
    expect(await runPolice(db(), addMin(T0, 31), constRng(0), lancaster())).toEqual({ opened: [], missed: [], cancelled: [], resent: [] });
    expect(await calls()).toEqual([]);
  });

  it('ending the game calls off every open call with no fine', async () => {
    await setup();
    await becomePoi('alice');
    const [c] = await calls();
    await endGame(db(), as('gm', addMin(T0, 1)), { venues: [] });
    expect((await call(c!.id)).status).toBe('cancelled');
    expect(await policeLedger('alice')).toEqual([]);
  });

  it('a reset wipes the calls', async () => {
    await setup();
    await becomePoi('alice');
    await resetGame(db(), as('gm'), { confirm: 'RESET' });
    expect(await calls()).toEqual([]);
  });

  it('opening a call leaves the other police fields alone', async () => {
    await setup();
    await db().doc('players/alice').update({ lastSnitchedAt: ts(addMin(T0, -90)) });
    await becomePoi('alice');
    expect(toMillis((await player('alice')).lastSnitchedAt)).toBe(addMin(T0, -90).getTime());
  });
});
