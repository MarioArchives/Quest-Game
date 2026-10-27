// Police check-ins by phone (Twilio), packs with police and settings.policePhone on. A check-in rings the player's
// verified line; the voice webhook asks the question and scores the keypad answer by the same rules as the app. Never
// connected is the system's fault: the check-in goes back to the app with a fresh window and no fine, and counts
// towards the game-wide switchboard (three in a row to two players, or one account error, send everyone to the app; a
// health check puts it on probation and a trial call that connects restores it) and the player's line (two in a row
// pause it). No answer is the player's: missed, with the fine. A fake PhoneLine stands in for Twilio.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { PhoneLineError, type LineHealth, type PhoneLine, type PlaceCall } from '../src/game/phoneLine.js';
import { runSwitchboard, setPoliceLine, setSwitchboard, testPoliceLine } from '../src/game/phones.js';
import { answerPoliceCall, runPolice, tipOffPolice } from '../src/game/police.js';
import { dialPoliceCall, handlePoliceVoice } from '../src/game/policePhone.js';
import { pushFor } from '../src/game/push.js';
import { resetGame } from '../src/game/reset.js';
import { handlePlayerWritten } from '../src/game/standing.js';
import type { VoiceReply } from '../src/game/voice.js';
import type { GamePack } from '../src/shared/packs/types.js';
import type { PhoneStatus, Settings, Switchboard } from '../src/shared/types.js';
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
  seedAdmin,
  seedGame,
  seedPlayer,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-phone');

const PACK: GamePack = testPack({ features: { police: true } });
/** The police test's numbers, with phone calls on: lines at ±10, 5 min to answer, +3 / −2, a breaker at 3. */
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
const PLAYERS = ['alice', 'bob', 'carol', 'dave'] as const;
const NUMBER: Record<string, string> = {
  alice: '+447700900001',
  bob: '+447700900002',
  carol: '+447700900003',
  dave: '+447700900004',
  gm: '+447700900009',
};

/** Twilio, faked: records every call it is asked to place, refuses with `refuse`, reports `healthy`. */
interface FakeLine extends PhoneLine {
  placed: PlaceCall[];
  refuse: string | null;
  healthy: LineHealth;
  healthChecks: number;
}
function fakeLine(refuse: string | null = null): FakeLine {
  let n = 0;
  const line: FakeLine = {
    callerId: '+447700900000',
    placed: [],
    refuse,
    healthy: { ok: true, message: 'Active', balance: '10.00 USD', code: null },
    healthChecks: 0,
    async placeCall(call) {
      if (line.refuse) throw new PhoneLineError(line.refuse, `Refused (${line.refuse})`);
      line.placed.push(call);
      n += 1;
      return { sid: `CA${n}` };
    },
    async health() {
      line.healthChecks += 1;
      return line.healthy;
    },
  };
  return line;
}

