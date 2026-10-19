// Police check-ins over Telegram (POLICE_LINE=telegram). The game's Telegram line is a PhoneLine whose calls are orders
// for the police script (services/telegram-police): it polls for them, rings the player on Telegram from the police's
// own account, and reports back through handleTelegramLine as the same requests Twilio sends handlePoliceVoice, so
// routing, the switchboard, test calls and scoring are the phone line's own. The answer comes as a reply in the police
// chat. Not picking up is missed with the full fine; picking up and then a wrong reply, or none, is a smaller fine
// (policeHeardPenalty). Edge cases 2-10 and 12 of the plan.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import type { PhoneLine } from '../src/game/phoneLine.js';
import { testPoliceLine } from '../src/game/phones.js';
import { answerPoliceCall, runPolice, stalledPhoneCode } from '../src/game/police.js';
import { dialPoliceCall, handlePoliceVoice } from '../src/game/policePhone.js';
import { resetGame } from '../src/game/reset.js';
import { handlePlayerWritten } from '../src/game/standing.js';
import {
  handleTelegramLine,
  LINE_REPLY_SEC,
  renderTelegram,
  TELEGRAM_LINES,
  telegramLine,
  type TelegramLineReply,
  type TelegramStep,
} from '../src/game/telegramLine.js';
import type { VoiceReply } from '../src/game/voice.js';
import type { GamePack } from '../src/shared/packs/types.js';
import { isTelegramSid, LINE_OFFLINE_MS, TELEGRAM_GIVE_UP_MS } from '../src/shared/phone.js';
import type { PhoneStatus, PoliceCallPhone, Settings, Switchboard } from '../src/shared/types.js';
import { addMin, allDocs, constRng, ctx, getData, ledgerFor, seedAdmin, seedGame, seedPlayer, T0, toMillis, ts, useEmulatorDb } from './helpers.js';
import { testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-telegram');

const PACK: GamePack = testPack({ features: { police: true } });
/** Phone calls on, lines at ±10, 5 min to answer: +3 for right, −4 for wrong or missed, −1 when picked up. */
const SETTINGS: Partial<Settings> = {
  confidantAbove: 10,
  poiBelow: -10,
  policeEveryMin: 30,
  policeTipEveryMin: 60,
  policeWindowMin: 5,
  policePassPoints: 3,
  policeFailPenalty: 4,
  policeHeardPenalty: 1,
  quietHours: null,
  policePhone: true,
  policeBreakerAt: 3,
  policeCallerName: 'Test Constabulary',
};
const PLAYERS = ['alice', 'bob', 'carol', 'dave'] as const;
const NUMBER: Record<string, string> = { alice: '+447700900001', bob: '+447700900002', carol: '+447700900003', dave: '+447700900004' };

async function setup(settings: Partial<Settings> = {}) {
  await seedGame(db(), { status: 'active', settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of PLAYERS) await seedPlayer(db(), uid);
}

/** A line on file for `uid` (verified unless said otherwise). */
async function line(uid: string, status: PhoneStatus = 'verified') {
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
    });
}

const as = (uid: string, now: Date = T0) => ctx(uid, now, constRng(0), undefined, PACK);
const tg = (now: Date = T0) => telegramLine(db(), () => now);
const op = (body: unknown, now: Date = addMin(T0, 0.5)) => handleTelegramLine(db(), now, PACK, body);
/** The police script's heartbeat. */
const beat = (now: Date = T0) => op({ op: 'heartbeat', account: { name: 'Test Constabulary', id: 42 } }, now);
const poll = (now: Date = addMin(T0, 0.1)) => op({ op: 'poll' }, now);

async function becomePoi(uid: string, now: Date = T0) {
  await db().doc(`players/${uid}`).update({ points: -15 });
  await handlePlayerWritten(db(), uid, now, constRng(0), PACK);
}

