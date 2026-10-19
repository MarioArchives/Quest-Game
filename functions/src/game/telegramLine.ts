// The police's Telegram line (POLICE_LINE=telegram): a PhoneLine whose calls are orders for the police script
// (services/telegram-police), which polls for them, rings the player on Telegram from the police's own account, and
// reports back as the same requests Twilio sends the voice webhook. Answers come as a reply in the police chat.
import type { GamePack } from '../shared/packs/types.js';
import { LINE_OFFLINE_MS, TELEGRAM_SID_PREFIX, isTelegramSid, type VoiceLineKey } from '../shared/phone.js';
import type { LineBeat, LineOrder, PoliceCall } from '../shared/types.js';
import type { Db } from './context.js';
import { PhoneLineError, type LineHealth, type PhoneLine } from './phoneLine.js';
import { handlePoliceVoice } from './policePhone.js';
import { isId, millis, toTs } from './util.js';
import type { VoiceReply } from './voice.js';

/** How long the script waits for each reply in the chat, in seconds. */
export const LINE_REPLY_SEC = 60;

/** The keypad lines, as said on a Telegram call (the answer is a reply in the chat). */
export const TELEGRAM_LINES: Record<'key-in' | 'test-key-in' | 'again', string> = {
  'key-in': 'Reply to our message with your answer.',
  'test-key-in': 'Reply in our chat with the code.',
  again: "I didn't catch that. Reply with the number.",
};

/** One thing for the script to do on a call. */
export type TelegramStep =
  | { say: string; line: VoiceLineKey | null }
  | { ask: { say: string[]; message: string; replySec: number; next: Record<string, string> } }
  | { hangup: true };

/** An order as `poll` hands it out. */
export interface LineOrderOut {
  id: string;
  kind: 'call' | 'test';
  to: string;
  query: Record<string, string>;
  sid: string;
}

export type TelegramLineReply = { ok: true } | { orders: LineOrderOut[] } | { steps: TelegramStep[] };

/** A request the line can't take (an unknown op, a malformed event): HTTP 400. */
export class TelegramLineError extends Error {
  readonly status = 400;
}

/** The most orders one poll hands out. */
const POLL_MAX = 5;
const STEPS = ['voice', 'gather', 'status'] as const;
type EventStep = (typeof STEPS)[number];