async function setup(settings: Partial<Settings> = {}, status: 'active' | 'paused' | 'lobby' | 'ended' = 'active') {
  await seedGame(db(), { status, settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of PLAYERS) await seedPlayer(db(), uid);
}

/** A line on file for `uid` (verified unless said otherwise). */
async function line(uid: string, status: PhoneStatus = 'verified', extra: Record<string, unknown> = {}) {
  await db()
    .doc(`phones/${uid}`)
    .set({
      number: NUMBER[uid],
      status,
      verifiedAt: status === 'verified' ? ts(addMin(T0, -60)) : null,
      failures: 0,
      reason: null,
      callerId: null,
      test: null,
      updatedAt: ts(addMin(T0, -60)),
      ...extra,
    });
}

const as = (uid: string | null, now: Date = T0, pack: GamePack = PACK) => ctx(uid, now, constRng(0), undefined, pack);
const trigger = (uid: string, now: Date = T0) => handlePlayerWritten(db(), uid, now, constRng(0), PACK);
async function becomePoi(uid: string, now: Date = T0) {
  await db().doc(`players/${uid}`).update({ points: -15 });
  await trigger(uid, now);
}
const tick = (now: Date, pack: GamePack = PACK) => runPolice(db(), now, constRng(0), pack);
const dial = (id: string, fake: PhoneLine | null, now: Date = T0, pack: GamePack = PACK) => dialPoliceCall(db(), id, now, pack, fake);
const voice = (query: Record<string, string>, params: Record<string, string> = {}, now: Date = addMin(T0, 0.5), pack: GamePack = PACK) =>
  handlePoliceVoice(db(), now, pack, { query, params });
/** Twilio's status callback for a check-in call (its sid read from the call). */
async function status(id: string, callStatus: string, extra: Record<string, string> = {}, now: Date = addMin(T0, 0.5)) {
  const sid = ((await getData(db(), `policeCalls/${id}`))?.phone?.sid as string | null | undefined) ?? 'CA-unknown';
  return voice({ call: id, step: 'status' }, { CallSid: sid, CallStatus: callStatus, ...extra }, now);
}
async function answerCall(id: string, step: 'voice' | 'gather', extra: Record<string, string> = {}, attempt = '1', now: Date = addMin(T0, 0.5)) {
  const sid = ((await getData(db(), `policeCalls/${id}`))?.phone?.sid as string | null | undefined) ?? 'CA-unknown';
  return voice({ call: id, step, ...(step === 'gather' ? { try: attempt } : {}) }, { CallSid: sid, ...extra }, now);
}

const calls = async () => (await allDocs(db(), 'policeCalls')).sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
const callsFor = async (uid: string) => (await calls()).filter((c) => c.uid === uid);
const call = async (id: string) => (await getData(db(), `policeCalls/${id}`))!;
const phoneOf = async (uid: string) => getData(db(), `phones/${uid}`);
const switchboard = async () => (await getData(db(), 'game/switchboard')) as Switchboard | undefined;
const policeLedger = async (uid: string) =>
  (await ledgerFor(db(), uid)).filter((l) => String(l.reason).startsWith('police')).map((l) => [l.reason, l.delta]);
const said = (reply: VoiceReply): string =>
  reply.map((s) => (s.kind === 'say' ? s.speech.text : s.kind === 'gather' ? s.speech.map((x) => x.text).join(' ') : '[hangup]')).join(' | ');

/** Alice, on watch with a verified line, her check-in dialled. */
async function ringingCall(fake: FakeLine = fakeLine(), uid = 'alice') {
  await line(uid);
  await becomePoi(uid);
  const [c] = await callsFor(uid);
  await dial(c!.id, fake);
  return c!.id;
}

describe('which check-ins ring', () => {
  it('a person of interest with a verified line gets a phone call, without the question in the feed', async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    const [c] = await calls();
    expect(c).toMatchObject({ uid: 'alice', kind: 'watch', status: 'open', channel: 'phone', fallbackReason: null });
    expect(c!.phone).toMatchObject({ sid: null, status: 'pending', result: null, errorCode: null, heardAt: null, trial: false });
    expect(toMillis(c!.phone.placedAt)).toBe(T0.getTime());
    const [post] = await feedOf(db(), 'police-call');
    expect(post!.text).toMatch(/ringing/);
    expect(post!.text).not.toContain(c!.question);
  });

  it.each(['unverified', 'failed', 'paused', 'app-only'] as const)('a %s line, or none, means the app ("no-line")', async (lineStatus) => {
    await setup();
    await line('alice', lineStatus);
    await becomePoi('alice');
    await becomePoi('bob');
    for (const c of await calls()) expect(c).toMatchObject({ channel: 'app', fallbackReason: 'no-line', phone: null });
  });

  it('with phone calls off, check-ins are in the app as before, with no reason given', async () => {
    await setup({ policePhone: false });
    await line('alice');
    await becomePoi('alice');
    expect((await calls())[0]).toMatchObject({ channel: 'app', fallbackReason: null, phone: null });
    expect((await feedOf(db(), 'police-call'))[0]!.text).toMatch(/What's/);
  });

  it('the timer and a tip-off ring too', async () => {
    await setup();
    await line('alice');
    await line('carol');
    await becomePoi('alice');
    const [first] = await calls();
    await db().doc(`policeCalls/${first!.id}`).update({ status: 'passed' });
    const res = await tick(addMin(T0, 30));
    expect((await call(res.opened[0]!)).channel).toBe('phone');

    await db().doc('players/bob').update({ points: 15 });
    const { callId } = await tipOffPolice(db(), as('bob', addMin(T0, 31)), { targetUid: 'carol', note: 'Shifty' });
    expect(await call(callId)).toMatchObject({ kind: 'tip', channel: 'phone' });
    expect((await feedOf(db(), 'police-tip'))[0]!.text).toMatch(/ringing/);
  });
});

describe('dialling (the onPoliceCallCreated trigger)', () => {
  it('rings the line once, however often the trigger fires, and keeps the call id', async () => {
    await setup();
    const fake = fakeLine();
    const id = await ringingCall(fake);
    expect(await dial(id, fake)).toBe('skipped');
    expect(fake.placed).toEqual([{ to: NUMBER.alice, query: { call: id } }]);
    expect((await call(id)).phone).toMatchObject({ sid: 'CA1', status: 'queued' });
    expect((await phoneOf('alice'))!.callerId).toBe('+447700900000');
  });

  it('leaves app check-ins alone', async () => {
    await setup();
    await becomePoi('alice');
    const fake = fakeLine();
    expect(await dial((await calls())[0]!.id, fake)).toBe('skipped');
    expect(fake.placed).toEqual([]);
  });

  it("a line removed before it is dialled sends the check-in to the app, nobody's fault", async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    await db().doc('phones/alice').delete();
    const [c] = await calls();
    const fake = fakeLine();
    expect(await dial(c!.id, fake)).toBe('skipped');
    expect(fake.placed).toEqual([]);
    expect(await call(c!.id)).toMatchObject({ status: 'open', channel: 'app', fallbackReason: 'no-line' });
    expect((await switchboard())?.streak ?? 0).toBe(0);
  });

  it('a player who left before it was dialled has it called off, with no fine', async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    await db().doc('players/alice').update({ left: 'frozen' });
    const [c] = await calls();
    expect(await dial(c!.id, fakeLine())).toBe('skipped');
    expect((await call(c!.id)).status).toBe('cancelled');
    expect(await policeLedger('alice')).toEqual([]);
  });
});