const calls = async () => (await allDocs(db(), 'policeCalls')).sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
const call = async (id: string) => (await getData(db(), `policeCalls/${id}`))!;
const orders = async () => (await allDocs(db(), 'lineOrders')).sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
const phoneOf = async (uid: string) => getData(db(), `phones/${uid}`);
const switchboard = async () => (await getData(db(), 'game/switchboard')) as Switchboard | undefined;
const policeLedger = async (uid: string) =>
  (await ledgerFor(db(), uid)).filter((l) => String(l.reason).startsWith('police')).map((l) => [l.reason, l.delta]);

/** The steps of an event's reply. */
function steps(reply: TelegramLineReply): TelegramStep[] {
  expect(reply).toHaveProperty('steps');
  return (reply as { steps: TelegramStep[] }).steps;
}
const asks = (s: TelegramStep[]) => s.flatMap((step) => ('ask' in step ? [step.ask] : []));
const lines = (s: TelegramStep[]) => s.flatMap((step) => ('say' in step ? [step.line] : []));

/** One event from the script about a call or a test: `query` is the order's, echoed back. */
const event = (sid: string, query: Record<string, string>, step: 'voice' | 'gather' | 'status', params: Record<string, string>, attempt?: string, now: Date = addMin(T0, 0.5)) =>
  op({ op: 'event', sid, query, step, ...(attempt ? { try: attempt } : {}), params }, now);

/** Alice, on watch with a verified line and the script running, her check-in handed to the Telegram line. */
async function ringingCall(uid = 'alice') {
  await line(uid);
  await beat();
  await becomePoi(uid);
  const [c] = (await calls()).filter((x) => x.uid === uid);
  await dialPoliceCall(db(), c!.id, T0, PACK, tg());
  const { phone, expected, question } = await call(c!.id);
  return { id: c!.id, sid: phone.sid as string, expected: expected as string, question: question as string };
}
/** Alice's call picked up: the reply to "in-progress". */
const pickUp = (c: { id: string; sid: string }) => event(c.sid, { call: c.id }, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
const reply = (c: { id: string; sid: string }, digits: string, attempt = '1') => event(c.sid, { call: c.id }, 'gather', { CallStatus: 'in-progress', Digits: digits }, attempt);

describe('the Telegram line and its orders', () => {
  it('hands a check-in for a verified line to the script as one new order, with a TG id and the E.164 number', async () => {
    await setup();
    const c = await ringingCall();
    expect(isTelegramSid(c.sid)).toBe(true);
    const all = await orders();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: 'call', to: NUMBER.alice, query: { call: c.id }, sid: c.sid, status: 'new' });
    expect(await call(c.id)).toMatchObject({ channel: 'phone', phone: { sid: c.sid } });
  });

  it('hands a test call over as a test order', async () => {
    await setup();
    await line('alice', 'unverified');
    await beat();
    const result = await testPoliceLine(db(), as('alice'), {}, tg());
    expect(result.ringing).toBe(true);
    const [order] = await orders();
    expect(order).toMatchObject({ kind: 'test', to: NUMBER.alice, query: { line: 'alice', test: result.testId }, status: 'new' });
    expect(isTelegramSid(order!.sid as string)).toBe(true);
  });

  it('poll claims up to five orders, oldest first, and never hands one out twice', async () => {
    await setup();
    for (let i = 0; i < 6; i++) {
      await db()
        .doc(`lineOrders/o${i}`)
        .set({ kind: 'call', to: NUMBER.alice, query: { call: `c${i}` }, sid: `TG-c${i}`, status: 'new', createdAt: ts(addMin(T0, -10 + i)) });
    }
    const first = (await poll()) as { orders: Array<{ id: string; sid: string; to: string; query: Record<string, string>; kind: string }> };
    expect(first.orders.map((o) => o.id)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4']);
    expect(first.orders[0]).toMatchObject({ kind: 'call', to: NUMBER.alice, query: { call: 'c0' }, sid: 'TG-c0' });
    expect((await orders()).filter((o) => o.status === 'taken').map((o) => o.id)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4']);
    expect(((await poll()) as { orders: Array<{ id: string }> }).orders.map((o) => o.id)).toEqual(['o5']);
    expect(((await poll()) as { orders: unknown[] }).orders).toEqual([]);
  });

  it('keeps the heartbeat in game/line, online within 90 s of it and offline after', async () => {
    await setup();
    expect(await beat(T0)).toEqual({ ok: true });
    const beatDoc = await getData(db(), 'game/line');
    expect(beatDoc).toMatchObject({ kind: 'telegram', account: { name: 'Test Constabulary', id: 42 } });
    expect(toMillis(beatDoc!.seenAt)).toBe(T0.getTime());
    const online = await tg(addMin(T0, 1)).health();
    expect(online.ok).toBe(true);
    expect(online.message).toContain('Test Constabulary');
    const offline = await tg(new Date(T0.getTime() + LINE_OFFLINE_MS + 1000)).health();
    expect(offline.ok).toBe(false);
  });

  it('with the script silent, the check-in goes to the app unfined and the lines go down at once', async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    const [c] = await calls();
    await dialPoliceCall(db(), c!.id, T0, PACK, tg());
    expect(await call(c!.id)).toMatchObject({ channel: 'app', fallbackReason: 'never-connected', phone: { errorCode: 'line-offline' } });
    expect(await policeLedger('alice')).toEqual([]);
    expect(await orders()).toEqual([]);
    expect((await switchboard())?.mode).toBe('app');
  });
});

