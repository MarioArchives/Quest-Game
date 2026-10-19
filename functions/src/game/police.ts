// Police check-ins (packs with police). A person of interest gets a 'watch' call every settings.policeEveryMin
// (lastCheckedAt); a trusted confidant may tip off the police about another player once every
// settings.policeTipEveryMin (lastSnitchedAt). A right answer earns the call's passPoints; a wrong one, or none in
// time, costs its failPenalty. With phone calls on (settings.policePhone), a check-in rings the player's verified line
// instead (./policePhone.ts) and falls back to the app when it can't (./policeLines.ts).
import { getPack } from '../shared/packs/index.js';
import { termForms, type TermForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { PHONE_GIVE_UP_MS, PHONE_SILENT_MS } from '../shared/phone.js';
import { cooldownLeftMs, isRightAnswer, policeQuestion } from '../shared/police.js';
import { standingOf } from '../shared/standing.js';
import type { DocRef, Txn } from '../shared/store/types.js';
import type { PoliceCall, PoliceCallKind, PoliceCallPhone, Player, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { isQuietHours } from './globals.js';
import { fail, isPlaying, loadSettings, loadState, requirePlayer } from './guards.js';
import { applyScore, scoringFor, type Scoring } from './ledger.js';
import { claimTrial, flushLines, loadSwitchboard, noteOutcome, readLineBook, releaseTrial, resendToApp, routeFor, SWITCHBOARD_PATH, type LineBook } from './policeLines.js';
import { MIN_MS, asId, millis, toTs } from './util.js';
import { readPlayers } from './voting.js';

/** What one timer run did: calls opened (watch), closed unanswered (missed), called off (player left), re-sent to the app. */
export interface PoliceTickResult {
  opened: string[];
  missed: string[];
  cancelled: string[];
  resent: string[];
}

const NOTE_MAX = 200;
const ANSWER_MAX = 20;

/**
 * Opens a call on `uid` and posts it (the post pushes to that player only). Writes only: the caller has checked the
 * call is due and read nothing the writes depend on. A watch call also sets the player's lastCheckedAt; a tip's
 * sender's lastSnitchedAt is the caller's to set. With a `book` (phone calls), the call rings when the player has a
 * verified line and the lines are up; the onPoliceCallCreated trigger dials it. The caller flushes the book.
 */
export function openPoliceCall(
  tx: Txn,
  db: Db,
  now: Date,
  rng: () => number,
  t: TermForms,
  settings: Settings,
  call: { uid: string; name: string; kind: PoliceCallKind; by?: { uid: string; name: string }; note?: string },
  book?: LineBook,
): string {
  const ref = db.collection('policeCalls').doc();
  const { question, expected } = policeQuestion(rng);
  const route = book ? routeFor(book, call.uid) : { channel: 'app' as const, fallbackReason: null, trial: false };
  if (route.trial) claimTrial(book!, ref.id);
  const phone: PoliceCallPhone | null =
    route.channel === 'phone'
      ? { sid: null, status: 'pending', result: null, errorCode: null, placedAt: toTs(now), heardAt: null, trial: route.trial }
      : null;
  const doc: PoliceCall = {
    uid: call.uid,
    kind: call.kind,
    byUid: call.by?.uid ?? null,
    note: call.note ?? null,
    question,
    expected,
    startsAt: toTs(now),
    endsAt: toTs(new Date(now.getTime() + settings.policeWindowMin * MIN_MS)),
    status: 'open',
    answer: null,
    answeredAt: null,
    passPoints: settings.policePassPoints,
    failPenalty: settings.policeFailPenalty,
    channel: route.channel,
    fallbackReason: route.fallbackReason,
    phone,
  };
  tx.create(ref, doc);
  // A ringing call keeps its question for the phone.
  const ask = phone ? 'the police are ringing' : `${question} ${settings.policeWindowMin} min to answer`;
  if (call.kind === 'watch') {
    tx.update(db.doc(`players/${call.uid}`), { lastCheckedAt: toTs(now) });
    addFeed(tx, db, now, {
      type: 'police-call',
      text: `${t.policeCall.One} for ${call.name}: ${ask}`,
      uid: call.uid,
      ref: ref.id,
    });
  } else {
    addFeed(tx, db, now, {
      type: 'police-tip',
      text: `${call.by!.name} tipped off the police about ${call.name}: ${ask}`,
      uid: call.uid,
      actorUid: call.by!.uid,
      ref: ref.id,
      note: call.note ?? null,
    });
  }
  return ref.id;
}

const resultText = (t: TermForms, name: string, status: 'passed' | 'failed' | 'missed', points: number): string => {
  const signed = points > 0 ? `+${points}` : `−${Math.abs(points)}`;
  if (status === 'passed') return `${name} passed the ${t.policeCall.one} (${signed})`;
  if (status === 'failed') return `${name} failed the ${t.policeCall.one} (${signed})`;
  return `${name} missed the ${t.policeCall.one} (${signed})`;
};

/** An open call nobody answered (time up in the app, or the phone rang out): missed, its fine, a post. Writes only. */
export function chargeMissed(
  tx: Txn,
  db: Db,
  now: Date,
  t: TermForms,
  scoring: Scoring,
  call: { ref: DocRef; data: PoliceCall },
  player: Player,
  balance: number,
  extra: Record<string, unknown> = {},
): number {
  const c = call.data;
  tx.update(call.ref, { status: 'missed', ...extra });
  const { applied } = applyScore(
    tx, db, now, scoring, { kind: 'policeFailed', uid: c.uid, penalty: c.failPenalty, missed: true },
    new Map([[c.uid, balance]]), { ref: call.ref.id, by: 'system' },
  );
  const delta = applied.get(c.uid) ?? 0;
  addFeed(tx, db, now, { type: 'police-result', text: resultText(t, player.displayName, 'missed', delta), uid: c.uid, ref: call.ref.id, points: delta });
  return delta;
}

/** An answer to an open call (in the app or keyed on the phone): passed or failed, its points, a post. Writes only. */
export function scoreAnswer(
  tx: Txn,
  db: Db,
  now: Date,
  t: TermForms,
  scoring: Scoring,
  call: { ref: DocRef; data: PoliceCall },
  player: Player,
  answer: string,
  extra: Record<string, unknown> = {},
): { status: 'passed' | 'failed'; points: number } {
  const c = call.data;
  const passed = isRightAnswer(answer, c.expected);
  const event = passed
    ? ({ kind: 'policePassed', uid: c.uid, points: c.passPoints } as const)
    : ({ kind: 'policeFailed', uid: c.uid, penalty: c.failPenalty, missed: false } as const);
  tx.update(call.ref, { status: passed ? 'passed' : 'failed', answer, answeredAt: toTs(now), ...extra });
  const { applied } = applyScore(tx, db, now, scoring, event, new Map([[c.uid, player.points]]), { ref: call.ref.id, by: 'system' });
  const points = applied.get(c.uid) ?? 0;
  addFeed(tx, db, now, {
    type: 'police-result',
    text: resultText(t, player.displayName, passed ? 'passed' : 'failed', points),
    uid: c.uid,
    ref: call.ref.id,
    points,
  });
  return { status: passed ? 'passed' : 'failed', points };
}

/**
 * Why the timer gives up on a phone call that is still open: Twilio said nothing within 90 s of placing it
 * ('no-status'), or it has run 3 min without an outcome ('no-result'). Either way the system's fault. Null: wait.
 */
export function stalledPhoneCode(phone: PoliceCallPhone, nowMs: number): 'no-status' | 'no-result' | null {
  const placed = millis(phone.placedAt);
  if (phone.heardAt == null && nowMs - placed >= PHONE_SILENT_MS) return 'no-status';
  if (nowMs - placed >= PHONE_GIVE_UP_MS) return 'no-result';
  return null;
}

/**
 * The timer: closes app calls whose time is up, re-sends phone calls that went quiet to the app (no fine), calls off
 * those of players who left, and opens due watch calls.
 */
export async function runPolice(db: Db, now: Date, rng: () => number, pack: GamePack = getPack()): Promise<PoliceTickResult> {
  const none: PoliceTickResult = { opened: [], missed: [], cancelled: [], resent: [] };
  if (!pack.features.police) return none;
  const t = termForms(pack.terms);
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status !== 'active') return none;
    const settings = await loadSettings(db, tx);
    const nowMs = now.getTime();
    const open = (await tx.get(db.collection('policeCalls').where('status', '==', 'open'))).docs;
    const players = await readPlayers(tx, db);
    // Calls already ringing still settle when the GM has just switched phone calls off.
    const book = await readLineBook(tx, db, settings, 'all', open.some((d) => d.get('channel') === 'phone'));
    const scoring = scoringFor(pack, settings, state, now);

    const result: PoliceTickResult = { opened: [], missed: [], cancelled: [], resent: [] };
    const balances = new Map([...players].map(([uid, p]) => [uid, p.points]));
    const stillOpen = new Set<string>();
    for (const d of open) {
      const c = d.data() as PoliceCall;
      const player = players.get(c.uid);
      if (!isPlaying(player)) {
        tx.update(d.ref, { status: 'cancelled' });
        releaseTrial(book, d.id);
        result.cancelled.push(d.id);
      } else if (c.channel === 'phone' && c.phone) {
        const code = stalledPhoneCode(c.phone, nowMs);
        if (code) {
          resendToApp(tx, db, now, t, settings, { ref: d.ref, data: c }, player!.displayName, 'never-connected', { ...c.phone, result: 'never-connected', errorCode: code });
          noteOutcome(book, now, settings.policeBreakerAt, { kind: 'checkin', connected: false, uid: c.uid, callId: d.id, code });
          result.resent.push(d.id);
        }
        stillOpen.add(c.uid);
      } else if (millis(c.endsAt) <= nowMs) {
        const delta = chargeMissed(tx, db, now, t, scoring, { ref: d.ref, data: c }, player!, balances.get(c.uid)!);
        balances.set(c.uid, balances.get(c.uid)! + delta);
        result.missed.push(d.id);
      } else {
        stillOpen.add(c.uid);
      }
    }

    if (!isQuietHours(now, settings.quietHours, pack.timeZone)) {
      for (const [uid, player] of players) {
        if (!isPlaying(player) || stillOpen.has(uid) || standingOf(player.points, settings) !== 'poi') continue;
        const last = player.lastCheckedAt ? millis(player.lastCheckedAt) : null;
        if (cooldownLeftMs(last, settings.policeEveryMin, nowMs) > 0) continue;
        result.opened.push(openPoliceCall(tx, db, now, rng, t, settings, { uid, name: player.displayName, kind: 'watch' }, book));
      }
    }
    flushLines(tx, db, now, t, book);
    return result;
  });
}

