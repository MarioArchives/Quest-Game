// Police lines (packs with police, phone calls on): a player's number (phones/{uid}) and the test call that verifies
// it, and the GM's switchboard (game/switchboard): the 15-minute health check while the lines are down, and the GM's
// own restore and switch. A test call reads out a short code that the player keys back, which proves the number, the
// caller ID, the account and the webhook in one go. Check-in calls by phone are in ./policePhone.ts.
import { termForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import {
  answeredByMachine,
  callStatusMeaning,
  describeTestResult,
  HEALTH_EVERY_MS,
  normalisePhone,
  PHONE_GIVE_UP_MS,
  PHONE_SILENT_MS,
  spokenDigits,
  TEST_CODE_LENGTH,
} from '../shared/phone.js';
import type { DocRef, Txn } from '../shared/store/types.js';
import type { PhoneTest, PhoneTestResult, Player, PlayerPhone, Settings, Switchboard } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, isGM, loadSettings, loadState, requireGM, requireUid } from './guards.js';
import { PhoneLineError, type PhoneLine } from './phoneLine.js';
import { flushLines, loadSwitchboard, noteOutcome, readLineBook, SWITCHBOARD_PATH, type LineBook } from './policeLines.js';
import { millis, toTs } from './util.js';
import { voiceScript, type VoiceReply } from './voice.js';

/** Seconds a caller has to key the code (or an answer) in. */
export const GATHER_TIMEOUT_SEC = 8;
/** A new test call waits this long after the last one started. */
const TEST_GAP_MS = 30_000;

const policeOff = (pack: GamePack) => `${termForms(pack.terms).policeCall.Many} are not part of this game.`;

/** The caller may keep a line: a player still in the game, or a GM (who tests the switchboard on their own phone). */
async function requireLineOwner(db: Db, ctx: Ctx, tx: Txn): Promise<{ uid: string; gm: boolean }> {
  const uid = requireUid(ctx);
  const playerSnap = await tx.get(db.doc(`players/${uid}`));
  const gm = await isGM(db, uid, tx);
  const player = playerSnap.data() as Player | undefined;
  if (player && !player.left) return { uid, gm };
  if (gm) return { uid, gm };
  if (player) fail('permission-denied', `The ${termForms(ctx.pack.terms).gm.one} has marked you as having left the game.`);
  return fail('permission-denied', 'Only players can do that.');
}

/**
 * Callable: save my number (E.164, or a national number in the pack's country) as an unverified line, remove it
 * (`number: null`), or choose the app (`appOnly: true`) or the phone again (`appOnly: false`). A new number notes the
 * phone line's caller ID, so the app can offer the police's contact card before the first test call.
 */
export async function setPoliceLine(
  db: Db,
  ctx: Ctx,
  data: { number?: unknown; appOnly?: unknown },
  phoneLine: PhoneLine | null = null,
): Promise<{ status: PlayerPhone['status'] | null }> {
  if (!ctx.pack.features.police) fail('failed-precondition', policeOff(ctx.pack));
  return db.runTransaction(async (tx) => {
    const { uid } = await requireLineOwner(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const ref = db.doc(`phones/${uid}`);
    const line = (await tx.get(ref)).data() as PlayerPhone | undefined;
    const now = toTs(ctx.now);

    if (data.number !== undefined) {
      if (data.number === null) {
        tx.delete(ref);
        return { status: null };
      }
      const number = normalisePhone(data.number, ctx.pack.locale);
      if (!number) fail('invalid-argument', "That doesn't look like a mobile number. Try it with the country code, like +44 7700 900123.");
      // The same verified number again changes nothing.
      if (line && line.number === number && line.status === 'verified') return { status: line.status };
      const fresh: PlayerPhone = { number, status: 'unverified', verifiedAt: null, failures: 0, reason: null, callerId: phoneLine?.callerId || line?.callerId || null, test: null, updatedAt: now };
      tx.set(ref, fresh);
      return { status: fresh.status };
    }
    if (typeof data.appOnly !== 'boolean') fail('invalid-argument', 'Send a number, or appOnly true or false.');
    if (!line) fail('failed-precondition', 'Add a number first.');
    // Back to the phone: a line that was verified stays so; anything else needs a test call.
    const status = data.appOnly ? 'app-only' : line.verifiedAt ? 'verified' : 'unverified';
    tx.update(ref, { status, failures: 0, reason: null, updatedAt: now });
    return { status };
  });
}

/** A fresh test code: TEST_CODE_LENGTH digits from 1 to 9. */
function testCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < TEST_CODE_LENGTH; i++) code += String(1 + Math.floor(rng() * 9));
  return code;
}

