// Periodic missions (packs with checkins): the GM's series (periodics/{id}) each send a check-in every intervalMin
// while running, up to their count (0 = no limit); everyone answers with a photo or a comment within windowMin;
// whoever could have answered and didn't loses the fine the check-in opened with. No points for answering.
import { describe, expect, it } from 'vitest';
import { answerCheckin, closedText, listNames, managePeriodic, midSentence, runPeriodics } from '../src/game/checkins.js';
import { resetGame } from '../src/game/reset.js';
import { termForms } from '../src/shared/packs/terms.js';
import type { GamePack } from '../src/shared/packs/types.js';
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
  MIN,
  seedAdmin,
  seedGame,
  seedPlayer,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-checkins');

const PACK = testPack({ features: { checkins: true } });
const PROMPTS = ['Show us your drink', 'Your best detective face', 'Rate this pub'];
const FIELDS = { name: 'Roll call', prompts: PROMPTS, intervalMin: 60, windowMin: 15, penalty: 5, count: 3 };
const tick = (now: Date, pack: GamePack = PACK) => runPeriodics(db(), now, constRng(0), pack);
const as = (uid: string | null, now: Date = T0, pack: GamePack = PACK) => ctx(uid, now, constRng(0), undefined, pack);
const gm = (data: Parameters<typeof managePeriodic>[2], now: Date = T0, pack: GamePack = PACK) => managePeriodic(db(), as('gm', now, pack), data);
const photo = (uid: string) => ({ imagePath: `submissions/${uid}/a.jpg`, thumbPath: `submissions/${uid}/a_thumb.jpg` });