/** The end of the game: every open call is called off, with no fine (and the switchboard's trial with them). */
export async function cancelOpenPoliceCalls(db: Db, _now: Date): Promise<void> {
  await db.runTransaction(async (tx) => {
    const open = (await tx.get(db.collection('policeCalls').where('status', '==', 'open'))).docs;
    const switchboard = await loadSwitchboard(db, tx);
    for (const d of open) tx.update(d.ref, { status: 'cancelled' });
    if (switchboard.trialCallId !== null) tx.set(db.doc(SWITCHBOARD_PATH), { ...switchboard, trialCallId: null });
  });
}

/** The player being checked answers their open call in the app, once, before it ends. */
export async function answerPoliceCall(
  db: Db,
  ctx: Ctx,
  data: { callId?: unknown; answer?: unknown },
): Promise<{ status: 'passed' | 'failed'; points: number }> {
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.police) fail('failed-precondition', `${t.policeCall.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status === 'lobby' || state.status === 'ended') fail('failed-precondition', `The game isn't running, so there is nothing to answer.`);
    const id = asId(data.callId, 'callId');
    const snap = await tx.get(db.doc(`policeCalls/${id}`));
    if (!snap.exists) fail('not-found', `No such ${t.policeCall.one}.`);
    const c = snap.data() as PoliceCall;
    if (c.uid !== uid) fail('permission-denied', `That ${t.policeCall.one} isn't yours.`);
    if (typeof data.answer !== 'string' || data.answer.trim().length < 1 || data.answer.length > ANSWER_MAX) {
      fail('invalid-argument', `Answer in 1 to ${ANSWER_MAX} characters.`);
    }
    if (c.status !== 'open' || ctx.now.getTime() >= millis(c.endsAt)) fail('failed-precondition', `Time's up for this one.`);
    if (c.channel === 'phone') fail('failed-precondition', 'The police are ringing your phone: answer it there. If the call never gets through, it comes here.');
    const settings = await loadSettings(db, tx);
    return scoreAnswer(tx, db, ctx.now, t, scoringFor(ctx.pack, settings, state, ctx.now), { ref: snap.ref, data: c }, player, data.answer);
  });
}