/**
 * Callable: ring my own line with a test call that reads out a code to key back. Players need phone calls on and the
 * lines up; a GM may test their own phone any time (that is how they check the switchboard before restoring it).
 */
export async function testPoliceLine(db: Db, ctx: Ctx, _data: unknown, line: PhoneLine | null): Promise<{ testId: string; ringing: boolean; message: string | null }> {
  if (!ctx.pack.features.police) fail('failed-precondition', policeOff(ctx.pack));
  const claim = await db.runTransaction(async (tx) => {
    const { uid, gm } = await requireLineOwner(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const settings = await loadSettings(db, tx);
    if (!settings.policePhone && !gm) fail('failed-precondition', 'Phone calls are off in this game.');
    const ref = db.doc(`phones/${uid}`);
    const phone = (await tx.get(ref)).data() as PlayerPhone | undefined;
    if (!phone) fail('failed-precondition', 'Add a number first.');
    const switchboard = await loadSwitchboard(db, tx);
    if (switchboard.mode === 'app' && !gm) fail('failed-precondition', "The phone lines are down. Test your line once they're back.");
    // `reason` lets the app tell this apart from a refusal worth retrying: no phone line here, so the app it is.
    if (!line) fail('failed-precondition', "Phone calls aren't set up on this server yet.", { reason: 'not-set-up' });
    const test = phone.test;
    if (test && ctx.now.getTime() - millis(test.startedAt) < (test.result === null ? PHONE_GIVE_UP_MS : TEST_GAP_MS)) {
      fail('failed-precondition', test.result === null ? 'A test call is already on its way.' : 'Give it a moment before trying again.');
    }
    const next: PhoneTest = {
      id: db.collection('phones').doc().id,
      code: testCode(ctx.rng ?? Math.random),
      sid: null,
      status: 'dialling',
      result: null,
      errorCode: null,
      startedAt: toTs(ctx.now),
      heardAt: null,
    };
    tx.update(ref, { test: next, callerId: line.callerId || null, updatedAt: toTs(ctx.now) });
    return { uid, number: phone.number, testId: next.id };
  });

  try {
    const { sid } = await line!.placeCall({ to: claim.number, query: { line: claim.uid, test: claim.testId } });
    await withTest(db, ctx.now, ctx.pack, claim.uid, claim.testId, ({ tx, ref, test }) => {
      if (test.sid === null) tx.update(ref, { test: { ...test, sid, status: test.status === 'dialling' ? 'queued' : test.status } });
    });
    return { testId: claim.testId, ringing: true, message: null };
  } catch (err) {
    const code = err instanceof PhoneLineError ? err.code : 'network';
    await withTest(db, ctx.now, ctx.pack, claim.uid, claim.testId, (w) => finishTest(w, 'never-connected', code, false));
    return { testId: claim.testId, ringing: false, message: describeTestResult('never-connected', code) };
  }
}

/** One transaction on a test call: the line, its test (only while it is the latest), the settings and the switchboard. */
interface TestTx {
  tx: Txn;
  ref: DocRef;
  line: PlayerPhone;
  test: PhoneTest;
  uid: string;
  settings: Settings;
  book: LineBook;
  now: Date;
}

async function withTest<R>(db: Db, now: Date, pack: GamePack, uid: string, testId: string, fn: (w: TestTx) => R): Promise<R | null> {
  const t = termForms(pack.terms);
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`phones/${uid}`);
    const line = (await tx.get(ref)).data() as PlayerPhone | undefined;
    if (!line?.test || line.test.id !== testId) return null;
    const settings = await loadSettings(db, tx);
    const book = await readLineBook(tx, db, settings, [], true);
    const out = fn({ tx, ref, line, test: line.test, uid, settings, book, now });
    flushLines(tx, db, now, t, book);
    return out;
  });
}

/**
 * Settles a test call: 'passed' verifies the line; anything else fails it, with the reason. Counts towards the
 * switchboard (only an account error trips it from a test). Writes only.
 */
function finishTest(w: TestTx, result: PhoneTestResult, code: string | null, connected: boolean, more: Partial<PhoneTest> = {}): void {
  const test: PhoneTest = { ...w.test, ...more, result, errorCode: code ?? w.test.errorCode };
  const at = toTs(w.now);
  const patch: Partial<PlayerPhone> =
    result === 'passed'
      ? { status: 'verified', verifiedAt: at, failures: 0, reason: null }
      : { status: 'failed', reason: describeTestResult(result, code) };
  w.tx.update(w.ref, { ...patch, test, updatedAt: at });
  noteOutcome(w.book, w.now, w.settings.policeBreakerAt, { kind: 'test', connected, uid: w.uid, callId: null, code });
}