/** A running game with alice, bob and carol playing (joined two hours ago) and a GM who doesn't play. */
async function setup(settings: Partial<Settings> = {}) {
  await seedGame(db(), { settings: { quietHours: null, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid, { points: 20 });
}

/** A series due now (its next one at T0). */
async function series(over: Record<string, unknown> = {}, id = 'rc') {
  await db().doc(`periodics/${id}`).set({ ...FIELDS, sent: 0, status: 'running', nextAt: ts(T0), createdAt: ts(addMin(T0, -60)), ...over });
  return id;
}

const checkins = async () => (await allDocs(db(), 'checkins')).sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
const missedLedger = async () => (await allDocs(db(), 'pointsLedger')).filter((l) => l.reason === 'missed');
const periodic = async (id = 'rc') => (await getData(db(), `periodics/${id}`))!;

describe('the timer sends them', () => {
  it('does nothing in a pack without periodic missions, or while the game is not running', async () => {
    await setup();
    await series();
    expect(await tick(T0, lancaster())).toEqual({ opened: [], closed: [] });
    for (const status of ['lobby', 'paused', 'ended'] as const) {
      await db().doc('game/state').update({ status });
      expect(await tick(T0)).toEqual({ opened: [], closed: [] });
    }
    expect(await checkins()).toHaveLength(0);
  });

  it('sends a due series: open for its window with its fine and a prompt from its list, posted, counted, and the next one an interval on', async () => {
    await setup();
    await series();
    const { opened } = await tick(T0);
    expect(opened).toHaveLength(1);
    const c = await getData(db(), `checkins/${opened[0]}`);
    expect(c).toMatchObject({ periodicId: 'rc', name: 'Roll call', number: 1, status: 'open', penalty: 5, missedUids: [] });
    expect(PROMPTS).toContain(c!.prompt);
    expect(toMillis(c!.endsAt)).toBe(T0.getTime() + 15 * MIN);
    expect((await feedOf(db(), 'checkin-open'))[0]).toMatchObject({ ref: opened[0], questTitle: c!.prompt, text: `Roll call: ${c!.prompt}` });
    expect(await periodic()).toMatchObject({ sent: 1, status: 'running' });
    expect(toMillis((await periodic()).nextAt)).toBe(T0.getTime() + 60 * MIN);
  });

  it('runs several series side by side, each on its own clock', async () => {
    await setup();
    await series({}, 'a');
    await series({ name: 'Selfie check', nextAt: ts(addMin(T0, 10)), windowMin: 10 }, 'b');
    expect((await tick(T0)).opened).toHaveLength(1);
    expect((await tick(addMin(T0, 10))).opened).toHaveLength(1);
    expect((await checkins()).map((c) => [c.periodicId, c.status])).toEqual([
      ['a', 'open'],
      ['b', 'open'],
    ]);
  });

  it('waits until a series is due, and schedules one with no time yet an interval from now', async () => {
    await setup();
    await series({ nextAt: ts(addMin(T0, 1)) });
    expect((await tick(T0)).opened).toEqual([]);
    expect((await tick(addMin(T0, 1))).opened).toHaveLength(1);
    await series({ nextAt: null }, 'fresh');
    await tick(addMin(T0, 2));
    expect(toMillis((await periodic('fresh')).nextAt)).toBe(T0.getTime() + 62 * MIN);
  });

  it('skips stopped series', async () => {
    await setup();
    await series({ status: 'stopped' });
    expect((await tick(T0)).opened).toEqual([]);
  });

  it('stops a series once it has sent its count; a count of 0 means no limit', async () => {
    await setup();
    await series({ count: 2, windowMin: 5 });
    await tick(T0);
    await tick(addMin(T0, 60));
    expect(await periodic()).toMatchObject({ sent: 2, status: 'stopped', nextAt: null });
    expect((await tick(addMin(T0, 120))).opened).toEqual([]);
    await series({ count: 0, sent: 40 }, 'endless');
    expect((await tick(addMin(T0, 121))).opened).toHaveLength(1);
  });

  it("never opens a series' next one while its own last one is open", async () => {
    await setup();
    await series({ windowMin: 90 });
    await tick(T0);
    expect((await tick(addMin(T0, 60))).opened).toEqual([]);
    expect((await checkins()).filter((c) => c.status === 'open')).toHaveLength(1);
  });

  it('waits out quiet hours', async () => {
    await setup({ quietHours: { start: '14:30', end: '16:00' } }); // 14:00 UTC is 15:00 in London
    await series();
    expect((await tick(T0)).opened).toEqual([]);
  });

  it('prefers prompts the series has not asked yet', async () => {
    await setup();
    await series({ windowMin: 5 });
    await tick(T0);
    await tick(addMin(T0, 60));
    await tick(addMin(T0, 120));
    expect(new Set((await checkins()).map((c) => c.prompt)).size).toBe(3);
  });
});

describe('closing them', () => {
  async function openOne() {
    await setup();
    await series();
    return (await tick(T0)).opened[0]!;
  }

  it("charges the fine to everyone playing who didn't answer, once, and names them", async () => {
    const id = await openOne();
    await answerCheckin(db(), as('alice', addMin(T0, 2)), { checkinId: id, caption: 'A pint of mild' });
    expect((await tick(addMin(T0, 15))).closed).toEqual([id]);
    expect(await getData(db(), `checkins/${id}`)).toMatchObject({ status: 'closed', endedBy: 'time', missedUids: expect.arrayContaining(['bob', 'carol']) });
    expect([(await getPlayer(db(), 'alice')).points, (await getPlayer(db(), 'bob')).points, (await getPlayer(db(), 'carol')).points]).toEqual([20, 15, 15]);
    expect((await missedLedger()).map((l) => [l.uid, l.delta, l.ref]).sort()).toEqual([
      ['bob', -5, id],
      ['carol', -5, id],
    ]);
    expect((await feedOf(db(), 'checkin-closed'))[0]).toMatchObject({ ref: id, text: "Roll call closed: Bob and Carol didn't answer (−5 each)" });
    expect((await tick(addMin(T0, 20))).closed).toEqual([]);
    expect(await missedLedger()).toHaveLength(2);
  });

  it('stays open until its time is up', async () => {
    const id = await openOne();
    expect((await tick(addMin(T0, 14))).closed).toEqual([]);
    expect((await getData(db(), `checkins/${id}`))?.status).toBe('open');
  });

  it('spares players who left and players who joined after it opened', async () => {
    const id = await openOne();
    await db().doc('players/bob').update({ left: 'frozen' });
    await seedPlayer(db(), 'dave', { points: 20, joinedAt: addMin(T0, 5) });
    await tick(addMin(T0, 15));
    expect((await missedLedger()).map((l) => l.uid).sort()).toEqual(['alice', 'carol']);
    expect((await getData(db(), `checkins/${id}`))?.missedUids.sort()).toEqual(['alice', 'carol']);
    expect([(await getPlayer(db(), 'bob')).points, (await getPlayer(db(), 'dave')).points]).toEqual([20, 20]);
  });

  it('posts that everyone answered, and charges nothing', async () => {
    const id = await openOne();
    for (const uid of ['alice', 'bob', 'carol']) await answerCheckin(db(), as(uid, addMin(T0, 1)), { checkinId: id, ...photo(uid) });
    await tick(addMin(T0, 15));
    expect(await missedLedger()).toHaveLength(0);
    expect((await feedOf(db(), 'checkin-closed'))[0]).toMatchObject({ text: 'Roll call closed: everyone answered' });
  });

  it('keeps the fine it opened with, even if the GM edits the series meanwhile', async () => {
    const id = await openOne();
    await gm({ action: 'update', id: 'rc', fields: { penalty: 50 } });
    await tick(addMin(T0, 15));
    expect((await missedLedger()).every((l) => l.delta === -5)).toBe(true);
    expect((await getData(db(), `checkins/${id}`))?.penalty).toBe(5);
  });

  it('with a fine of 0, still records who missed it but charges nothing', async () => {
    await setup();
    await series({ penalty: 0 });
    const id = (await tick(T0)).opened[0]!;
    await tick(addMin(T0, 15));
    expect(await missedLedger()).toHaveLength(0);
    expect((await getData(db(), `checkins/${id}`))?.missedUids).toHaveLength(3);
    expect((await feedOf(db(), 'checkin-closed'))[0]!.text).toBe("Roll call closed: Alice, Bob and Carol didn't answer");
  });

  it('respects the zero floor', async () => {
    await setup({ pointsFloorZero: true });
    await db().doc('players/bob').update({ points: 3 });
    await series();
    await tick(T0);
    await tick(addMin(T0, 15));
    expect((await getPlayer(db(), 'bob')).points).toBe(0);
  });
});

describe('answerCheckin', () => {
  async function openOne() {
    await setup();
    await series();
    return (await tick(T0)).opened[0]!;
  }

  it('takes a photo or a comment, once, and posts it with the evidence; no points', async () => {
    const id = await openOne();
    await expect(answerCheckin(db(), as('alice', addMin(T0, 3)), { checkinId: id, ...photo('alice'), caption: 'Cheers' })).resolves.toEqual({ ok: true });
    const answer = await getData(db(), `checkins/${id}/answers/alice`);
    expect(answer).toMatchObject({ uid: 'alice', ...photo('alice'), caption: 'Cheers' });
    expect((await feedOf(db(), 'checkin-answer'))[0]).toMatchObject({ id: answer!.feedId, uid: 'alice', ref: id, text: 'Alice answered the roll call', ...photo('alice'), caption: 'Cheers' });
    expect((await getPlayer(db(), 'alice')).points).toBe(20);
    await answerCheckin(db(), as('bob', addMin(T0, 3)), { checkinId: id, caption: 'Just a comment' });
    expect(await getData(db(), `checkins/${id}/answers/bob`)).toMatchObject({ imagePath: null, thumbPath: null, caption: 'Just a comment' });
  });

  it('refuses a second answer', async () => {
    const id = await openOne();
    await answerCheckin(db(), as('alice'), { checkinId: id, caption: 'One' });
    await expectCode(answerCheckin(db(), as('alice'), { checkinId: id, caption: 'Two' }), 'already-exists');
  });

  it('refuses once its time is up, even before the timer closes it, and once closed', async () => {
    const id = await openOne();
    await expectCode(answerCheckin(db(), as('alice', addMin(T0, 15)), { checkinId: id, caption: 'Late' }), 'failed-precondition');
    await tick(addMin(T0, 15));
    await expectCode(answerCheckin(db(), as('bob', addMin(T0, 16)), { checkinId: id, caption: 'Late' }), 'failed-precondition');
  });

  it('works while the game is paused (the clock keeps running)', async () => {
    const id = await openOne();
    await db().doc('game/state').update({ status: 'paused' });
    await expect(answerCheckin(db(), as('alice', addMin(T0, 1)), { checkinId: id, caption: 'Here' })).resolves.toEqual({ ok: true });
  });

  it.each([
    ['nothing', {}],
    ['a blank comment', { caption: '   ' }],
    ['a photo without its thumbnail', { imagePath: 'submissions/alice/a.jpg' }],
    ["someone else's photo", photo('bob')],
  ])('refuses %s', async (_label, evidence) => {
    const id = await openOne();
    await expectCode(answerCheckin(db(), as('alice'), { checkinId: id, ...evidence }), 'invalid-argument');
    expect(await getData(db(), `checkins/${id}/answers/alice`)).toBeUndefined();
  });

  it('refuses a missing one, a non-player, a player who left, signed out, and a pack without periodic missions', async () => {
    const id = await openOne();
    await expectCode(answerCheckin(db(), as('alice'), { checkinId: 'nope', caption: 'x' }), 'not-found');
    await expectCode(answerCheckin(db(), as('gm'), { checkinId: id, caption: 'x' }), 'permission-denied');
    await db().doc('players/bob').update({ left: 'frozen' });
    await expectCode(answerCheckin(db(), as('bob'), { checkinId: id, caption: 'x' }), 'permission-denied');
    await expectCode(answerCheckin(db(), as(null), { checkinId: id, caption: 'x' }), 'unauthenticated');
    await expectCode(answerCheckin(db(), as('alice', T0, lancaster()), { checkinId: id, caption: 'x' }), 'failed-precondition');
  });
});

describe('managePeriodic (the GM)', () => {
  it('creates a series, running by default with the first one an interval in, or stopped', async () => {
    await setup();
    const { id } = await gm({ action: 'create', fields: { ...FIELDS, name: '  Selfie check ', prompts: [' A selfie '] } });
    expect(await periodic(id)).toMatchObject({ name: 'Selfie check', prompts: ['A selfie'], sent: 0, status: 'running' });
    expect(toMillis((await periodic(id)).nextAt)).toBe(T0.getTime() + 60 * MIN);
    const stopped = await gm({ action: 'create', fields: FIELDS, start: false });
    expect(await periodic(stopped.id)).toMatchObject({ status: 'stopped', nextAt: null });
  });

  it.each([
    ['no name', { name: ' ' }],
    ['a 41-character name', { name: 'x'.repeat(41) }],
    ['no prompts', { prompts: [] }],
    ['a blank prompt', { prompts: ['ok', ' '] }],
    ['a 201-character prompt', { prompts: ['x'.repeat(201)] }],
    ['a 4-minute interval', { intervalMin: 4 }],
    ['a 0-minute window', { windowMin: 0 }],
    ['a negative fine', { penalty: -1 }],
    ['a fractional count', { count: 1.5 }],
    ['a count over 100', { count: 101 }],
  ])('refuses to create one with %s', async (_label, over) => {
    await setup();
    await expectCode(gm({ action: 'create', fields: { ...FIELDS, ...over } }), 'invalid-argument');
    expect(await allDocs(db(), 'periodics')).toHaveLength(0);
  });

  it('updates any fields, checked as a whole; a new interval restarts a running clock', async () => {
    await setup();
    await series({ nextAt: ts(addMin(T0, 40)) });
    await gm({ action: 'update', id: 'rc', fields: { name: 'Drinks check', count: 0 } });
    expect(await periodic()).toMatchObject({ name: 'Drinks check', count: 0, prompts: PROMPTS });
    expect(toMillis((await periodic()).nextAt)).toBe(T0.getTime() + 40 * MIN);
    await gm({ action: 'update', id: 'rc', fields: { intervalMin: 30 } }, addMin(T0, 5));
    expect(toMillis((await periodic()).nextAt)).toBe(T0.getTime() + 35 * MIN);
    await expectCode(gm({ action: 'update', id: 'rc', fields: { windowMin: 500 } }), 'invalid-argument');
  });

  it('stops and starts the timer (starting puts the next one an interval out); a finished series needs a higher count to start', async () => {
    await setup();
    await series();
    await gm({ action: 'stop', id: 'rc' });
    expect(await periodic()).toMatchObject({ status: 'stopped', nextAt: null });
    expect((await tick(T0)).opened).toEqual([]);
    await gm({ action: 'start', id: 'rc' }, addMin(T0, 10));
    expect(await periodic()).toMatchObject({ status: 'running' });
    expect(toMillis((await periodic()).nextAt)).toBe(T0.getTime() + 70 * MIN);
    await db().doc('periodics/rc').update({ sent: 3, status: 'stopped' });
    await expectCode(gm({ action: 'start', id: 'rc' }), 'failed-precondition');
    await gm({ action: 'update', id: 'rc', fields: { count: 5 } });
    await expect(gm({ action: 'start', id: 'rc' })).resolves.toEqual({ id: 'rc' });
  });

  it("fires a series' next one now (its own prompt if given), counted, with its clock restarted; stopped series fire too", async () => {
    await setup();
    await series({ nextAt: ts(addMin(T0, 40)) });
    await gm({ action: 'fire', id: 'rc', prompt: '  Everyone: a selfie with the barman ' });
    const [c] = await checkins();
    expect(c).toMatchObject({ periodicId: 'rc', prompt: 'Everyone: a selfie with the barman', number: 1, status: 'open' });
    expect(await periodic()).toMatchObject({ sent: 1 });
    expect(toMillis((await periodic()).nextAt)).toBe(T0.getTime() + 60 * MIN);
    await series({ status: 'stopped', nextAt: null }, 'quiet');
    await gm({ action: 'fire', id: 'quiet' });
    expect(PROMPTS).toContain((await checkins()).find((x) => x.periodicId === 'quiet')!.prompt);
    expect(await periodic('quiet')).toMatchObject({ sent: 1, status: 'stopped', nextAt: null });
  });

  it('refuses to fire while its last one is open, once it has sent them all, outside a running game, or with a bad prompt', async () => {
    await setup();
    await series({ count: 1 });
    await expectCode(gm({ action: 'fire', id: 'rc', prompt: '' }), 'invalid-argument');
    await gm({ action: 'fire', id: 'rc' });
    await expectCode(gm({ action: 'fire', id: 'rc' }), 'failed-precondition');
    await series({}, 'other');
    await db().doc('game/state').update({ status: 'paused' });
    await expectCode(gm({ action: 'fire', id: 'other' }), 'failed-precondition');
  });

  it('ends an open one early: with fines like the timer, or without any', async () => {
    await setup();
    await series();
    await series({ name: 'Selfie check' }, 'b');
    await tick(T0);
    const open = await checkins();
    const a = open.find((c) => c.periodicId === 'rc')!.id;
    const b = open.find((c) => c.periodicId === 'b')!.id;
    await answerCheckin(db(), as('alice'), { checkinId: a, caption: 'x' });
    await gm({ action: 'end', checkinId: a, charge: true }, addMin(T0, 2));
    expect(await getData(db(), `checkins/${a}`)).toMatchObject({ status: 'closed', endedBy: 'gm' });
    expect((await missedLedger()).map((l) => l.uid).sort()).toEqual(['bob', 'carol']);
    await gm({ action: 'end', checkinId: b }, addMin(T0, 3));
    expect(await getData(db(), `checkins/${b}`)).toMatchObject({ status: 'closed', endedBy: 'gm', missedUids: [] });
    expect(await missedLedger()).toHaveLength(2);
    expect((await feedOf(db(), 'checkin-closed')).map((p) => p.text)).toEqual([
      "Roll call closed: Bob and Carol didn't answer (−5 each)",
      'Selfie check was ended early by the GM, no fines',
    ]);
    await expectCode(gm({ action: 'end', checkinId: b }), 'failed-precondition');
    await expectCode(gm({ action: 'end', checkinId: 'nope' }), 'not-found');
  });

  it('deletes a series, but not while one of its check-ins is open', async () => {
    await setup();
    await series();
    await tick(T0);
    await expectCode(gm({ action: 'delete', id: 'rc' }), 'failed-precondition');
    await tick(addMin(T0, 15));
    await gm({ action: 'delete', id: 'rc' });
    expect(await getData(db(), 'periodics/rc')).toBeUndefined();
    expect(await checkins()).toHaveLength(1);
  });

  it('refuses players, signed-out callers, unknown actions and ids, and packs without periodic missions', async () => {
    await setup();
    await series();
    await expectCode(managePeriodic(db(), as('alice'), { action: 'stop', id: 'rc' }), 'permission-denied');
    await expectCode(managePeriodic(db(), as(null), { action: 'stop', id: 'rc' }), 'unauthenticated');
    await expectCode(gm({ action: 'explode', id: 'rc' }), 'invalid-argument');
    await expectCode(gm({ action: 'stop', id: 'nope' }), 'not-found');
    await expectCode(gm({ action: 'stop', id: 'rc' }, T0, lancaster()), 'failed-precondition');
  });
});

describe('the game around them', () => {
  it('a reset clears the check-ins and their answers, and keeps the series with their counts back at 0', async () => {
    await setup();
    await series({ count: 1 });
    const id = (await tick(T0)).opened[0]!;
    await answerCheckin(db(), as('alice'), { checkinId: id, caption: 'x' });
    await resetGame(db(), as('gm'), { confirm: 'RESET' });
    expect(await allDocs(db(), 'checkins')).toHaveLength(0);
    expect(await allDocs(db(), `checkins/${id}/answers`)).toHaveLength(0);
    expect(await periodic()).toMatchObject({ name: 'Roll call', sent: 0, nextAt: null });
  });
});

describe('wording', () => {
  it('lists names with commas and "and"', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Maya'])).toBe('Maya');
    expect(listNames(['Maya', 'Sam'])).toBe('Maya and Sam');
    expect(listNames(['Maya', 'Sam', 'Jonah'])).toBe('Maya, Sam and Jonah');
  });
  it('says who missed it and what it cost, or that the GM called it off', () => {
    expect(closedText('Roll call', [], 5, 'time')).toBe('Roll call closed: everyone answered');
    expect(closedText('Roll call', ['Jonah'], 5, 'time')).toBe("Roll call closed: Jonah didn't answer (−5)");
    expect(closedText('Roll call', ['Jonah', 'Ben'], 5, 'gm-charge')).toBe("Roll call closed: Jonah and Ben didn't answer (−5 each)");
    expect(closedText('Roll call', ['Jonah'], 5, 'gm-free')).toBe('Roll call was ended early by the GM, no fines');
  });
  it('puts a name in the middle of a sentence', () => {
    expect(midSentence('Roll call')).toBe('roll call');
    expect(midSentence('GM check')).toBe('GM check');
  });
  it('calls them check-ins when the pack names nothing', () => {
    expect(termForms(lancaster().terms).checkin).toEqual({ one: 'check-in', One: 'Check-in', many: 'check-ins', Many: 'Check-ins' });
  });
});