describe('what Twilio says, mapped (never connected is the system’s, no answer is the player’s)', () => {
  it('ringing is noted and the call stays open', async () => {
    await setup();
    const id = await ringingCall();
    await status(id, 'initiated');
    await status(id, 'ringing');
    const c = await call(id);
    expect(c).toMatchObject({ status: 'open', channel: 'phone' });
    expect(c.phone).toMatchObject({ status: 'ringing', result: null });
    expect(toMillis(c.phone.heardAt)).toBe(addMin(T0, 0.5).getTime());
  });

  it.each([
    ['no-answer', {}, 'no-answer'],
    ['busy', {}, 'busy'],
    ['completed', {}, 'no-digits'],
    ['completed', { AnsweredBy: 'machine_start' }, 'voicemail'],
  ] as const)('%s %o is the player’s: missed, with the fine', async (callStatus, extra, result) => {
    await setup();
    const id = await ringingCall();
    await status(id, 'ringing');
    await status(id, callStatus, extra, addMin(T0, 1));
    expect(await call(id)).toMatchObject({ status: 'missed', channel: 'phone', phone: { result, status: callStatus } });
    expect(await policeLedger('alice')).toEqual([['police-missed', -2]]);
    expect((await feedOf(db(), 'police-result'))[0]).toMatchObject({ uid: 'alice', points: -2 });
  });

  it.each(['failed', 'canceled'])('%s never connected: back to the app with a fresh window and no fine', async (callStatus) => {
    await setup();
    const id = await ringingCall();
    await status(id, callStatus, { ErrorCode: '13224' }, addMin(T0, 1));
    const c = await call(id);
    expect(c).toMatchObject({ status: 'open', channel: 'app', fallbackReason: 'never-connected' });
    expect(c.phone).toMatchObject({ result: 'never-connected', errorCode: '13224', status: callStatus });
    expect(toMillis(c.endsAt)).toBe(addMin(T0, 6).getTime());
    expect(toMillis(c.resentAt)).toBe(addMin(T0, 1).getTime());
    expect(await policeLedger('alice')).toEqual([]);
    const posts = await feedOf(db(), 'police-call');
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({ uid: 'alice', ref: id });
    expect(posts[1]!.text).toContain(c.question);
    expect((await phoneOf('alice'))!.failures).toBe(1);
  });

  it('Twilio refusing the call at once is never connected too', async () => {
    await setup();
    const id = await ringingCall(fakeLine('13224'));
    expect(await call(id)).toMatchObject({ status: 'open', channel: 'app', fallbackReason: 'never-connected', phone: { errorCode: '13224' } });
    expect(await policeLedger('alice')).toEqual([]);
  });

  it("a server with no phone line sends it to the app and trips the switchboard (phone calls aren't set up)", async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    const [c] = await calls();
    expect(await dial(c!.id, null)).toBe('refused');
    expect(await call(c!.id)).toMatchObject({ channel: 'app', fallbackReason: 'never-connected', phone: { errorCode: 'not-set-up' } });
    expect(await switchboard()).toMatchObject({ mode: 'app', manual: false, lastError: { code: 'not-set-up' } });
    expect((await phoneOf('alice'))!.failures).toBe(0);
  });

  it('the timer re-sends a call Twilio has said nothing about for 90 s, and one with no result after 3 min', async () => {
    await setup();
    const quiet = await ringingCall();
    expect((await tick(addMin(T0, 1))).resent).toEqual([]);
    const res = await tick(addMin(T0, 1.5));
    expect(res.resent).toEqual([quiet]);
    expect(await call(quiet)).toMatchObject({ channel: 'app', fallbackReason: 'never-connected', phone: { errorCode: 'no-status' } });
    expect((await phoneOf('alice'))!.failures).toBe(0);

    await line('carol');
    await becomePoi('carol', addMin(T0, 2));
    const [heard] = await callsFor('carol');
    await dial(heard!.id, fakeLine(), addMin(T0, 2));
    await status(heard!.id, 'ringing', {}, addMin(T0, 2.2));
    expect((await tick(addMin(T0, 4.9))).resent).toEqual([]);
    expect((await tick(addMin(T0, 5))).resent).toEqual([heard!.id]);
    expect((await call(heard!.id)).phone.errorCode).toBe('no-result');
  });

  it('a ringing call is never marked missed by the app window', async () => {
    await setup({ policeWindowMin: 1 });
    const id = await ringingCall();
    await status(id, 'ringing');
    expect((await tick(addMin(T0, 2))).missed).toEqual([]);
    expect((await call(id)).status).toBe('open');
  });

  it('a re-sent check-in is answered in the app, or missed there with the fine as today', async () => {
    await setup();
    const id = await ringingCall();
    await expectCode(answerPoliceCall(db(), as('alice', addMin(T0, 0.5)), { callId: id, answer: '4' }), 'failed-precondition');
    await status(id, 'failed', {}, addMin(T0, 1));
    const c = await call(id);
    expect(await answerPoliceCall(db(), as('alice', addMin(T0, 2)), { callId: id, answer: c.expected })).toEqual({ status: 'passed', points: 3 });

    await line('carol');
    await becomePoi('carol', addMin(T0, 3));
    const [k] = await callsFor('carol');
    await dial(k!.id, fakeLine(), addMin(T0, 3));
    await status(k!.id, 'failed', {}, addMin(T0, 4));
    expect((await tick(addMin(T0, 8.9))).missed).toEqual([]);
    expect((await tick(addMin(T0, 9))).missed).toEqual([k!.id]);
    expect(await policeLedger('carol')).toEqual([['police-missed', -2]]);
  });

  it('callbacks for another call id are ignored', async () => {
    await setup();
    const id = await ringingCall();
    await voice({ call: id, step: 'status' }, { CallSid: 'CA-other', CallStatus: 'failed' });
    expect((await call(id)).channel).toBe('phone');
  });
});