const bad = (message: string): never => {
  throw new TelegramLineError(message);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A flat record of strings (a query, Twilio-style params). */
function flat(v: unknown, what: string): Record<string, string> {
  if (!isObject(v)) return bad(`${what} must be an object.`);
  for (const value of Object.values(v)) if (typeof value !== 'string') return bad(`${what} must hold only strings.`);
  return v as Record<string, string>;
}

/** The Telegram line as a PhoneLine: placing a call writes an order the police script picks up. */
export function telegramLine(db: Db, now: () => Date = () => new Date()): PhoneLine {
  const beat = async () => (await db.doc('game/line').get()).data() as LineBeat | undefined;
  const alive = (b: LineBeat | undefined) => b !== undefined && now().getTime() - millis(b.seenAt) <= LINE_OFFLINE_MS;
  return {
    // Calls come from the police's Telegram account, not a number.
    callerId: '',

    async placeCall({ to, query }) {
      if (!alive(await beat())) throw new PhoneLineError('line-offline', "The police script isn't running (no heartbeat)");
      const test = query.test !== undefined;
      const id = query.test ?? query.call;
      if (!id || !isId(id)) throw new PhoneLineError('tg-error', 'No call to place');
      const order: LineOrder = { kind: test ? 'test' : 'call', to, query, sid: `${TELEGRAM_SID_PREFIX}${id}`, status: 'new', createdAt: toTs(now()) };
      await db.doc(`lineOrders/${id}`).set(order);
      return { sid: order.sid };
    },

    async health(): Promise<LineHealth> {
      const b = await beat();
      if (!b || !alive(b)) return { ok: false, message: "Telegram line offline: the police script isn't running", balance: null, code: 'line-offline' };
      const seen = Math.max(0, Math.round((now().getTime() - millis(b.seenAt)) / 1000));
      const who = b.account?.name ? ` as ${b.account.name}` : '';
      return { ok: true, message: `Telegram line online${who}, seen ${seen} s ago`, balance: null, code: null };
    },
  };
}

/** One event from the script, as the request Twilio would have sent: handled by the voice webhook's own handlers. */
async function handleEvent(db: Db, now: Date, pack: GamePack, op: Record<string, unknown>): Promise<TelegramLineReply> {
  const sid = op.sid;
  if (typeof sid !== 'string' || !isTelegramSid(sid)) return bad('An event needs a Telegram call id.');
  const query = flat(op.query, 'query');
  const params = flat(op.params, 'params');
  const step = op.step as EventStep;
  if (!STEPS.includes(step)) return bad(`step must be one of ${STEPS.join(', ')}.`);
  if (op.try !== undefined && typeof op.try !== 'string') return bad('try must be a string.');
  const reply = await handlePoliceVoice(db, now, pack, {
    query: { ...query, step, ...(op.try ? { try: op.try as string } : {}) },
    params: { ...params, CallSid: sid },
  });
  let about: Parameters<typeof renderTelegram>[1] = { kind: 'test' };
  if (query.call) {
    const call = isId(query.call) ? ((await db.doc(`policeCalls/${query.call}`).get()).data() as PoliceCall | undefined) : undefined;
    about = { kind: 'call', question: call?.question ?? '' };
  }
  return { steps: renderTelegram(reply, about) };
}

/** Takes up to five new orders, oldest first, marking them taken so no poll hands one out twice. */
async function claimOrders(db: Db, now: Date): Promise<LineOrderOut[]> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('lineOrders').where('status', '==', 'new').orderBy('createdAt', 'asc').limit(POLL_MAX));
    for (const d of snap.docs) tx.update(d.ref, { status: 'taken', takenAt: toTs(now) });
    return snap.docs.map((d) => {
      const o = d.data() as LineOrder;
      return { id: d.id, kind: o.kind, to: o.to, query: o.query, sid: o.sid };
    });
  });
}

/** What the script asks of the game: heartbeat (I'm alive), poll (any calls to place?) and event (what happened). */
export async function handleTelegramLine(db: Db, now: Date, pack: GamePack, op: unknown): Promise<TelegramLineReply> {
  if (!isObject(op)) return bad('A request is an object with an op.');
  switch (op.op) {
    case 'heartbeat': {
      const a = op.account;
      let account: LineBeat['account'] = null;
      if (a !== undefined && a !== null) {
        if (!isObject(a) || typeof a.name !== 'string') return bad('account needs a name.');
        account = { name: a.name.slice(0, 100), id: typeof a.id === 'number' ? a.id : null };
      }
      const beat: LineBeat = { kind: 'telegram', seenAt: toTs(now), account };
      await db.doc('game/line').set(beat);
      return { ok: true };
    }
    case 'poll':
      return { orders: await claimOrders(db, now) };
    case 'event':
      return handleEvent(db, now, pack, op);
    default:
      return bad('Unknown op.');
  }
}

/** The "message" the script posts in the chat while it waits for the reply. */
const messageFor = (about: { kind: 'call'; question: string } | { kind: 'test' }): string =>
  about.kind === 'call' ? `Police check-in: ${about.question} Reply with the number.` : 'Reply with the code you just heard on the call.';

const TELEGRAM_LINE_KEYS: readonly VoiceLineKey[] = ['key-in', 'test-key-in', 'again'];

/** The voice webhook's reply as steps for the script: speech to say, a question to ask in the chat, or the hang-up. */
export function renderTelegram(reply: VoiceReply, about: { kind: 'call'; question: string } | { kind: 'test' }): TelegramStep[] {
  return reply.map((step): TelegramStep => {
    if (step.kind === 'hangup') return { hangup: true };
    if (step.kind === 'say') return { say: step.speech.text, line: step.speech.line ?? null };
    return {
      ask: {
        say: step.speech.map((s) => (s.line && TELEGRAM_LINE_KEYS.includes(s.line) ? TELEGRAM_LINES[s.line as keyof typeof TELEGRAM_LINES] : s.text)),
        message: messageFor(about),
        replySec: LINE_REPLY_SEC,
        next: step.next,
      },
    };
  });
}
