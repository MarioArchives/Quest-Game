// The simulated phone line, for the mock and the emulators, where nothing may ring a real phone. A call "goes out" at
// once with an id the app recognises (SIM-…), from a made-up number in Ofcom's drama range (+44 7700 900xxx, kept
// for fiction, so it's nobody's phone), and the app plays the phone: it rings on screen, the player picks up, reads
// what the police say and keys in the code or the answer. Each of those moves reaches the voice webhook's own
// handlers as the request Twilio would send (simulateCall), so a test call verifies the line, and a check-in is
// scored, exactly as a real call would be. A deployment has Twilio's line or none: never this one.
import { termForms } from '../shared/packs/terms.js';
import { isSimulatedSid, SIMULATED_SID_PREFIX, type SimulatedAction, type SimulatedTurn } from '../shared/phone.js';
import type { PlayerPhone, PoliceCall } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, requireUid } from './guards.js';
import type { PhoneLine } from './phoneLine.js';
import { handlePoliceVoice } from './policePhone.js';
import { isId } from './util.js';
import type { VoiceReply } from './voice.js';

/** The police's number on the simulated line (Ofcom's drama range: no real phone has it). */
export const SIMULATED_CALLER_ID = '+447700900999';

/** Longest keypad entry taken from the app (a check-in answer is a few digits). */
const DIGITS_MAX = 20;

/** The simulated line: places nothing, so every call is answered (or not) in the app; its account is always fine. */
export function simulatedLine(callerId: string = SIMULATED_CALLER_ID): PhoneLine {
  return {
    callerId,
    async placeCall(call) {
      // One id per call: the test's or the check-in's own.
      return { sid: `${SIMULATED_SID_PREFIX}${call.query.test ?? call.query.call ?? 'call'}` };
    },
    async health() {
      return { ok: true, message: 'Simulated line: no real phone rings', balance: null, code: null };
    },
  };
}

const ACTIONS: readonly SimulatedAction[] = ['ring', 'answer', 'keys', 'decline', 'no-answer', 'hang-up'];

/** A move on the phone as the request Twilio would send about it: the webhook step, and Twilio's own params. */
export function twilioRequestFor(action: SimulatedAction, sid: string, digits = '', attempt = 1): { step: string; params: Record<string, string>; try?: string } {
  const status = (CallStatus: string) => ({ step: 'status', params: { CallSid: sid, CallStatus } });
  switch (action) {
    case 'ring':
      return status('ringing');
    case 'answer':
      return { step: 'voice', params: { CallSid: sid, CallStatus: 'in-progress', AnsweredBy: 'human' } };
    case 'keys':
      return { step: 'gather', params: { CallSid: sid, Digits: digits }, try: String(attempt) };
    case 'decline':
      return status('busy');
    case 'no-answer':
      return status('no-answer');
    case 'hang-up':
      return status('completed');
  }
}

/** The webhook's reply as the app shows it: the words, the keypad if the police wait for digits, and the hang-up. */
export function turnOf(reply: VoiceReply): SimulatedTurn {
  const turn: SimulatedTurn = { said: [], keypad: null, ended: false };
  for (const step of reply) {
    if (step.kind === 'say') turn.said.push(step.speech.text);
    else if (step.kind === 'hangup') turn.ended = true;
    else {
      turn.said.push(...step.speech.map((s) => s.text));
      turn.keypad = { attempt: Number(step.next.try) || 1, digits: step.numDigits ?? null };
    }
  }
  return turn;
}

/**
 * Callable (the mock and the emulators): the player's move on a simulated call to their own phone, either their test
 * call (`test`, the id) or a check-in ringing them (`call`, the id). Only calls the simulated line placed qualify, so
 * nothing here can touch a real call.
 */
export async function simulateCall(
  db: Db,
  ctx: Ctx,
  data: { test?: unknown; call?: unknown; action?: unknown; digits?: unknown; attempt?: unknown },
): Promise<SimulatedTurn> {
  if (!ctx.pack.features.police) fail('failed-precondition', `${termForms(ctx.pack.terms).policeCall.Many} are not part of this game.`);
  const uid = requireUid(ctx);
  const action = data.action as SimulatedAction;
  if (!ACTIONS.includes(action)) fail('invalid-argument', `action must be one of ${ACTIONS.join(', ')}.`);
  const digits = typeof data.digits === 'string' ? data.digits.replace(/[^\d*#]/g, '').slice(0, DIGITS_MAX) : '';
  const attempt = data.attempt === 2 ? 2 : 1;

  let query: Record<string, string>;
  let sid: string | null;
  if (data.call !== undefined) {
    if (!isId(data.call)) fail('invalid-argument', 'No such call.');
    const call = (await db.doc(`policeCalls/${data.call}`).get()).data() as PoliceCall | undefined;
    if (!call || call.uid !== uid) fail('not-found', 'No such call.');
    query = { call: data.call };
    sid = call.phone?.sid ?? null;
  } else if (data.test !== undefined) {
    const line = (await db.doc(`phones/${uid}`).get()).data() as PlayerPhone | undefined;
    if (typeof data.test !== 'string' || !line?.test || line.test.id !== data.test) fail('not-found', 'No such test call.');
    query = { line: uid, test: data.test };
    sid = line.test.sid;
  } else {
    return fail('invalid-argument', 'Say which call: test or call.');
  }
  if (!isSimulatedSid(sid)) fail('failed-precondition', 'Only a call on the simulated line can be answered here.');

  const req = twilioRequestFor(action, sid!, digits, attempt);
  const reply = await handlePoliceVoice(db, ctx.now, ctx.pack, { query: { ...query, step: req.step, ...(req.try ? { try: req.try } : {}) }, params: req.params });
  return turnOf(reply);
}