// Plan "Police that sound official, a question bank, …", edge cases 3 and 4.
describe('the order of a call', () => {
  type Gather = Extract<VoiceReply[number], { kind: 'gather' }>;
  const linesOf = (reply: VoiceReply) => (reply[0] as Gather).speech.map((s) => s.line ?? null);

  it('a watch call: the intro, the purpose, the question, then key-in', async () => {
    await setup();
    const id = await ringingCall();
    const reply = await answerCall(id, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(linesOf(reply)).toEqual(['intro-watch', 'purpose', 'ask', 'key-in']);
    expect(said(reply)).toMatch(/Just a quick check\. What's 2 times 2\?/);
  });

  it('a tip-off: the intro, the accusation, the purpose, the question', async () => {
    await setup();
    await line('carol');
    await db().doc('players/bob').update({ points: 15 });
    const { callId } = await tipOffPolice(db(), as('bob', T0), { targetUid: 'carol', note: 'hogging the jukebox' });
    await dial(callId, fakeLine());
    const reply = await answerCall(callId, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(linesOf(reply)).toEqual(['intro-tip', null, 'purpose', 'ask', 'key-in']);
    expect((reply[0] as Gather).speech[1]!.text).toMatch(/hogging the jukebox/);
  });

  it('a tip-off with no note on file says no accusation', async () => {
    await setup();
    await line('carol');
    await db().doc('players/bob').update({ points: 15 });
    const { callId } = await tipOffPolice(db(), as('bob', T0), { targetUid: 'carol', note: 'x' });
    await db().doc(`policeCalls/${callId}`).update({ note: null });
    await dial(callId, fakeLine());
    const reply = await answerCall(callId, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(linesOf(reply)).toEqual(['intro-tip', 'purpose', 'ask', 'key-in']);
  });

  it('asking again after silence: "again" and the question, without the intro, the accusation or the purpose', async () => {
    await setup();
    const id = await ringingCall();
    await answerCall(id, 'voice');
    const again = await answerCall(id, 'gather', { Digits: '' });
    expect(linesOf(again)).toEqual(['again', 'ask', 'key-in']);
  });

  it('a multiple-choice question on the keypad: the options said, one digit, no key-in; the right digit passes', async () => {
    const QUIZ: GamePack = testPack({ features: { police: true }, policeQuiz: [{ kind: 'fixed', ask: 'Who was the victim?', answer: 'Bob', decoys: ['Rob', 'Bill'] }] });
    await setup();
    await line('alice');
    await db().doc('players/alice').update({ points: -15 });
    await handlePlayerWritten(db(), 'alice', T0, constRng(0), QUIZ);
    const [c] = await callsFor('alice');
    expect(c!.options).toHaveLength(3);
    expect(c!.options).toContain('Bob');
    await dial(c!.id, fakeLine(), T0, QUIZ);
    const sid = (await call(c!.id)).phone.sid as string;
    const reply = await voice({ call: c!.id, step: 'voice' }, { CallSid: sid, CallStatus: 'in-progress', AnsweredBy: 'human' }, addMin(T0, 0.5), QUIZ);
    const gather = reply[0] as Gather;
    expect(gather.numDigits).toBe(1);
    expect(linesOf(reply)).not.toContain('key-in');
    expect(said(reply)).toMatch(/Who was the victim\? Press 1 for \w+, 2 for \w+, or 3 for \w+\./);
    const right = String(c!.options.indexOf('Bob') + 1);
    const done = await voice({ call: c!.id, step: 'gather', try: '1' }, { CallSid: sid, Digits: right }, addMin(T0, 1), QUIZ);
    expect(said(done)).toMatch(/Correct/);
    expect(await call(c!.id)).toMatchObject({ status: 'passed', answer: right });
  });
});

describe('a tip-off read out (the accusation)', () => {
  /** Bob (a confidant) tips off the police about Carol, whose line is verified; the call is dialled. */
  async function tipCall(note: string) {
    await setup();
    await line('carol');
    await db().doc('players/bob').update({ points: 15 });
    const { callId } = await tipOffPolice(db(), as('bob', T0), { targetUid: 'carol', note });
    await dial(callId, fakeLine());
    return callId;
  }

  it('after the tip-off intro the police say what the tipper accused them of, then ask the question', async () => {
    const id = await tipCall('Being a silly patotie');
    const reply = await answerCall(id, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(said(reply)).toMatch(/tip-off about you, Carol\. You have been accused of being a silly patotie\. Just a quick check\. What's/);
    const gather = reply[0] as Extract<VoiceReply[number], { kind: 'gather' }>;
    expect(gather.speech[0]!.line).toBe('intro-tip');
    expect(gather.speech[1]).toEqual({ text: 'You have been accused of being a silly patotie.' });
  });

  it('asking again after silence does not repeat it', async () => {
    const id = await tipCall('Being a silly patotie');
    await answerCall(id, 'voice');
    const again = await answerCall(id, 'gather', { Digits: '' });
    expect(said(again)).not.toMatch(/accused/);
  });

  it('a check-in that is not a tip-off accuses nobody', async () => {
    await setup();
    const id = await ringingCall();
    const reply = await answerCall(id, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(said(reply)).not.toMatch(/accused/);
  });
});

describe('the voice webhook asks and scores', () => {
  it('answered: the intro and the question, gathered on the keypad', async () => {
    await setup();
    const id = await ringingCall();
    const reply = await answerCall(id, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    expect(reply).toHaveLength(1);
    const gather = reply[0]!;
    expect(gather).toMatchObject({ kind: 'gather', next: { call: id, step: 'gather', try: '1' } });
    expect(said(reply)).toMatch(/Test Constabulary/);
    expect(said(reply)).toMatch(/Alice/);
    expect(said(reply)).toMatch(/What's 2 times 2\?/);
    expect((await call(id)).phone).toMatchObject({ status: 'in-progress' });
  });

  it('a right answer passes (+passPoints), a wrong one fails (−failPenalty), by the same rules as the app', async () => {
    await setup();
    const id = await ringingCall();
    await answerCall(id, 'voice');
    const reply = await answerCall(id, 'gather', { Digits: '4' });
    expect(said(reply)).toMatch(/Correct/);
    expect(reply.at(-1)).toEqual({ kind: 'hangup' });
    expect(await call(id)).toMatchObject({ status: 'passed', answer: '4', phone: { result: 'answered' } });
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
    expect((await getPlayer(db(), 'alice')).points).toBe(-12);

    await line('carol');
    await becomePoi('carol');
    const [k] = await callsFor('carol');
    await dial(k!.id, fakeLine());
    await answerCall(k!.id, 'voice');
    await answerCall(k!.id, 'gather', { Digits: '5' });
    expect(await call(k!.id)).toMatchObject({ status: 'failed', answer: '5' });
    expect(await policeLedger('carol')).toEqual([['police-fail', -2]]);
  });

  it('silence: asked once more, then missed with the fine', async () => {
    await setup();
    const id = await ringingCall();
    await answerCall(id, 'voice');
    const again = await answerCall(id, 'gather', { Digits: '' }, '1');
    expect(again[0]).toMatchObject({ kind: 'gather', next: { call: id, step: 'gather', try: '2' } });
    expect((await call(id)).status).toBe('open');
    const last = await answerCall(id, 'gather', { Digits: '' }, '2');
    expect(said(last)).toMatch(/miss/);
    expect(await call(id)).toMatchObject({ status: 'missed', phone: { result: 'no-digits' } });
    expect(await policeLedger('alice')).toEqual([['police-missed', -2]]);
  });

  it('voicemail is hung up on and counts as missed', async () => {
    await setup();
    const id = await ringingCall();
    expect(await answerCall(id, 'voice', { AnsweredBy: 'machine_end_beep' })).toEqual([{ kind: 'hangup' }]);
    expect(await call(id)).toMatchObject({ status: 'missed', phone: { result: 'voicemail' } });
  });

  it('is idempotent: Twilio retrying the answer or the status scores nothing twice', async () => {
    await setup();
    const id = await ringingCall();
    await answerCall(id, 'voice');
    await answerCall(id, 'gather', { Digits: '4' });
    const retry = await answerCall(id, 'gather', { Digits: '4' });
    expect(said(retry)).toMatch(/Correct/);
    await status(id, 'completed', {}, addMin(T0, 1));
    await status(id, 'completed', {}, addMin(T0, 1));
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
    expect(await feedOf(db(), 'police-result')).toHaveLength(1);
    expect(await call(id)).toMatchObject({ status: 'passed', phone: { status: 'completed', result: 'answered' } });

    await line('carol');
    await becomePoi('carol');
    const [k] = await callsFor('carol');
    await dial(k!.id, fakeLine());
    await status(k!.id, 'failed');
    await status(k!.id, 'failed');
    expect(await feedOf(db(), 'police-call')).toHaveLength(3);
    expect((await switchboard())!.streak).toBe(1);
  });

  it('a call re-sent to the app, or called off, is closed politely on the phone', async () => {
    await setup();
    const id = await ringingCall();
    await status(id, 'failed');
    expect(said(await answerCall(id, 'voice'))).toMatch(/app/);
    await db().doc(`policeCalls/${id}`).update({ status: 'cancelled' });
    expect(said(await answerCall(id, 'voice'))).toMatch(/closed/);
    expect(await answerCall('no-such-call', 'voice')).toEqual([{ kind: 'hangup' }]);
  });

  it('a player who leaves while it rings has it called off, with no fine', async () => {
    await setup();
    const id = await ringingCall();
    await db().doc('players/alice').update({ left: 'out' });
    await status(id, 'no-answer');
    expect((await call(id)).status).toBe('cancelled');
    expect(await policeLedger('alice')).toEqual([]);
  });
});

describe('the switchboard', () => {
  /** Rings carol, dave and alice (each with a line) and lets each call fail. */
  async function threeFail(code = '13224') {
    for (const uid of ['alice', 'carol', 'dave']) {
      await line(uid);
      await becomePoi(uid);
    }
    for (const c of await calls()) {
      await dial(c.id, fakeLine());
      await status(c.id, 'failed', { ErrorCode: code });
    }
  }

  it('three calls in a row that never connect, to at least two players, send everyone to the app', async () => {
    await setup();
    await threeFail();
    const sb = await switchboard();
    expect(sb).toMatchObject({ mode: 'app', manual: false, streak: 3, lastError: { code: '13224' } });
    expect([...sb!.streakUids].sort()).toEqual(['alice', 'carol', 'dave']);
    const posts = await feedOf(db(), 'police-line');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.text).toMatch(/down/);
    expect(pushFor(posts[0] as never, null, PACK)).toMatchObject({ to: 'gms', message: { title: 'Switchboard' } });

    await line('bob');
    await becomePoi('bob');
    expect((await callsFor('bob'))[0]).toMatchObject({ channel: 'app', fallbackReason: 'lines-down' });
  });

  it('a call that gets through in between starts the count again', async () => {
    await setup();
    for (const uid of ['alice', 'carol', 'dave']) {
      await line(uid);
      await becomePoi(uid);
    }
    const [a, c, d] = await calls();
    for (const x of [a, c, d]) await dial(x!.id, fakeLine());
    await status(a!.id, 'failed');
    await status(c!.id, 'failed');
    await status(d!.id, 'ringing');
    expect(await switchboard()).toMatchObject({ mode: 'phone', streak: 0 });
  });

  it('an account error (20003) trips it at once, and never counts against the line', async () => {
    await setup();
    const id = await ringingCall(fakeLine('20003'));
    expect(await switchboard()).toMatchObject({ mode: 'app', lastError: { code: '20003' } });
    expect((await call(id)).fallbackReason).toBe('never-connected');
    expect((await phoneOf('alice'))!.failures).toBe(0);
  });

  it("two calls in a row that never connect to one player pause their line (the app until they test it again)", async () => {
    await setup();
    await db().doc('players/bob').update({ points: 15 });
    const id = await ringingCall();
    await status(id, 'failed');
    expect((await phoneOf('alice'))!).toMatchObject({ status: 'verified', failures: 1 });
    await answerPoliceCall(db(), as('alice', addMin(T0, 1)), { callId: id, answer: (await call(id)).expected });
    const { callId } = await tipOffPolice(db(), as('bob', addMin(T0, 2)), { targetUid: 'alice', note: 'Again' });
    await dial(callId, fakeLine(), addMin(T0, 2));
    await status(callId, 'failed', {}, addMin(T0, 2.5));
    expect((await phoneOf('alice'))!).toMatchObject({ status: 'paused', failures: 2 });
    expect((await phoneOf('alice'))!.reason).toMatch(/twice/);
    expect(await switchboard()).toMatchObject({ mode: 'phone', streak: 2 });
  });

  it('the health check every 15 min puts a tripped switchboard on probation; the trial call that connects restores it', async () => {
    await setup();
    await db().doc('game/switchboard').set({ mode: 'app', manual: false, streak: 3, streakUids: ['x', 'y'], trialCallId: null, since: ts(T0), lastError: null, health: null });
    const fake = fakeLine();
    expect(await runSwitchboard(db(), T0, PACK, fake)).toEqual({ tests: [], probation: true });
    expect(await switchboard()).toMatchObject({ mode: 'probation', health: { ok: true, balance: '10.00 USD' } });

    await line('alice');
    await line('carol');
    await becomePoi('alice');
    await becomePoi('carol');
    const [trial] = await callsFor('alice');
    expect(trial).toMatchObject({ channel: 'phone', phone: { trial: true } });
    expect((await callsFor('carol'))[0]).toMatchObject({ channel: 'app', fallbackReason: 'lines-down' });
    expect((await switchboard())!.trialCallId).toBe(trial!.id);

    await dial(trial!.id, fake);
    await status(trial!.id, 'ringing');
    expect(await switchboard()).toMatchObject({ mode: 'phone', trialCallId: null, streak: 0 });
    const posts = await feedOf(db(), 'police-line');
    expect(posts.map((p) => p.text)).toEqual([expect.stringMatching(/back/)]);
  });

  it('a trial that never connects trips it again; the check waits 15 min and leaves a GM’s switch alone', async () => {
    await setup();
    await db().doc('game/switchboard').set({ mode: 'probation', manual: false, streak: 0, streakUids: [], trialCallId: null, since: ts(T0), lastError: null, health: { ok: true, message: 'Active', balance: null, at: ts(T0) } });
    const fake = fakeLine();
    const id = await ringingCall(fake);
    await status(id, 'failed');
    expect(await switchboard()).toMatchObject({ mode: 'app', trialCallId: null });

    await runSwitchboard(db(), addMin(T0, 10), PACK, fake);
    expect(fake.healthChecks).toBe(0);
    await runSwitchboard(db(), addMin(T0, 15), PACK, fake);
    expect(fake.healthChecks).toBe(1);

    await db().doc('game/switchboard').update({ mode: 'app', manual: true, health: null });
    await runSwitchboard(db(), addMin(T0, 40), PACK, fake);
    expect(fake.healthChecks).toBe(1);
    expect((await switchboard())!.mode).toBe('app');
  });

  it('an unhealthy account stays in the app, with the error noted', async () => {
    await setup();
    await db().doc('game/switchboard').set({ mode: 'app', manual: false, streak: 3, streakUids: [], trialCallId: null, since: ts(T0), lastError: null, health: null });
    const fake = fakeLine();
    fake.healthy = { ok: false, message: 'Twilio error 20003: Authenticate', balance: null, code: '20003' };
    expect((await runSwitchboard(db(), T0, PACK, fake)).probation).toBe(false);
    expect(await switchboard()).toMatchObject({ mode: 'app', health: { ok: false }, lastError: { code: '20003' } });
  });

  it('the GM restores the lines, sends everyone to the app by hand, or checks the account', async () => {
    await setup();
    const fake = fakeLine();
    await expectCode(setSwitchboard(db(), as('alice'), { action: 'app' }, fake), 'permission-denied');
    await expectCode(setSwitchboard(db(), as('gm'), { action: 'nope' }, fake), 'invalid-argument');
    expect(await setSwitchboard(db(), as('gm'), { action: 'app' }, fake)).toMatchObject({ mode: 'app' });
    expect(await switchboard()).toMatchObject({ mode: 'app', manual: true });
    const down = await feedOf(db(), 'police-line');
    expect(down[0]).toMatchObject({ actorUid: 'gm' });
    expect(pushFor(down[0] as never, null, PACK)).toMatchObject({ to: 'gms', exclude: 'gm' });

    expect((await setSwitchboard(db(), as('gm', addMin(T0, 1)), { action: 'check' }, fake)).health).toMatchObject({ ok: true, message: 'Active' });
    await expectCode(setSwitchboard(db(), as('gm'), { action: 'check' }, null), 'failed-precondition');

    await db().doc('game/switchboard').update({ streak: 4 });
    expect(await setSwitchboard(db(), as('gm', addMin(T0, 2)), { action: 'restore' }, fake)).toMatchObject({ mode: 'phone' });
    expect(await switchboard()).toMatchObject({ mode: 'phone', manual: false, streak: 0 });
    expect((await feedOf(db(), 'police-line')).map((p) => p.text)).toEqual([expect.stringMatching(/down/), expect.stringMatching(/back/)]);
  });
});

describe('a player’s line: add it, test it, choose the app', () => {
  it('saves a national number as E.164, unverified; removes it; refuses nonsense', async () => {
    await setup();
    expect(await setPoliceLine(db(), as('alice'), { number: '07700 900123' })).toEqual({ status: 'unverified' });
    expect(await phoneOf('alice')).toMatchObject({ number: '+447700900123', status: 'unverified', failures: 0, test: null });
    await expectCode(setPoliceLine(db(), as('alice'), { number: 'call me maybe' }), 'invalid-argument');
    await expectCode(setPoliceLine(db(), as('alice'), { number: 7700 }), 'invalid-argument');
    expect(await setPoliceLine(db(), as('alice'), { number: null })).toEqual({ status: null });
    expect(await phoneOf('alice')).toBeUndefined();
  });

  it('a new number notes the phone line’s caller ID, for the contact card before any test call', async () => {
    await setup();
    await setPoliceLine(db(), as('alice'), { number: '07700 900001' }, fakeLine());
    expect(await phoneOf('alice')).toMatchObject({ callerId: '+447700900000', status: 'unverified', test: null });
    // No phone line here (the mock, the emulators): what was known stays.
    await setPoliceLine(db(), as('alice'), { number: '07700 900011' });
    expect(await phoneOf('alice')).toMatchObject({ number: '+447700900011', callerId: '+447700900000' });
    await setPoliceLine(db(), as('bob'), { number: '07700 900002' });
    expect(await phoneOf('bob')).toMatchObject({ callerId: null });
  });

  it('app only, and back: a line that was verified stays verified, otherwise it needs a test', async () => {
    await setup();
    await expectCode(setPoliceLine(db(), as('alice'), { appOnly: true }), 'failed-precondition');
    await line('alice');
    expect(await setPoliceLine(db(), as('alice'), { appOnly: true })).toEqual({ status: 'app-only' });
    expect(await setPoliceLine(db(), as('alice'), { appOnly: false })).toEqual({ status: 'verified' });
    await line('bob', 'unverified');
    await setPoliceLine(db(), as('bob'), { appOnly: true });
    expect(await setPoliceLine(db(), as('bob'), { appOnly: false })).toEqual({ status: 'unverified' });
    await expectCode(setPoliceLine(db(), as('bob'), { appOnly: 'yes' }), 'invalid-argument');
  });

  it('only players still in the game, and GMs, keep a line', async () => {
    await setup();
    await expectCode(setPoliceLine(db(), as('stranger'), { number: '07700 900123' }), 'permission-denied');
    await expectCode(setPoliceLine(db(), as(null), { number: '07700 900123' }), 'unauthenticated');
    await db().doc('players/carol').update({ left: 'frozen' });
    await expectCode(setPoliceLine(db(), as('carol'), { number: '07700 900123' }), 'permission-denied');
    expect(await setPoliceLine(db(), as('gm'), { number: '+44 7700 900009' })).toEqual({ status: 'unverified' });
  });

  it('a test call reads a code out; keying it back verifies the line', async () => {
    await setup();
    await setPoliceLine(db(), as('alice'), { number: '07700 900001' });
    const fake = fakeLine();
    const { testId, ringing } = await testPoliceLine(db(), as('alice'), {}, fake);
    expect(ringing).toBe(true);
    expect(fake.placed).toEqual([{ to: NUMBER.alice, query: { line: 'alice', test: testId } }]);
    expect((await phoneOf('alice'))!).toMatchObject({ callerId: '+447700900000', test: { id: testId, code: '111', sid: 'CA1', result: null } });

    const reply = await voice({ line: 'alice', test: testId, step: 'voice' }, { CallSid: 'CA1', CallStatus: 'in-progress' });
    expect(reply[0]).toMatchObject({ kind: 'gather', numDigits: 3, next: { line: 'alice', test: testId, step: 'gather', try: '1' } });
    expect(said(reply)).toMatch(/1, 1, 1/);
    const done = await voice({ line: 'alice', test: testId, step: 'gather', try: '1' }, { CallSid: 'CA1', Digits: '111' });
    expect(said(done)).toMatch(/ready/);
    const phone = (await phoneOf('alice'))!;
    expect(phone).toMatchObject({ status: 'verified', failures: 0, reason: null, test: { result: 'passed' } });
    expect(toMillis(phone.verifiedAt)).toBe(addMin(T0, 0.5).getTime());
  });

  it.each([
    ['the wrong code', [['gather', '1', '999']], 'wrong-code', /didn't match/],
    ['nothing keyed, twice', [['gather', '1', ''], ['gather', '2', '']], 'no-digits', /Nothing/],
  ] as const)('%s fails the line', async (_label, steps, result, reason) => {
    await setup();
    await line('alice', 'unverified');
    const { testId } = await testPoliceLine(db(), as('alice'), {}, fakeLine());
    await voice({ line: 'alice', test: testId, step: 'voice' }, { CallSid: 'CA1' });
    for (const [step, attempt, Digits] of steps) await voice({ line: 'alice', test: testId, step, try: attempt }, { CallSid: 'CA1', Digits });
    const phone = (await phoneOf('alice'))!;
    expect(phone).toMatchObject({ status: 'failed', test: { result } });
    expect(phone.reason).toMatch(reason);
  });

  it.each([
    ['no-answer', 'no-answer'],
    ['busy', 'busy'],
    ['failed', 'never-connected'],
  ] as const)('a test call that ends %s fails the line', async (callStatus, result) => {
    await setup();
    await line('alice', 'unverified');
    const { testId } = await testPoliceLine(db(), as('alice'), {}, fakeLine());
    await voice({ line: 'alice', test: testId, step: 'status' }, { CallSid: 'CA1', CallStatus: callStatus });
    expect(await phoneOf('alice')).toMatchObject({ status: 'failed', test: { result } });
    expect((await switchboard())?.mode ?? 'phone').toBe('phone');
  });

  it('a refused test fails that number only, unless the account itself is broken', async () => {
    await setup();
    await line('alice', 'unverified');
    expect(await testPoliceLine(db(), as('alice'), {}, fakeLine('21215'))).toMatchObject({ ringing: false, message: expect.stringMatching(/geo/) });
    expect(await phoneOf('alice')).toMatchObject({ status: 'failed', test: { result: 'never-connected', errorCode: '21215' } });
    expect((await switchboard())?.mode ?? 'phone').toBe('phone');

    await line('bob', 'unverified');
    await testPoliceLine(db(), as('bob'), {}, fakeLine('20003'));
    expect(await switchboard()).toMatchObject({ mode: 'app', lastError: { code: '20003' } });
  });

  it('refuses a test with phone calls off, no number, the lines down, no phone line, or one already ringing', async () => {
    await setup({ policePhone: false });
    await line('alice', 'unverified');
    await expectCode(testPoliceLine(db(), as('alice'), {}, fakeLine()), 'failed-precondition');
    await db().doc('game/settings').update({ policePhone: true });
    await expectCode(testPoliceLine(db(), as('bob'), {}, fakeLine()), 'failed-precondition');
    await expectCode(testPoliceLine(db(), as('alice'), {}, null), 'failed-precondition');
    await testPoliceLine(db(), as('alice'), {}, fakeLine());
    await expectCode(testPoliceLine(db(), as('alice', addMin(T0, 1)), {}, fakeLine()), 'failed-precondition');
    await db().doc('game/switchboard').set({ mode: 'app', manual: true, streak: 0, streakUids: [], trialCallId: null, since: null, lastError: null, health: null });
    await line('carol', 'unverified');
    await expectCode(testPoliceLine(db(), as('carol'), {}, fakeLine()), 'failed-precondition');
  });

  it('the GM tests their own phone any time, even with the lines down and phone calls off', async () => {
    await setup({ policePhone: false });
    await db().doc('game/switchboard').set({ mode: 'app', manual: true, streak: 0, streakUids: [], trialCallId: null, since: null, lastError: null, health: null });
    await setPoliceLine(db(), as('gm'), { number: NUMBER.gm! });
    const fake = fakeLine();
    const { testId } = await testPoliceLine(db(), as('gm'), {}, fake);
    expect(fake.placed[0]).toEqual({ to: NUMBER.gm, query: { line: 'gm', test: testId } });
    await voice({ line: 'gm', test: testId, step: 'gather', try: '1' }, { CallSid: 'CA1', Digits: '111' });
    expect(await phoneOf('gm')).toMatchObject({ status: 'verified' });
    expect((await switchboard())!.mode).toBe('app');
  });

  it('the timer gives up on a test call Twilio never reported, and stale webhook requests are ignored', async () => {
    await setup();
    await line('alice', 'unverified');
    const { testId } = await testPoliceLine(db(), as('alice'), {}, fakeLine());
    expect((await runSwitchboard(db(), addMin(T0, 1), PACK, null)).tests).toEqual([]);
    expect((await runSwitchboard(db(), addMin(T0, 1.5), PACK, null)).tests).toEqual(['alice']);
    expect(await phoneOf('alice')).toMatchObject({ status: 'failed', test: { result: 'never-connected', errorCode: 'no-status' } });
    expect(await voice({ line: 'alice', test: testId, step: 'voice' }, { CallSid: 'CA1' })).toEqual([{ kind: 'hangup' }]);
    expect(await voice({ line: 'alice', test: 'old-test', step: 'voice' }, { CallSid: 'CA1' })).toEqual([{ kind: 'hangup' }]);
  });
});

describe('cleanup, and packs without police', () => {
  it('a reset wipes the lines and the switchboard', async () => {
    await setup();
    await line('alice');
    await db().doc('game/switchboard').set({ mode: 'app', manual: true });
    await resetGame(db(), as('gm'), { confirm: 'RESET' });
    expect(await allDocs(db(), 'phones')).toEqual([]);
    expect(await switchboard()).toBeUndefined();
  });

  it('ending the game calls off a ringing call with no fine and deletes every number', async () => {
    await setup();
    const id = await ringingCall();
    await endGame(db(), as('gm', addMin(T0, 1)), { venues: [] });
    expect((await call(id)).status).toBe('cancelled');
    expect(await allDocs(db(), 'phones')).toEqual([]);
    expect(said(await answerCall(id, 'gather', { Digits: '4' }, '1', addMin(T0, 2)))).toMatch(/closed/);
    expect(await policeLedger('alice')).toEqual([]);
    await expectCode(setPoliceLine(db(), as('alice', addMin(T0, 2)), { number: '07700 900001' }), 'failed-precondition');
  });

  it('the timer calls off the trial call of a player who left, so the next one can be the trial', async () => {
    await setup();
    await db().doc('game/switchboard').set({ mode: 'probation', manual: false, streak: 0, streakUids: [], trialCallId: null, since: null, lastError: null, health: null });
    const id = await ringingCall();
    expect((await switchboard())!.trialCallId).toBe(id);
    await db().doc('players/alice').update({ left: 'frozen' });
    expect((await tick(addMin(T0, 1))).cancelled).toEqual([id]);
    expect((await switchboard())!.trialCallId).toBeNull();
  });

  it('in a pack without police nothing rings and the callables refuse', async () => {
    await setup();
    await line('alice');
    const pack = lancaster();
    await expectCode(setPoliceLine(db(), as('alice', T0, pack), { number: '07700 900001' }), 'failed-precondition');
    await expectCode(testPoliceLine(db(), as('alice', T0, pack), {}, fakeLine()), 'failed-precondition');
    await expectCode(setSwitchboard(db(), as('gm', T0, pack), { action: 'restore' }, fakeLine()), 'failed-precondition');
    expect(await voice({ call: 'x', step: 'voice' }, {}, T0, pack)).toEqual([{ kind: 'hangup' }]);
    expect(await voice({ call: 'x', step: 'status' }, {}, T0, pack)).toEqual([]);
    expect(await dialPoliceCall(db(), 'x', T0, pack, fakeLine())).toBe('skipped');
    expect(await runSwitchboard(db(), T0, pack, fakeLine())).toEqual({ tests: [], probation: false });
  });
});
