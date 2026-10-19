// The simulated phone line (the mock and the emulators, where nothing may ring a real phone): calls "go out" with a
// SIM- id from a made-up number in Ofcom's drama range, and the app plays the phone through simulateCall. Each move
// reaches the voice webhook's own handlers as Twilio's request would, so a test call verifies the line and a
// check-in is scored exactly as a real call; only the player's own calls on the simulated line can be played. And a
// server with no line at all refuses a test call with a reason the app can act on.
import { describe, expect, it } from 'vitest';
import type { PhoneLine } from '../src/game/phoneLine.js';
import { setPoliceLine, setSwitchboard, testPoliceLine } from '../src/game/phones.js';
import { runPolice } from '../src/game/police.js';
import { dialPoliceCall } from '../src/game/policePhone.js';
import { SIMULATED_CALLER_ID, simulateCall, simulatedLine, turnOf, twilioRequestFor } from '../src/game/simulatedLine.js';
import { handlePlayerWritten } from '../src/game/standing.js';
import { isSimulatedSid } from '../src/shared/phone.js';
import type { GamePack } from '../src/shared/packs/types.js';
import type { Settings } from '../src/shared/types.js';
import { addMin, allDocs, constRng, ctx, expectCode, getData, getPlayer, ledgerFor, seedAdmin, seedGame, seedPlayer, T0, toMillis, ts, useEmulatorDb } from './helpers.js';
import { testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-simline');

const PACK: GamePack = testPack({ features: { police: true } });
const SETTINGS: Partial<Settings> = {
  confidantAbove: 10,
  poiBelow: -10,
  policeEveryMin: 30,
  policeTipEveryMin: 60,
  policeWindowMin: 5,
  policePassPoints: 3,
  policeFailPenalty: 2,
  quietHours: null,
  policePhone: true,
  policeBreakerAt: 3,
  policeCallerName: 'Test Constabulary',
};

async function setup(settings: Partial<Settings> = {}) {
  await seedGame(db(), { status: 'active', settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob']) await seedPlayer(db(), uid);
}

const as = (uid: string | null, now: Date = T0, pack: GamePack = PACK) => ctx(uid, now, constRng(0), undefined, pack);
const phoneOf = async (uid: string) => getData(db(), `phones/${uid}`);
const sim = (uid: string | null, data: Parameters<typeof simulateCall>[2], now: Date = addMin(T0, 0.5)) => simulateCall(db(), as(uid, now), data);

/** Alice's number saved and a test call placed on the simulated line. */
async function testCall(line: PhoneLine = simulatedLine(), uid = 'alice') {
  await setPoliceLine(db(), as(uid), { number: '07700 900001' }, line);
  const { testId, ringing } = await testPoliceLine(db(), as(uid), {}, line);
  expect(ringing).toBe(true);
  return testId;
}

/** Alice on watch with a verified line, her check-in dialled on the simulated line. */
async function checkIn() {
  await db()
    .doc('phones/alice')
    .set({ number: '+447700900001', status: 'verified', verifiedAt: null, failures: 0, reason: null, callerId: null, test: null, updatedAt: ts(T0) });
  await db().doc('players/alice').update({ points: -15 });
  await handlePlayerWritten(db(), 'alice', T0, constRng(0), PACK);
  const [c] = await allDocs(db(), 'policeCalls');
  expect(c).toMatchObject({ uid: 'alice', channel: 'phone' });
  expect(await dialPoliceCall(db(), c!.id, T0, PACK, simulatedLine())).toBe('dialled');
  return c!.id as string;
}

describe('the simulated line', () => {
  it('rings from a drama number, gives each call its own SIM- id, and its account is always fine', async () => {
    const line = simulatedLine();
    expect(line.callerId).toBe(SIMULATED_CALLER_ID);
    expect(SIMULATED_CALLER_ID).toMatch(/^\+447700900\d{3}$/);
    expect(await line.placeCall({ to: '+447700900001', query: { line: 'alice', test: 't1' } })).toEqual({ sid: 'SIM-t1' });
    expect(await line.placeCall({ to: '+447700900001', query: { call: 'c1' } })).toEqual({ sid: 'SIM-c1' });
    expect(isSimulatedSid('SIM-t1')).toBe(true);
    expect(isSimulatedSid('CA123')).toBe(false);
    expect(isSimulatedSid(null)).toBe(false);
    expect(await line.health()).toMatchObject({ ok: true, code: null });
  });

  it('notes its caller ID on a new number, so the calling card has a number to save', async () => {
    await setup();
    await setPoliceLine(db(), as('alice'), { number: '07700 900001' }, simulatedLine());
    expect(await phoneOf('alice')).toMatchObject({ number: '+447700900001', status: 'unverified', callerId: SIMULATED_CALLER_ID });
  });

  it('the GM’s Twilio check reports it healthy', async () => {
    await setup();
    expect(await setSwitchboard(db(), as('gm'), { action: 'check' }, simulatedLine())).toMatchObject({ health: { ok: true } });
  });
});

describe('a test call, played in the app', () => {
  it('rings, is answered with the code read out, and keying it back verifies the line, as on a real phone', async () => {
    await setup();
    const testId = await testCall();
    expect(await phoneOf('alice')).toMatchObject({ callerId: SIMULATED_CALLER_ID, test: { id: testId, sid: `SIM-${testId}`, status: 'queued', result: null } });

    expect(await sim('alice', { test: testId, action: 'ring' })).toEqual({ said: [], keypad: null, ended: false });
    expect((await phoneOf('alice'))!.test).toMatchObject({ status: 'ringing', result: null });

    const answered = await sim('alice', { test: testId, action: 'answer' });
    expect(answered.said.join(' ')).toMatch(/Test Constabulary.*1, 1, 1.*Key it in/);
    expect(answered).toMatchObject({ keypad: { attempt: 1, digits: 3 }, ended: false });
    expect((await phoneOf('alice'))!.test).toMatchObject({ status: 'in-progress' });

    const done = await sim('alice', { test: testId, action: 'keys', digits: '111', attempt: 1 });
    expect(done).toMatchObject({ keypad: null, ended: true });
    expect(done.said.join(' ')).toMatch(/ready/);
    await sim('alice', { test: testId, action: 'hang-up' });

    const phone = (await phoneOf('alice'))!;
    expect(phone).toMatchObject({ status: 'verified', failures: 0, reason: null, test: { result: 'passed', status: 'completed', errorCode: null } });
    expect(toMillis(phone.verifiedAt)).toBe(addMin(T0, 0.5).getTime());
  });

  it.each([
    ['declined', [['decline']], 'busy', /declined/],
    ['left ringing', [['no-answer']], 'no-answer', /Nobody answered/],
    ['hung up on with nothing keyed', [['answer'], ['hang-up']], 'no-digits', /Nothing/],
    ['answered with the wrong code', [['answer'], ['keys', '999']], 'wrong-code', /didn't match/],
  ] as const)('%s fails the line, the player’s to retry', async (_label, moves, result, reason) => {
    await setup();
    const testId = await testCall();
    await sim('alice', { test: testId, action: 'ring' });
    for (const [action, digits] of moves) await sim('alice', { test: testId, action, ...(digits ? { digits } : {}) });
    const phone = (await phoneOf('alice'))!;
    expect(phone).toMatchObject({ status: 'failed', test: { result } });
    expect(phone.reason).toMatch(reason);
    expect((await getData(db(), 'game/switchboard'))?.mode ?? 'phone').toBe('phone');
  });

  it('silence on the keypad is asked once more', async () => {
    await setup();
    const testId = await testCall();
    await sim('alice', { test: testId, action: 'answer' });
    const again = await sim('alice', { test: testId, action: 'keys', digits: '', attempt: 1 });
    expect(again).toMatchObject({ keypad: { attempt: 2, digits: 3 }, ended: false });
    expect(again.said.join(' ')).toMatch(/Once more.*1, 1, 1/);
    await sim('alice', { test: testId, action: 'keys', digits: '111', attempt: 2 });
    expect(await phoneOf('alice')).toMatchObject({ status: 'verified' });
  });
});

describe('a check-in, played in the app', () => {
  it('is asked and scored by the same rules as a real call', async () => {
    await setup();
    const id = await checkIn();
    expect((await getData(db(), `policeCalls/${id}`))!.phone).toMatchObject({ sid: `SIM-${id}`, status: 'queued' });
    expect((await phoneOf('alice'))!.callerId).toBe(SIMULATED_CALLER_ID);

    await sim('alice', { call: id, action: 'ring' });
    const asked = await sim('alice', { call: id, action: 'answer' });
    expect(asked.said.join(' ')).toMatch(/What's 2 times 2\?/);
    expect(asked).toMatchObject({ keypad: { attempt: 1, digits: null }, ended: false });
    const verdict = await sim('alice', { call: id, action: 'keys', digits: '4', attempt: 1 });
    expect(verdict.said.join(' ')).toMatch(/Correct/);
    expect(verdict.ended).toBe(true);
    expect(await getData(db(), `policeCalls/${id}`)).toMatchObject({ status: 'passed', answer: '4', phone: { result: 'answered' } });
    const police = (await ledgerFor(db(), 'alice')).filter((l) => String(l.reason).startsWith('police'));
    expect(police.map((l) => [l.reason, l.delta])).toEqual([['police-pass', 3]]);
    expect((await getPlayer(db(), 'alice')).points).toBe(-12);
  });

  it('declined is missed, with the fine, as a real call', async () => {
    await setup();
    const id = await checkIn();
    await sim('alice', { call: id, action: 'decline' });
    expect(await getData(db(), `policeCalls/${id}`)).toMatchObject({ status: 'missed', phone: { result: 'busy' } });
  });

  it('left alone in a closed app, the timer settles it as a call that never connected', async () => {
    await setup();
    const id = await checkIn();
    await runPolice(db(), addMin(T0, 2), constRng(0), PACK);
    expect(await getData(db(), `policeCalls/${id}`)).toMatchObject({ status: 'open', channel: 'app', phone: { result: 'never-connected', errorCode: 'no-status' } });
  });
});

describe('who may play which call', () => {
  it('only the player’s own calls, and only those on the simulated line', async () => {
    await setup();
    const testId = await testCall();
    await expectCode(sim('bob', { test: testId, action: 'answer' }), 'not-found');
    await expectCode(sim(null, { test: testId, action: 'answer' }), 'unauthenticated');
    await expectCode(sim('alice', { test: 'another', action: 'answer' }), 'not-found');
    await expectCode(sim('alice', { test: testId, action: 'pick-up' }), 'invalid-argument');
    await expectCode(sim('alice', { action: 'answer' }), 'invalid-argument');

    const id = await checkIn();
    await expectCode(sim('bob', { call: id, action: 'answer' }), 'not-found');
    await expectCode(sim('alice', { call: 'no/such', action: 'answer' }), 'invalid-argument');
  });

  it('never a call on a real line', async () => {
    await setup();
    const real: PhoneLine = {
      callerId: '+447700900000',
      placeCall: async () => ({ sid: 'CA1' }),
      health: async () => ({ ok: true, message: 'Active', balance: null, code: null }),
    };
    const testId = await testCall(real);
    await expectCode(sim('alice', { test: testId, action: 'answer' }), 'failed-precondition');
    expect((await phoneOf('alice'))!.test).toMatchObject({ sid: 'CA1', status: 'queued', result: null });
  });

  it('refuses in a pack without police', async () => {
    await setup();
    await expectCode(simulateCall(db(), as('alice', T0, testPack({ features: { police: false } })), { test: 'x', action: 'answer' }), 'failed-precondition');
  });
});

describe('a server with no phone line', () => {
  it('refuses a test call with the reason "not-set-up", for the app to carry on in the app', async () => {
    await setup();
    await setPoliceLine(db(), as('alice'), { number: '07700 900001' });
    expect(await phoneOf('alice')).toMatchObject({ callerId: null });
    const err = await testPoliceLine(db(), as('alice'), {}, null).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: 'failed-precondition', details: { reason: 'not-set-up' } });
  });
});

describe('the requests Twilio would send, and the replies as the app shows them', () => {
  it('maps each move to the webhook step and Twilio’s params', () => {
    expect(twilioRequestFor('ring', 'SIM-1')).toEqual({ step: 'status', params: { CallSid: 'SIM-1', CallStatus: 'ringing' } });
    expect(twilioRequestFor('answer', 'SIM-1')).toEqual({ step: 'voice', params: { CallSid: 'SIM-1', CallStatus: 'in-progress', AnsweredBy: 'human' } });
    expect(twilioRequestFor('keys', 'SIM-1', '42', 2)).toEqual({ step: 'gather', params: { CallSid: 'SIM-1', Digits: '42' }, try: '2' });
    expect(twilioRequestFor('decline', 'SIM-1').params.CallStatus).toBe('busy');
    expect(twilioRequestFor('no-answer', 'SIM-1').params.CallStatus).toBe('no-answer');
    expect(twilioRequestFor('hang-up', 'SIM-1').params.CallStatus).toBe('completed');
  });

  it('turns a reply into words, a keypad and the hang-up', () => {
    expect(turnOf([])).toEqual({ said: [], keypad: null, ended: false });
    expect(
      turnOf([
        { kind: 'gather', speech: [{ text: 'Your code is' }, { text: '1, 2, 3' }], next: { line: 'a', test: 't', step: 'gather', try: '2' }, timeoutSec: 8, numDigits: 3 },
      ]),
    ).toEqual({ said: ['Your code is', '1, 2, 3'], keypad: { attempt: 2, digits: 3 }, ended: false });
    expect(turnOf([{ kind: 'say', speech: { text: 'Goodbye.' } }, { kind: 'hangup' }])).toEqual({ said: ['Goodbye.'], keypad: null, ended: true });
  });
});