describe('a check-in call on Telegram', () => {
  it('ringing is heard; picking up gives the intro, the question said, and an ask with the written question', async () => {
    await setup();
    const c = await ringingCall();
    await event(c.sid, { call: c.id }, 'status', { CallStatus: 'ringing' });
    expect((await call(c.id)).phone.heardAt).not.toBeNull();
    const s = steps(await pickUp(c));
    const [ask] = asks(s);
    expect(ask).toBeDefined();
    expect(ask!.message).toContain(c.question);
    expect(ask!.replySec).toBe(LINE_REPLY_SEC);
    expect(ask!.next).toMatchObject({ call: c.id, step: 'gather', try: '1' });
    expect(ask!.say.join(' ')).toContain('Test Constabulary');
    expect(ask!.say[ask!.say.length - 1]).toBe(TELEGRAM_LINES['key-in']);
    expect(TELEGRAM_LINES['key-in']).toMatch(/reply/i);
    expect(TELEGRAM_LINES['key-in']).not.toMatch(/hash|key in/i);
  });

  it('a right reply passes with the pass points', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    const s = steps(await reply(c, c.expected));
    expect(lines(s)).toContain('pass');
    expect(await call(c.id)).toMatchObject({ status: 'passed', answer: c.expected });
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
  });

  it('a reply with spaces and punctuation round the number still counts', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    await reply(c, ` ${c.expected}!`);
    expect((await call(c.id)).status).toBe('passed');
  });

  it('a wrong reply fails with the smaller fine', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    const wrong = String(Number(c.expected) + 1);
    expect(lines(steps(await reply(c, wrong)))).toContain('fail');
    expect((await call(c.id)).status).toBe('failed');
    expect(await policeLedger('alice')).toEqual([['police-fail', -1]]);
  });

  it('no reply asks once more, then is missed with the smaller fine', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    const again = steps(await reply(c, '', '1'));
    const [ask] = asks(again);
    expect(ask!.say).toContain(TELEGRAM_LINES.again);
    expect(ask!.next).toMatchObject({ call: c.id, step: 'gather', try: '2' });
    expect((await call(c.id)).status).toBe('open');
    expect(lines(steps(await reply(c, '', '2')))).toContain('no-answer');
    expect((await call(c.id)).status).toBe('missed');
    expect(await policeLedger('alice')).toEqual([['police-missed', -1]]);
  });

  it.each([
    ['no-answer', 'rang out'],
    ['busy', 'declined'],
  ])('not picked up (%s: %s) is missed with the full fine, counting against neither the line nor the switchboard', async (status) => {
    await setup();
    const c = await ringingCall();
    await event(c.sid, { call: c.id }, 'status', { CallStatus: status });
    expect((await call(c.id)).status).toBe('missed');
    expect(await policeLedger('alice')).toEqual([['police-missed', -4]]);
    expect((await phoneOf('alice'))!.failures).toBe(0);
    expect((await switchboard())?.streak ?? 0).toBe(0);
  });

  it('charges the smaller fine in force when the call opened', async () => {
    await setup();
    const c = await ringingCall();
    expect((await call(c.id)).heardPenalty).toBe(1);
    await db().doc('game/settings').update({ policeHeardPenalty: 3 });
    await pickUp(c);
    await reply(c, String(Number(c.expected) + 1));
    expect(await policeLedger('alice')).toEqual([['police-fail', -1]]);
  });

  it('a Twilio call keeps the full fine for a wrong answer', async () => {
    await setup();
    await line('alice');
    await becomePoi('alice');
    const [c] = await calls();
    const twilio: PhoneLine = {
      callerId: '+447700900000',
      async placeCall() {
        return { sid: 'CA1' };
      },
      async health() {
        return { ok: true, message: 'Active', balance: null, code: null };
      },
    };
    await dialPoliceCall(db(), c!.id, T0, PACK, twilio);
    const { expected } = await call(c!.id);
    const voice = (query: Record<string, string>, params: Record<string, string>) => handlePoliceVoice(db(), addMin(T0, 0.5), PACK, { query, params: { CallSid: 'CA1', ...params } });
    await voice({ call: c!.id, step: 'voice' }, { CallStatus: 'in-progress', AnsweredBy: 'human' });
    await voice({ call: c!.id, step: 'gather', try: '1' }, { Digits: String(Number(expected) + 1) });
    expect(await policeLedger('alice')).toEqual([['police-fail', -4]]);
  });
});