/** True when Twilio's request is about another call than the one this test placed. */
const otherCall = (test: PhoneTest, sid: string | undefined) => Boolean(test.sid && sid && test.sid !== sid);

/** The test call was answered: read the code out and gather it (voicemail just hangs up). */
export async function testVoice(db: Db, now: Date, pack: GamePack, uid: string, testId: string, params: Record<string, string>): Promise<VoiceReply> {
  const hangup: VoiceReply = [{ kind: 'hangup' }];
  const reply = await withTest(db, now, pack, uid, testId, (w): VoiceReply => {
    if (w.test.result !== null || otherCall(w.test, params.CallSid)) return hangup;
    const heard: Partial<PhoneTest> = { sid: w.test.sid ?? params.CallSid ?? null, status: 'in-progress', heardAt: toTs(now) };
    if (answeredByMachine(params.AnsweredBy)) {
      finishTest(w, 'voicemail', null, true, heard);
      return hangup;
    }
    w.tx.update(w.ref, { test: { ...w.test, ...heard } });
    noteOutcome(w.book, now, w.settings.policeBreakerAt, { kind: 'test', connected: true, uid, callId: null, code: null });
    const say = voiceScript(pack, w.settings);
    return [
      {
        kind: 'gather',
        speech: [say('test-intro'), { text: spokenDigits(w.test.code) }, say('test-key-in')],
        next: { line: uid, test: testId, step: 'gather', try: '1' },
        timeoutSec: GATHER_TIMEOUT_SEC,
        numDigits: w.test.code.length,
      },
    ];
  });
  return reply ?? hangup;
}

/** The digits keyed on a test call (or none: ask once more, then give up). */
export async function testGather(
  db: Db,
  now: Date,
  pack: GamePack,
  uid: string,
  testId: string,
  params: Record<string, string>,
  attempt: number,
): Promise<VoiceReply> {
  const hangup: VoiceReply = [{ kind: 'hangup' }];
  const digits = (params.Digits ?? '').replace(/\D/g, '');
  const reply = await withTest(db, now, pack, uid, testId, (w): VoiceReply => {
    const say = voiceScript(pack, w.settings);
    if (otherCall(w.test, params.CallSid)) return hangup;
    // Twilio asking again after it was settled gets the same verdict.
    if (w.test.result === 'passed') return [{ kind: 'say', speech: say('test-pass') }, { kind: 'hangup' }];
    if (w.test.result !== null) return [{ kind: 'say', speech: say('test-fail') }, { kind: 'hangup' }];
    const heard: Partial<PhoneTest> = { heardAt: toTs(now), sid: w.test.sid ?? params.CallSid ?? null };
    if (digits === '' && attempt < 2) {
      w.tx.update(w.ref, { test: { ...w.test, ...heard } });
      return [
        {
          kind: 'gather',
          speech: [say('test-again'), { text: spokenDigits(w.test.code) }, say('test-key-in')],
          next: { line: uid, test: testId, step: 'gather', try: String(attempt + 1) },
          timeoutSec: GATHER_TIMEOUT_SEC,
          numDigits: w.test.code.length,
        },
      ];
    }
    const result: PhoneTestResult = digits === '' ? 'no-digits' : digits === w.test.code ? 'passed' : 'wrong-code';
    finishTest(w, result, null, true, heard);
    return [{ kind: 'say', speech: say(result === 'passed' ? 'test-pass' : 'test-fail') }, { kind: 'hangup' }];
  });
  return reply ?? hangup;
}

/** Twilio's status callback for a test call: rang, rang out, declined, never connected, or ended with nothing keyed. */
export async function testStatus(db: Db, now: Date, pack: GamePack, uid: string, testId: string, params: Record<string, string>): Promise<void> {
  await withTest(db, now, pack, uid, testId, (w) => {
    if (otherCall(w.test, params.CallSid)) return;
    const status = params.CallStatus ?? '';
    const code = params.ErrorCode ? String(params.ErrorCode) : null;
    const heard: Partial<PhoneTest> = { sid: w.test.sid ?? params.CallSid ?? null, status, heardAt: toTs(now), ...(code ? { errorCode: code } : {}) };
    if (w.test.result !== null) {
      w.tx.update(w.ref, { test: { ...w.test, ...heard } });
      return;
    }
    const meaning = callStatusMeaning(status);
    if (meaning === 'pending' || meaning === 'reached') {
      w.tx.update(w.ref, { test: { ...w.test, ...heard } });
      if (meaning === 'reached') noteOutcome(w.book, now, w.settings.policeBreakerAt, { kind: 'test', connected: true, uid, callId: null, code: null });
    } else if (meaning === 'answered-ended') {
      finishTest(w, answeredByMachine(params.AnsweredBy) ? 'voicemail' : 'no-digits', null, true, heard);
    } else if (meaning === 'unanswered') {
      finishTest(w, status === 'busy' ? 'busy' : 'no-answer', null, true, heard);
    } else {
      finishTest(w, 'never-connected', code, false, heard);
    }
  });
}

