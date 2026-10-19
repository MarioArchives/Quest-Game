// Police check-ins by phone (packs with police, settings.policePhone). A check-in opened on the phone channel is
// dialled by the onPoliceCallCreated trigger (dialPoliceCall); Twilio then asks the voice webhook what to say
// (handlePoliceVoice): the intro and the question, gathered on the keypad, asked once more on silence, then the
// verdict. The same call doc is scored by the same rules as in the app. A call that never connects (Twilio refused it,
// it failed or was cancelled, or it went quiet) is the system's fault: it goes back to the app with a fresh window and
// no fine, and counts towards the switchboard. A call that rang out, was declined, went to voicemail or got no digits
// is the player's: missed, with its fine. Every handler is idempotent, because Twilio retries.
import { termForms, type TermForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { answeredByMachine, callStatusMeaning, isTelegramSid, spokenQuestion } from '../shared/phone.js';
import { DEFAULT_SETTINGS } from '../shared/settings.js';
import type { DocRef, Txn } from '../shared/store/types.js';
import type { GameState, Player, PoliceCall, PoliceCallPhone, Settings } from '../shared/types.js';
import type { Db } from './context.js';
import { isPlaying, loadSettings, loadState } from './guards.js';
import { scoringFor } from './ledger.js';
import { PhoneLineError, type PhoneLine } from './phoneLine.js';
import { GATHER_TIMEOUT_SEC, testGather, testStatus, testVoice } from './phones.js';
import { chargeMissed, scoreAnswer } from './police.js';
import { flushLines, noteOutcome, readLineBook, releaseTrial, resendToApp, type LineBook } from './policeLines.js';
import { isId, toTs } from './util.js';
import { voiceScript, type Speech, type VoiceReply } from './voice.js';

/** One transaction on a check-in call: everything the phone handlers might need, read before any write. */
interface CallTx {
  tx: Txn;
  db: Db;
  now: Date;
  pack: GamePack;
  t: TermForms;
  ref: DocRef;
  call: PoliceCall;
  phone: PoliceCallPhone | null;
  player: Player | undefined;
  state: GameState;
  settings: Settings;
  book: LineBook;
}

async function withCall<R>(db: Db, now: Date, pack: GamePack, callId: string, fn: (c: CallTx) => R): Promise<R | null> {
  if (!isId(callId)) return null;
  const t = termForms(pack.terms);
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`policeCalls/${callId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const call = snap.data() as PoliceCall;
    const player = (await tx.get(db.doc(`players/${call.uid}`))).data() as Player | undefined;
    const state = await loadState(db, tx);
    const settings = await loadSettings(db, tx);
    const book = await readLineBook(tx, db, settings, [call.uid], true);
    const out = fn({ tx, db, now, pack, t, ref, call, phone: call.phone ?? null, player, state, settings, book });
    flushLines(tx, db, now, t, book);
    return out;
  });
}

/** Still ringing on the phone channel and waiting for an outcome. */
const ringing = (c: CallTx): boolean => c.call.status === 'open' && c.call.channel === 'phone' && c.phone !== null;

/** True when Twilio's request is about another call than the one this check-in placed. */
const otherCall = (phone: PoliceCallPhone | null, sid: string | undefined): boolean => Boolean(phone?.sid && sid && phone.sid !== sid);

/** The player left while it rang: called off, no fine. */
function callOff(c: CallTx): void {
  c.tx.update(c.ref, { status: 'cancelled' });
  releaseTrial(c.book, c.ref.id);
}

/** It got through to the phone (rang, or was answered): clears the line's count, and restores the lines on a trial. */
const connected = (c: CallTx) =>
  noteOutcome(c.book, c.now, c.settings.policeBreakerAt, { kind: 'checkin', connected: true, uid: c.call.uid, callId: c.ref.id, code: null });

/** It never connected: back to the app with a fresh window and no fine; counts against the switchboard and the line. */
function neverConnected(c: CallTx, phone: PoliceCallPhone, code: string | null): void {
  resendToApp(c.tx, c.db, c.now, c.t, c.settings, { ref: c.ref, data: c.call }, c.player!.displayName, 'never-connected', {
    ...phone,
    result: 'never-connected',
    errorCode: code ?? phone.errorCode,
  });
  noteOutcome(c.book, c.now, c.settings.policeBreakerAt, { kind: 'checkin', connected: false, uid: c.call.uid, callId: c.ref.id, code });
}

/**
 * The fine for a player who picked up a Telegram call and then got it wrong or said nothing: the smaller
 * heardPenalty, kept from when the call opened. Undefined on other lines (the call's own failPenalty).
 */
function heardFine(c: CallTx, sid: string | null | undefined): number | undefined {
  return isTelegramSid(sid ?? c.phone?.sid) ? (c.call.heardPenalty ?? DEFAULT_SETTINGS.policeHeardPenalty) : undefined;
}

/** The player's fault (rang out, declined, voicemail, nothing keyed): missed, with its fine (`penalty`: another than the call's). */
function missed(c: CallTx, phone: PoliceCallPhone, penalty?: number): void {
  const scoring = scoringFor(c.pack, c.settings, c.state, c.now);
  chargeMissed(c.tx, c.db, c.now, c.t, scoring, { ref: c.ref, data: c.call }, c.player!, c.player!.points, { phone }, penalty);
}

/**
 * The onPoliceCallCreated trigger: rings a check-in opened on the phone channel. A claim in a transaction makes sure
 * it is dialled once, however often the trigger fires. `line` null means phone calls aren't set up on this server.
 */
export async function dialPoliceCall(db: Db, callId: string, now: Date, pack: GamePack, line: PhoneLine | null): Promise<'dialled' | 'refused' | 'skipped'> {
  if (!pack.features.police || !isId(callId)) return 'skipped';
  // Most check-ins are answered in the app: a plain read skips them without a transaction.
  if ((await db.doc(`policeCalls/${callId}`).get()).get('channel') !== 'phone') return 'skipped';
  const to = await withCall(db, now, pack, callId, (c): string | null => {
    if (!ringing(c) || c.phone!.status !== 'pending') return null;
    if (!isPlaying(c.player)) {
      callOff(c);
      return null;
    }
    const number = c.book.phones.get(c.call.uid);
    if (number?.status !== 'verified') {
      // The line went (removed, or app only) between opening the check-in and dialling it: the app, nobody's fault.
      resendToApp(c.tx, c.db, now, c.t, c.settings, { ref: c.ref, data: c.call }, c.player!.displayName, 'no-line', { ...c.phone!, status: 'not dialled' });
      releaseTrial(c.book, c.ref.id);
      return null;
    }
    c.tx.update(c.ref, { phone: { ...c.phone!, status: 'dialling' } });
    if (line && line.callerId && number.callerId !== line.callerId) c.book.linePatches.set(c.call.uid, { callerId: line.callerId });
    return number.number;
  });
  if (!to) return 'skipped';

  if (!line) {
    await withCall(db, now, pack, callId, (c) => {
      if (ringing(c)) neverConnected(c, c.phone!, 'not-set-up');
    });
    return 'refused';
  }
  try {
    const { sid } = await line.placeCall({ to, query: { call: callId } });
    await withCall(db, now, pack, callId, (c) => {
      // A status callback that beat us here has recorded the call id already.
      if (c.phone && c.phone.sid === null) c.tx.update(c.ref, { phone: { ...c.phone, sid, status: c.phone.status === 'dialling' ? 'queued' : c.phone.status } });
    });
    return 'dialled';
  } catch (err) {
    const code = err instanceof PhoneLineError ? err.code : 'network';
    await withCall(db, now, pack, callId, (c) => {
      if (!ringing(c)) return;
      if (!isPlaying(c.player)) callOff(c);
      else neverConnected(c, c.phone!, code);
    });
    return 'refused';
  }
}

const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** The question, asked on the keypad: `attempt` 1, or 2 after silence. */
function askQuestion(c: CallTx, attempt: number, lead: Speech[]): VoiceReply {
  const say = voiceScript(c.pack, c.settings);
  return [
    {
      kind: 'gather',
      speech: [...lead, { text: spokenQuestion(c.call.question) }, say('key-in')],
      next: { call: c.ref.id, step: 'gather', try: String(attempt) },
      timeoutSec: GATHER_TIMEOUT_SEC,
    },
  ];
}

const sayAndHangUp = (speech: Speech): VoiceReply => [{ kind: 'say', speech }, { kind: 'hangup' }];

/** Twilio's first request once the call is answered: the intro and the question (voicemail is hung up on and missed). */
async function callVoice(db: Db, now: Date, pack: GamePack, callId: string, params: Record<string, string>): Promise<VoiceReply> {
  const reply = await withCall(db, now, pack, callId, (c): VoiceReply => {
    const say = voiceScript(pack, c.settings);
    if (!c.phone || otherCall(c.phone, params.CallSid)) return [{ kind: 'hangup' }];
    if (c.call.status === 'open' && c.call.channel !== 'phone') return sayAndHangUp(say('moved'));
    if (!ringing(c)) return sayAndHangUp(say('closed'));
    if (!isPlaying(c.player)) {
      callOff(c);
      return sayAndHangUp(say('closed'));
    }
    const phone: PoliceCallPhone = { ...c.phone, sid: c.phone.sid ?? params.CallSid ?? null, status: 'in-progress', heardAt: toTs(now) };
    connected(c);
    if (answeredByMachine(params.AnsweredBy)) {
      missed(c, { ...phone, result: 'voicemail' });
      return [{ kind: 'hangup' }];
    }
    c.tx.update(c.ref, { phone });
    const name = firstName(c.player?.displayName);
    return askQuestion(c, 1, [say(c.call.kind === 'tip' ? 'intro-tip' : 'intro-watch', name)]);
  });
  return reply ?? [{ kind: 'hangup' }];
}

/** The keypad answer (or silence: ask once more, then it counts as missed). */
async function callGather(db: Db, now: Date, pack: GamePack, callId: string, params: Record<string, string>, attempt: number): Promise<VoiceReply> {
  const digits = (params.Digits ?? '').replace(/\D/g, '');
  const reply = await withCall(db, now, pack, callId, (c): VoiceReply => {
    const say = voiceScript(pack, c.settings);
    if (!c.phone || otherCall(c.phone, params.CallSid)) return [{ kind: 'hangup' }];
    // Twilio asking again after the answer was scored hears the same verdict, and nothing is scored twice.
    if (c.call.status === 'passed') return sayAndHangUp(say('pass'));
    if (c.call.status === 'failed') return sayAndHangUp(say('fail'));
    if (c.call.status === 'missed') return sayAndHangUp(say('no-answer'));
    if (c.call.status === 'open' && c.call.channel !== 'phone') return sayAndHangUp(say('moved'));
    if (!ringing(c)) return sayAndHangUp(say('closed'));
    if (!isPlaying(c.player)) {
      callOff(c);
      return sayAndHangUp(say('closed'));
    }
    const phone: PoliceCallPhone = { ...c.phone, sid: c.phone.sid ?? params.CallSid ?? null, heardAt: toTs(now) };
    if (digits === '') {
      if (attempt < 2) {
        c.tx.update(c.ref, { phone });
        return askQuestion(c, attempt + 1, [say('again')]);
      }
      missed(c, { ...phone, result: 'no-digits' }, heardFine(c, phone.sid));
      return sayAndHangUp(say('no-answer'));
    }
    const scoring = scoringFor(pack, c.settings, c.state, now);
    const { status } = scoreAnswer(c.tx, c.db, now, c.t, scoring, { ref: c.ref, data: c.call }, c.player!, digits, { phone: { ...phone, result: 'answered' } }, heardFine(c, phone.sid));
    return sayAndHangUp(say(status === 'passed' ? 'pass' : 'fail'));
  });
  return reply ?? [{ kind: 'hangup' }];
}

/**
 * Twilio's status callbacks: ringing and answered mean it got through; busy and no-answer are the player's (missed);
 * completed with the call still open means they picked up and keyed nothing (or voicemail took it); failed and
 * canceled mean it never connected (the app, no fine). A call already settled only has its log updated.
 */
async function callStatus(db: Db, now: Date, pack: GamePack, callId: string, params: Record<string, string>): Promise<void> {
  await withCall(db, now, pack, callId, (c) => {
    if (!c.phone || otherCall(c.phone, params.CallSid)) return;
    const status = params.CallStatus ?? '';
    const code = params.ErrorCode ? String(params.ErrorCode) : null;
    const phone: PoliceCallPhone = { ...c.phone, sid: c.phone.sid ?? params.CallSid ?? null, status, heardAt: toTs(now), ...(code ? { errorCode: code } : {}) };
    if (!ringing(c)) {
      c.tx.update(c.ref, { phone });
      return;
    }
    if (!isPlaying(c.player)) {
      c.tx.update(c.ref, { phone });
      callOff(c);
      return;
    }
    switch (callStatusMeaning(status)) {
      case 'pending':
        c.tx.update(c.ref, { phone });
        return;
      case 'reached':
        c.tx.update(c.ref, { phone });
        connected(c);
        return;
      case 'answered-ended':
        connected(c);
        missed(c, { ...phone, result: answeredByMachine(params.AnsweredBy) ? 'voicemail' : 'no-digits' }, heardFine(c, phone.sid));
        return;
      case 'unanswered':
        connected(c);
        missed(c, { ...phone, result: status === 'busy' ? 'busy' : 'no-answer' });
        return;
      case 'never-connected':
        neverConnected(c, phone, code);
        return;
    }
  });
}

/** One request from Twilio to the voice webhook: the query we put on its URL, and Twilio's own POST params. */
export interface VoiceRequest {
  query: Record<string, string>;
  params: Record<string, string>;
}

/**
 * The voice webhook (policeVoice): a check-in call (?call=<id>) or a test call (?line=<uid>&test=<id>), at one step:
 * 'voice' (answered: what to say), 'gather' (the digits) or 'status' (Twilio's status callback; empty reply).
 */
export async function handlePoliceVoice(db: Db, now: Date, pack: GamePack, req: VoiceRequest): Promise<VoiceReply> {
  const { query, params } = req;
  const step = query.step;
  const attempt = Math.max(1, Math.min(2, Number(query.try) || 1));
  if (!pack.features.police) return step === 'status' ? [] : [{ kind: 'hangup' }];
  if (query.call) {
    if (step === 'voice') return callVoice(db, now, pack, query.call, params);
    if (step === 'gather') return callGather(db, now, pack, query.call, params, attempt);
    if (step === 'status') {
      await callStatus(db, now, pack, query.call, params);
      return [];
    }
  } else if (query.line && query.test && isId(query.line)) {
    if (step === 'voice') return testVoice(db, now, pack, query.line, query.test, params);
    if (step === 'gather') return testGather(db, now, pack, query.line, query.test, params, attempt);
    if (step === 'status') {
      await testStatus(db, now, pack, query.line, query.test, params);
      return [];
    }
  }
  return step === 'status' ? [] : [{ kind: 'hangup' }];
}