describe('Telegram calls that never connect', () => {
  it("someone not on Telegram, or whose privacy blocks the call: the app, unfined, counting against their line (paused after two)", async () => {
    await setup();
    const c = await ringingCall();
    await event(c.sid, { call: c.id }, 'status', { CallStatus: 'failed', ErrorCode: 'tg-not-found' });
    expect(await call(c.id)).toMatchObject({ channel: 'app', fallbackReason: 'never-connected', phone: { errorCode: 'tg-not-found' } });
    expect(await policeLedger('alice')).toEqual([]);
    expect((await phoneOf('alice'))!.failures).toBe(1);
    // She answers it in the app (else the timer would rightly fine the lapsed app check-in below).
    await answerPoliceCall(db(), as('alice', addMin(T0, 1)), { callId: c.id, answer: c.expected });

    // The next watch call, half an hour on, with the script still running.
    const later = addMin(T0, 31);
    await beat(later);
    await runPolice(db(), later, constRng(0), PACK);
    const next = (await calls()).find((x) => x.id !== c.id)!;
    await dialPoliceCall(db(), next.id, later, PACK, tg(later));
    const sid = (await call(next.id)).phone.sid as string;
    await event(sid, { call: next.id }, 'status', { CallStatus: 'failed', ErrorCode: 'tg-privacy' }, undefined, addMin(later, 0.5));
    expect(await phoneOf('alice')).toMatchObject({ status: 'paused', failures: 2 });
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
  });

  it("a fault in the script itself sends the check-in to the app without counting against the player's line", async () => {
    await setup();
    const c = await ringingCall();
    await event(c.sid, { call: c.id }, 'status', { CallStatus: 'failed', ErrorCode: 'tg-error' });
    expect((await call(c.id)).channel).toBe('app');
    expect((await phoneOf('alice'))!.failures).toBe(0);
    expect(await policeLedger('alice')).toEqual([]);
  });
});