/** What the GM's switch does: restore the lines, send everyone to the app, or look at the Twilio account now. */
export async function setSwitchboard(
  db: Db,
  ctx: Ctx,
  data: { action?: unknown },
  line: PhoneLine | null,
): Promise<{ mode: Switchboard['mode']; health: Switchboard['health'] }> {
  if (!ctx.pack.features.police) fail('failed-precondition', policeOff(ctx.pack));
  const action = data.action;
  if (action !== 'restore' && action !== 'app' && action !== 'check') fail('invalid-argument', "action must be 'restore', 'app' or 'check'.");
  const by = await requireGM(db, ctx);
  const t = termForms(ctx.pack.terms);
  let health: Switchboard['health'] = null;
  if (action === 'check') {
    if (!line) fail('failed-precondition', "Phone calls aren't set up on this server yet.");
    const h = await line.health();
    health = { ok: h.ok, message: h.message, balance: h.balance, at: toTs(ctx.now) };
  }
  return db.runTransaction(async (tx) => {
    const sb = await loadSwitchboard(db, tx);
    const at = toTs(ctx.now);
    let next: Switchboard = sb;
    let change: 'tripped' | 'restored' | null = null;
    if (action === 'restore') {
      next = { ...sb, mode: 'phone', manual: false, since: at, streak: 0, streakUids: [], trialCallId: null };
      if (sb.mode !== 'phone') change = 'restored';
    } else if (action === 'app') {
      next = { ...sb, mode: 'app', manual: true, since: sb.mode === 'app' ? sb.since : at, trialCallId: null };
      if (sb.mode !== 'app') change = 'tripped';
    } else {
      next = { ...sb, health };
    }
    tx.set(db.doc(SWITCHBOARD_PATH), next);
    if (change) {
      const book: LineBook = { phoneOn: true, switchboard: next, phones: new Map(), switchboardChanged: false, linePatches: new Map(), change };
      flushLines(tx, db, ctx.now, t, book, by);
    }
    return { mode: next.mode, health: next.health };
  });
}

/** Why the timer gives up on a test call: no word from Twilio within 90 s, or no result within 3 min. */
function stalledTest(test: PhoneTest, nowMs: number): 'no-status' | 'no-result' | null {
  const started = millis(test.startedAt);
  if (test.heardAt == null && nowMs - started >= PHONE_SILENT_MS) return 'no-status';
  if (nowMs - started >= PHONE_GIVE_UP_MS) return 'no-result';
  return null;
}

/**
 * The timer's switchboard job: settles test calls that went quiet, and every 15 min while the lines are down by
 * themselves (not by the GM's hand) looks at the Twilio account without ringing anyone. A healthy account puts the
 * switchboard on probation: the next due check-in rings as a trial, and restores the lines if it connects.
 */
export async function runSwitchboard(db: Db, now: Date, pack: GamePack, line: PhoneLine | null): Promise<{ tests: string[]; probation: boolean }> {
  const out = { tests: [] as string[], probation: false };
  if (!pack.features.police) return out;
  const nowMs = now.getTime();
  for (const d of (await db.collection('phones').get()).docs) {
    const test = (d.data() as PlayerPhone).test;
    const code = test && test.result === null ? stalledTest(test, nowMs) : null;
    if (!test || !code) continue;
    const done = await withTest(db, now, pack, d.id, test.id, (w) => {
      if (w.test.result !== null) return false;
      finishTest(w, 'never-connected', code, false);
      return true;
    });
    if (done) out.tests.push(d.id);
  }

  const settings = await loadSettings(db);
  const sb = await loadSwitchboard(db);
  if (!line || !settings.policePhone || sb.mode !== 'app' || sb.manual) return out;
  if (sb.health && nowMs - millis(sb.health.at) < HEALTH_EVERY_MS) return out;
  const h = await line.health();
  out.probation = await db.runTransaction(async (tx) => {
    const current = await loadSwitchboard(db, tx);
    if (current.mode !== 'app' || current.manual) return false;
    const at = toTs(now);
    const health = { ok: h.ok, message: h.message, balance: h.balance, at };
    tx.set(
      db.doc(SWITCHBOARD_PATH),
      h.ok
        ? { ...current, health, mode: 'probation', since: at, trialCallId: null }
        : { ...current, health, lastError: { code: h.code, message: h.message, at } },
    );
    return h.ok;
  });
  return out;
}
