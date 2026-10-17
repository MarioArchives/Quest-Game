// Police check-ins (packs with police), answered in the app. A person of interest gets a 'watch' call every
// settings.policeEveryMin (lastCheckedAt); a trusted confidant may tip off the police about another player once every
// settings.policeTipEveryMin (lastSnitchedAt). A right answer earns the call's passPoints; a wrong one, or none in
// time, costs its failPenalty.
import { getPack } from '../shared/packs/index.js';
import { termForms, type TermForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { cooldownLeftMs, isRightAnswer, policeQuestion } from '../shared/police.js';
import { standingOf } from '../shared/standing.js';
import type { Txn } from '../shared/store/types.js';
import type { PoliceCall, PoliceCallKind, Player, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { isQuietHours } from './globals.js';
import { fail, isPlaying, loadSettings, loadState, requirePlayer } from './guards.js';
import { applyScore, scoringFor } from './ledger.js';
import { MIN_MS, asId, millis, toTs } from './util.js';
import { readPlayers } from './voting.js';

/** What one timer run did: calls opened (watch), closed unanswered (missed) and called off (player left). */
export interface PoliceTickResult {
  opened: string[];
  missed: string[];
  cancelled: string[];
}

const NOTE_MAX = 200;
const ANSWER_MAX = 20;

/**
 * Opens a call on `uid` and posts it (the post pushes to that player only). Writes only: the caller has checked the
 * call is due and read nothing the writes depend on. A watch call also sets the player's lastCheckedAt; a tip's
 * sender's lastSnitchedAt is the caller's to set.
 */
export function openPoliceCall(
  tx: Txn,
  db: Db,
  now: Date,
  rng: () => number,
  t: TermForms,
  settings: Settings,
  call: { uid: string; name: string; kind: PoliceCallKind; by?: { uid: string; name: string }; note?: string },
): string {
  const ref = db.collection('policeCalls').doc();
  const { question, expected } = policeQuestion(rng);
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
  };
  tx.create(ref, doc);
  if (call.kind === 'watch') {
    tx.update(db.doc(`players/${call.uid}`), { lastCheckedAt: toTs(now) });
    addFeed(tx, db, now, {
      type: 'police-call',
      text: `${t.policeCall.One} for ${call.name}: ${question} ${settings.policeWindowMin} min to answer`,
      uid: call.uid,
      ref: ref.id,
    });
  } else {
    addFeed(tx, db, now, {
      type: 'police-tip',
      text: `${call.by!.name} tipped off the police about ${call.name}: ${question} ${settings.policeWindowMin} min to answer`,
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

/** The timer: closes calls whose time is up, calls off those of players who left, opens due watch calls. */
export async function runPolice(db: Db, now: Date, rng: () => number, pack: GamePack = getPack()): Promise<PoliceTickResult> {
  const none: PoliceTickResult = { opened: [], missed: [], cancelled: [] };
  if (!pack.features.police) return none;
  const t = termForms(pack.terms);
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status !== 'active') return none;
    const settings = await loadSettings(db, tx);
    const nowMs = now.getTime();
    const open = (await tx.get(db.collection('policeCalls').where('status', '==', 'open'))).docs;
    const players = await readPlayers(tx, db);
    const scoring = scoringFor(pack, settings, state, now);

    const result: PoliceTickResult = { opened: [], missed: [], cancelled: [] };
    const balances = new Map([...players].map(([uid, p]) => [uid, p.points]));
    const stillOpen = new Set<string>();
    for (const d of open) {
      const c = d.data() as PoliceCall;
      const player = players.get(c.uid);
      if (!isPlaying(player)) {
        tx.update(d.ref, { status: 'cancelled' });
        result.cancelled.push(d.id);
      } else if (millis(c.endsAt) <= nowMs) {
        tx.update(d.ref, { status: 'missed' });
        const { applied } = applyScore(
          tx, db, now, scoring, { kind: 'policeFailed', uid: c.uid, penalty: c.failPenalty, missed: true },
          new Map([[c.uid, balances.get(c.uid)!]]), { ref: d.id, by: 'system' },
        );
        const delta = applied.get(c.uid) ?? 0;
        balances.set(c.uid, balances.get(c.uid)! + delta);
        addFeed(tx, db, now, { type: 'police-result', text: resultText(t, player!.displayName, 'missed', delta), uid: c.uid, ref: d.id, points: delta });
        result.missed.push(d.id);
      } else {
        stillOpen.add(c.uid);
      }
    }

    if (isQuietHours(now, settings.quietHours, pack.timeZone)) return result;
    for (const [uid, player] of players) {
      if (!isPlaying(player) || stillOpen.has(uid) || standingOf(player.points, settings) !== 'poi') continue;
      const last = player.lastCheckedAt ? millis(player.lastCheckedAt) : null;
      if (cooldownLeftMs(last, settings.policeEveryMin, nowMs) > 0) continue;
      result.opened.push(openPoliceCall(tx, db, now, rng, t, settings, { uid, name: player.displayName, kind: 'watch' }));
    }
    return result;
  });
}

/** The end of the game: every open call is called off, with no fine. */
export async function cancelOpenPoliceCalls(db: Db, _now: Date): Promise<void> {
  await db.runTransaction(async (tx) => {
    const open = (await tx.get(db.collection('policeCalls').where('status', '==', 'open'))).docs;
    for (const d of open) tx.update(d.ref, { status: 'cancelled' });
  });
}

/** The player being checked answers their open call, once, before it ends. */
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
    const settings = await loadSettings(db, tx);

    const passed = isRightAnswer(data.answer, c.expected);
    const event = passed
      ? ({ kind: 'policePassed', uid, points: c.passPoints } as const)
      : ({ kind: 'policeFailed', uid, penalty: c.failPenalty, missed: false } as const);
    tx.update(snap.ref, { status: passed ? 'passed' : 'failed', answer: data.answer, answeredAt: toTs(ctx.now) });
    const { applied } = applyScore(tx, db, ctx.now, scoringFor(ctx.pack, settings, state, ctx.now), event, new Map([[uid, player.points]]), {
      ref: id,
      by: 'system',
    });
    const points = applied.get(uid) ?? 0;
    addFeed(tx, db, ctx.now, {
      type: 'police-result',
      text: resultText(t, player.displayName, passed ? 'passed' : 'failed', points),
      uid,
      ref: id,
      points,
    });
    return { status: passed ? ('passed' as const) : ('failed' as const), points };
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

    const callId = openPoliceCall(tx, db, ctx.now, ctx.rng ?? Math.random, t, settings, {
      uid: targetUid,
      name: target.displayName,
      kind: 'tip',
      by: { uid, name: player.displayName },
      note,
    });
    tx.update(db.doc(`players/${uid}`), { lastSnitchedAt: toTs(ctx.now) });
    return { callId };
  });
}