describe('a Telegram call with no result', () => {
  const phone = (sid: string): PoliceCallPhone => ({
    sid,
    status: 'in-progress',
    result: null,
    errorCode: null,
    placedAt: ts(T0),
    heardAt: ts(T0),
    trial: false,
  });

  it('waits five minutes for the replies, where a Twilio call gives up at three', () => {
    expect(TELEGRAM_GIVE_UP_MS).toBe(5 * 60_000);
    expect(stalledPhoneCode(phone('TG-c1'), addMin(T0, 3).getTime())).toBeNull();
    expect(stalledPhoneCode(phone('TG-c1'), addMin(T0, 5).getTime())).toBe('no-result');
    expect(stalledPhoneCode(phone('CA1'), addMin(T0, 3).getTime())).toBe('no-result');
  });

  it('the timer sends a Telegram call still waiting after five minutes to the app, unfined', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    await runPolice(db(), addMin(T0, 4), constRng(0), PACK);
    expect((await call(c.id)).channel).toBe('phone');
    await runPolice(db(), addMin(T0, 5.1), constRng(0), PACK);
    expect(await call(c.id)).toMatchObject({ channel: 'app', status: 'open', phone: { errorCode: 'no-result' } });
    expect(await policeLedger('alice')).toEqual([]);
  });
});