/** A trusted confidant tips off the police about another player, with a note; the target gets a 'tip' call. */
export async function tipOffPolice(db: Db, ctx: Ctx, data: { targetUid?: unknown; note?: unknown }): Promise<{ callId: string }> {
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.police) fail('failed-precondition', `${t.policeCall.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', `The game isn't running.`);
    const targetUid = asId(data.targetUid, 'targetUid');
    if (targetUid === uid) fail('invalid-argument', `You can't tip off the police about yourself.`);
    const note = typeof data.note === 'string' ? data.note.trim() : '';
    if (note.length < 1 || note.length > NOTE_MAX) fail('invalid-argument', `Say what you saw, in 1 to ${NOTE_MAX} characters.`);
    const settings = await loadSettings(db, tx);
    // Judged on the points they have right now, not the stored standing.
    if (standingOf(player.points, settings) !== 'confidant') fail('permission-denied', `Only a ${t.confidant.one} can tip off the police.`);
    const wait = cooldownLeftMs(player.lastSnitchedAt ? millis(player.lastSnitchedAt) : null, settings.policeTipEveryMin, ctx.now.getTime());
    if (wait > 0) fail('failed-precondition', `You can tip off the police again in ${Math.ceil(wait / MIN_MS)} min.`);

    const targetSnap = await tx.get(db.doc(`players/${targetUid}`));
    if (!targetSnap.exists) fail('not-found', 'No such player.');
    const target = targetSnap.data() as Player;
    if (!isPlaying(target)) fail('failed-precondition', `${target.displayName} has left the game.`);
    const theirs = await tx.get(db.collection('policeCalls').where('uid', '==', targetUid));
    if (theirs.docs.some((d) => d.get('status') === 'open')) fail('failed-precondition', `${target.displayName} is already being questioned.`);
    const book = await readLineBook(tx, db, settings, [targetUid]);

    const callId = openPoliceCall(
      tx,
      db,
      ctx.now,
      ctx.rng ?? Math.random,
      t,
      settings,
      { uid: targetUid, name: target.displayName, kind: 'tip', by: { uid, name: player.displayName }, note },
      book,
    );
    tx.update(db.doc(`players/${uid}`), { lastSnitchedAt: toTs(ctx.now) });
    flushLines(tx, db, ctx.now, t, book);
    return { callId };
  });
}
