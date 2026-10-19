// The police lines inside a transaction (packs with police, phone calls on): the game's switchboard and the players'
// phones as read once, routing new check-ins, counting phone outcomes against the breaker and the lines, re-sending a
// check-in that never connected to the app, and writing it all back. The rules themselves are pure, in
// shared/switchboard.ts.
import type { TermForms } from '../shared/packs/terms.js';
import { describePhoneError } from '../shared/phone.js';
import { afterOutcome, lineAfterOutcome, routeCall, switchboardOf, type CallRoute } from '../shared/switchboard.js';
import type { DocRef, Txn } from '../shared/store/types.js';
import type { PlayerPhone, PoliceCall, PoliceCallPhone, PoliceFallbackReason, Settings, Switchboard } from '../shared/types.js';
import type { Db } from './context.js';
import { addFeed } from './feed.js';
import { MIN_MS, toTs } from './util.js';

export const SWITCHBOARD_PATH = 'game/switchboard';

/** The lines as one transaction sees them, plus the writes it owes (flushLines makes them). */
export interface LineBook {
  /** settings.policePhone when it was read. */
  phoneOn: boolean;
  switchboard: Switchboard;
  /** The lines read in this transaction, by uid (missing = no number). */
  phones: Map<string, PlayerPhone>;
  switchboardChanged: boolean;
  /** Changes to make to lines, by uid. */
  linePatches: Map<string, Partial<PlayerPhone>>;
  /** The last change to the lines in this transaction, for the post: down or back. */
  change: 'tripped' | 'restored' | null;
}

/** An empty book: phone calls off, nothing read. Routes every check-in to the app as before. */
export const noLines = (): LineBook => ({
  phoneOn: false,
  switchboard: switchboardOf(undefined),
  phones: new Map(),
  switchboardChanged: false,
  linePatches: new Map(),
  change: null,
});

export async function loadSwitchboard(db: Db, tx?: Txn): Promise<Switchboard> {
  const ref = db.doc(SWITCHBOARD_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return switchboardOf(snap.data() as Partial<Switchboard> | undefined);
}

/**
 * Reads the switchboard and these players' lines ('all': every line), before any write. With phone calls off it
 * reads nothing unless `always` (the timer still has to settle calls already ringing).
 */
export async function readLineBook(tx: Txn, db: Db, settings: Settings, uids: string[] | 'all', always = false): Promise<LineBook> {
  const book = noLines();
  book.phoneOn = Boolean(settings.policePhone);
  if (!book.phoneOn && !always) return book;
  book.switchboard = await loadSwitchboard(db, tx);
  const snaps =
    uids === 'all'
      ? (await tx.get(db.collection('phones'))).docs
      : uids.length > 0
        ? await tx.getAll(...uids.map((uid) => db.doc(`phones/${uid}`)))
        : [];
  for (const d of snaps) if (d.exists) book.phones.set(d.id, d.data() as PlayerPhone);
  return book;
}

/** Where this player's new check-in goes (claiming the trial, on probation, is the opener's job). */
export function routeFor(book: LineBook, uid: string): CallRoute {
  return routeCall({ phoneOn: book.phoneOn, line: book.phones.get(uid), switchboard: book.switchboard, trialTaken: false });
}

/** The trial call on probation is this one. */
export function claimTrial(book: LineBook, callId: string): void {
  book.switchboard = { ...book.switchboard, trialCallId: callId };
  book.switchboardChanged = true;
}

/** A call that will never finish (called off, or the game ended) frees the trial for the next one. */
export function releaseTrial(book: LineBook, callId: string): void {
  if (book.switchboard.trialCallId !== callId) return;
  book.switchboard = { ...book.switchboard, trialCallId: null };
  book.switchboardChanged = true;
}

/**
 * Counts a phone call's outcome: against the breaker (check-ins and tests) and, for a check-in, against the player's
 * line. Nothing is written until flushLines.
 */
export function noteOutcome(
  book: LineBook,
  now: Date,
  threshold: number,
  o: { kind: 'checkin' | 'test'; connected: boolean; uid: string; callId: string | null; code: string | null },
): void {
  const message = describePhoneError(o.code);
  const { next, change } = afterOutcome(book.switchboard, { ...o, message, at: toTs(now), threshold });
  if (JSON.stringify(next) !== JSON.stringify(book.switchboard)) {
    book.switchboard = next;
    book.switchboardChanged = true;
  }
  if (change) book.change = change;
  if (o.kind !== 'checkin') return;
  const line = book.phones.get(o.uid);
  if (!line) return;
  const patch = lineAfterOutcome(line, o.connected, o.code, `${message}, twice in a row`);
  if (!patch) return;
  book.phones.set(o.uid, { ...line, ...patch });
  book.linePatches.set(o.uid, { ...book.linePatches.get(o.uid), ...patch });
}

/** What players read when the lines go down or come back. */
export function linePostText(t: TermForms, change: 'tripped' | 'restored'): string {
  return change === 'tripped'
    ? `The phone lines are down. Until they're back, ${t.policeCall.many} open in the app, with no fine for the calls that didn't connect`
    : 'The phone lines are back. Expect a call';
}

/** Writes what the book owes: the switchboard, the lines' changes, and one post if the lines went down or came back. */
export function flushLines(tx: Txn, db: Db, now: Date, t: TermForms, book: LineBook, actorUid: string | null = null): void {
  if (book.switchboardChanged) tx.set(db.doc(SWITCHBOARD_PATH), book.switchboard);
  for (const [uid, patch] of book.linePatches) tx.update(db.doc(`phones/${uid}`), { ...patch, updatedAt: toTs(now) });
  if (book.change) addFeed(tx, db, now, { type: 'police-line', text: linePostText(t, book.change), uid: null, ref: null, actorUid });
  book.switchboardChanged = false;
  book.linePatches = new Map();
  book.change = null;
}

/**
 * A phone check-in that never connected goes to the app instead: a fresh window to answer, no fine, and a post that
 * pushes to the player. Writes only.
 */
export function resendToApp(
  tx: Txn,
  db: Db,
  now: Date,
  t: TermForms,
  settings: Settings,
  call: { ref: DocRef; data: PoliceCall },
  playerName: string,
  reason: PoliceFallbackReason,
  phone: PoliceCallPhone | null,
): void {
  const c = call.data;
  tx.update(call.ref, {
    channel: 'app',
    fallbackReason: reason,
    endsAt: toTs(new Date(now.getTime() + settings.policeWindowMin * MIN_MS)),
    resentAt: toTs(now),
    phone,
  });
  const why = reason === 'never-connected' ? "the phone didn't connect" : reason === 'lines-down' ? 'the phone lines are down' : 'there is no line to ring';
  addFeed(tx, db, now, {
    type: 'police-call',
    text: `${t.policeCall.One} for ${playerName}, in the app because ${why}: ${c.question} ${settings.policeWindowMin} min to answer`,
    uid: c.uid,
    ref: call.ref.id,
  });
}