describe('the test call on Telegram', () => {
  async function ringTest() {
    await setup();
    await line('alice', 'unverified');
    await beat();
    const { testId } = await testPoliceLine(db(), as('alice'), {}, tg());
    const [order] = await orders();
    const code = (await phoneOf('alice'))!.test.code as string;
    return { testId, sid: order!.sid as string, query: order!.query as Record<string, string>, code };
  }

  it('says the code on the call, never writes it in the chat, and a right reply verifies the line', async () => {
    const t = await ringTest();
    const [ask] = asks(steps(await event(t.sid, t.query, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' })));
    expect(ask!.say.join(' ')).toContain(t.code.split('').join(', '));
    expect(ask!.say[ask!.say.length - 1]).toBe(TELEGRAM_LINES['test-key-in']);
    expect(ask!.message).not.toContain(t.code);
    expect(ask!.message).toMatch(/code/i);
    const done = steps(await event(t.sid, t.query, 'gather', { CallStatus: 'in-progress', Digits: t.code }, '1'));
    expect(lines(done)).toContain('test-pass');
    expect(await phoneOf('alice')).toMatchObject({ status: 'verified', test: { result: 'passed' } });
  });

  it('a wrong code fails the test', async () => {
    const t = await ringTest();
    await event(t.sid, t.query, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' });
    const wrong = t.code === '111' ? '222' : '111';
    await event(t.sid, t.query, 'gather', { CallStatus: 'in-progress', Digits: wrong }, '1');
    expect(await phoneOf('alice')).toMatchObject({ status: 'failed', test: { result: 'wrong-code' } });
  });
});

describe('late and stray events', () => {
  it('a reply after the check-in moved to the app hears that it moved, and changes nothing', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    await runPolice(db(), addMin(T0, 5.1), constRng(0), PACK);
    const s = steps(await reply(c, c.expected, '1'));
    expect(lines(s)).toContain('moved');
    expect(await call(c.id)).toMatchObject({ channel: 'app', status: 'open' });
    expect(await policeLedger('alice')).toEqual([]);
  });

  it('a settled call repeats its verdict without scoring again', async () => {
    await setup();
    const c = await ringingCall();
    await pickUp(c);
    await reply(c, c.expected);
    expect(lines(steps(await reply(c, c.expected)))).toContain('pass');
    expect(await policeLedger('alice')).toEqual([['police-pass', 3]]);
  });

  it("an event with another call's id hangs up and changes nothing", async () => {
    await setup();
    const c = await ringingCall();
    const s = steps(await event('TG-someone-else', { call: c.id }, 'voice', { CallStatus: 'in-progress', AnsweredBy: 'human' }));
    expect(s).toEqual([{ hangup: true }]);
    expect((await call(c.id)).phone.heardAt ?? null).toBeNull();
  });

  it('refuses an unknown op, an event on a non-Telegram id, and a malformed event', async () => {
    await setup();
    const c = await ringingCall();
    await expect(op({ op: 'dance' })).rejects.toMatchObject({ status: 400 });
    await expect(op('poll')).rejects.toMatchObject({ status: 400 });
    await expect(event('CA1', { call: c.id }, 'voice', { CallStatus: 'in-progress' })).rejects.toMatchObject({ status: 400 });
    await expect(op({ op: 'event', sid: c.sid, query: { call: c.id }, step: 'dance', params: {} })).rejects.toMatchObject({ status: 400 });
    await expect(op({ op: 'event', sid: c.sid, query: 'call', step: 'voice', params: {} })).rejects.toMatchObject({ status: 400 });
    expect((await call(c.id)).status).toBe('open');
  });
});

describe('rendering a reply for Telegram', () => {
  const gather = (speech: Array<{ text: string; line?: string }>, next: Record<string, string>): VoiceReply =>
    [{ kind: 'gather', speech: speech as never, next, timeoutSec: 8 }] as VoiceReply;

  it('swaps the keypad lines for replies in the chat and keeps the pack’s own lines', () => {
    const steps = renderTelegram(
      gather(
        [
          { text: 'Evening, Alice. Test Constabulary here.', line: 'intro-watch' },
          { text: "What's seven times eight?" },
          { text: 'Key in your answer, then press hash.', line: 'key-in' },
        ],
        { call: 'c1', step: 'gather', try: '1' },
      ),
      { kind: 'call', question: "What's 7 × 8?" },
    );
    expect(steps).toEqual([
      {
        ask: {
          say: ['Evening, Alice. Test Constabulary here.', "What's seven times eight?", TELEGRAM_LINES['key-in']],
          message: expect.stringContaining("What's 7 × 8?"),
          replySec: LINE_REPLY_SEC,
          next: { call: 'c1', step: 'gather', try: '1' },
        },
      },
    ]);
  });

  it('says "again" and the test line the Telegram way, keeps plain lines and the hang-up', () => {
    const reply: VoiceReply = [
      { kind: 'say', speech: { text: 'Correct. Goodbye.', line: 'pass' } },
      { kind: 'hangup' },
    ] as VoiceReply;
    expect(renderTelegram(reply, { kind: 'call', question: 'Q' })).toEqual([{ say: 'Correct. Goodbye.', line: 'pass' }, { hangup: true }]);
    const again = renderTelegram(gather([{ text: 'Once more.', line: 'again' }], { call: 'c1', step: 'gather', try: '2' }), { kind: 'call', question: 'Q?' });
    expect(asks(again)[0]!.say).toEqual([TELEGRAM_LINES.again]);
    expect(TELEGRAM_LINES.again).toMatch(/reply/i);
    const test = renderTelegram(
      gather(
        [
          { text: 'Testing your line. Your code is', line: 'test-intro' },
          { text: '4, 8, 2' },
          { text: 'Key it in now.', line: 'test-key-in' },
        ],
        { line: 'alice', test: 't1', step: 'gather', try: '1' },
      ),
      { kind: 'test' },
    );
    const ask = asks(test)[0]!;
    expect(ask.say).toEqual(['Testing your line. Your code is', '4, 8, 2', TELEGRAM_LINES['test-key-in']]);
    expect(TELEGRAM_LINES['test-key-in']).toMatch(/reply|chat/i);
    expect(ask.message).not.toMatch(/4\D*8\D*2/);
  });
});

describe('the line across a reset and the end of the game', () => {
  it('a reset deletes the orders and the heartbeat', async () => {
    await setup();
    await ringingCall();
    await resetGame(db(), as('gm'), { confirm: 'RESET' });
    expect(await orders()).toEqual([]);
    expect(await getData(db(), 'game/line')).toBeUndefined();
  });

  it('ending the game deletes the orders and calls off the open check-in', async () => {
    await setup();
    const c = await ringingCall();
    await endGame(db(), as('gm', addMin(T0, 1)), { venues: [] });
    expect(await orders()).toEqual([]);
    expect((await call(c.id)).status).toBe('cancelled');
  });
});
