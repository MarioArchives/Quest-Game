// Periodic missions (packs with checkins). The GM keeps any number of series (periodics/{id}); while one is running,
// the timer sends a check-in (checkins/{id}) every intervalMin, up to its count. Everyone answers with a photo or a
// comment before it closes; answering earns nothing, and whoever could have answered and didn't loses the fine the
// check-in opened with. The GM can also fire a series' next one now, end an open one early, stop, start, edit and
// delete a series (managePeriodic).
import { drawTemplate } from '../shared/draw.js';
import { getPack } from '../shared/packs/index.js';
import { termForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { cleanPeriodic, periodicDone, periodicProblems, PERIODIC_LIMITS, type PeriodicFields } from '../shared/periodics.js';
import type { DocSnap, Txn } from '../shared/store/types.js';
import type { Checkin, CheckinAnswer, GameState, Periodic, Player } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { parseEvidence } from './evidence.js';
import { addFeed } from './feed.js';
import { isQuietHours } from './globals.js';
import { fail, isPlaying, loadSettings, loadState, requireGM, requirePlayer } from './guards.js';
import { applyScore, scoringFor, type Scoring } from './ledger.js';
import { MIN_MS, asId, millis, toTs } from './util.js';
import { readPlayers } from './voting.js';

/** "Roll call" → "roll call" inside a sentence; an acronym ("GM check") stays as it is. */
export const midSentence = (name: string): string => (/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

/** "Maya", "Maya and Sam", "Maya, Sam and Jonah". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The closing post: who missed it, that everyone answered, or that the GM called it off. */
export function closedText(name: string, missed: string[], penalty: number, by: 'time' | 'gm-charge' | 'gm-free'): string {
  if (by === 'gm-free') return `${name} was ended early by the GM, no fines`;
  if (missed.length === 0) return `${name} closed: everyone answered`;
  const fine = penalty > 0 ? ` (−${penalty}${missed.length > 1 ? ' each' : ''})` : '';
  return `${name} closed: ${listNames(missed)} didn't answer${fine}`;
}

/** A prompt from the series, preferring ones it hasn't asked yet. */
function drawPrompt(p: Periodic, asked: string[], rng: () => number): string {
  return drawTemplate(p.prompts.map((id) => ({ id })), asked, rng)?.id ?? p.prompts[0]!;
}

/** Opens the series' next check-in and posts it (the post pushes to everyone). Writes only; returns its id. */
function openCheckin(tx: Txn, db: Db, now: Date, series: { id: string; data: Periodic }, prompt: string): string {
  const ref = db.collection('checkins').doc();
  const p = series.data;
  const checkin: Checkin = {
    periodicId: series.id,
    name: p.name,
    prompt,
    number: p.sent + 1,
    startsAt: toTs(now),
    endsAt: toTs(new Date(now.getTime() + p.windowMin * MIN_MS)),
    status: 'open',
    penalty: p.penalty,
    missedUids: [],
  };
  tx.create(ref, checkin);
  addFeed(tx, db, now, { type: 'checkin-open', text: `${p.name}: ${prompt}`, uid: null, ref: ref.id, questTitle: prompt });
  const sent = p.sent + 1;
  const done = p.count > 0 && sent >= p.count;
  tx.update(db.doc(`periodics/${series.id}`), {
    sent,
    // A series that has sent its last one stops; a running one goes again an interval from now.
    ...(done ? { status: 'stopped', nextAt: null } : p.status === 'running' ? { nextAt: toTs(new Date(now.getTime() + p.intervalMin * MIN_MS)) } : {}),
  });
  return ref.id;
}

/**
 * Closes an open check-in. With `charge`, everyone who could have answered and didn't (still playing, joined by the
 * time it opened, no answer) loses its fine and is named in the closing post; without it (the GM calling it off),
 * nobody is charged. Writes only: the caller reads the answers and players first.
 */
function closeCheckin(
  tx: Txn,
  db: Db,
  now: Date,
  scoring: Scoring,
  doc: DocSnap,
  answered: Set<string>,
  players: Map<string, Player>,
  by: 'time' | 'gm-charge' | 'gm-free',
): void {
  const c = doc.data() as Checkin;
  const opened = millis(c.startsAt);
  const missed: string[] = [];
  if (by !== 'gm-free') {
    for (const [uid, player] of players) {
      if (answered.has(uid) || !isPlaying(player)) continue;
      if (player.joinedAt && millis(player.joinedAt) > opened) continue;
      missed.push(uid);
      if (c.penalty > 0) {
        applyScore(tx, db, now, scoring, { kind: 'checkinMissed', uid, penalty: c.penalty }, new Map([[uid, player.points]]), { ref: doc.id, by: 'system' });
      }
    }
  }
  tx.update(doc.ref, { status: 'closed', missedUids: missed, endedBy: by === 'time' ? 'time' : 'gm' });
  const names = missed.map((uid) => players.get(uid)?.displayName ?? 'A player').sort((a, b) => a.localeCompare(b));
  addFeed(tx, db, now, { type: 'checkin-closed', text: closedText(c.name, names, c.penalty, by), uid: null, ref: doc.id, questTitle: c.prompt });
}

const answersOf = async (tx: Txn, db: Db, id: string) => new Set((await tx.get(db.collection(`checkins/${id}/answers`))).docs.map((a) => a.id));

export interface CheckinTickResult {
  opened: string[];
  closed: string[];
}

/**
 * The periodic-mission half of the timer (scheduled function, dev ticker, mock), while the game runs: closes the
 * check-ins whose time is up, then sends each running series' next one when it is due (not while one of its own is
 * still open, not in quiet hours). A running series with no time yet gets one an interval from now.
 */
export async function runPeriodics(db: Db, now: Date, rng: () => number, pack: GamePack = getPack()): Promise<CheckinTickResult> {
  const none: CheckinTickResult = { opened: [], closed: [] };
  if (!pack.features.checkins) return none;
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status !== 'active') return none;
    const settings = await loadSettings(db, tx);
    const nowMs = now.getTime();

    const checkins = (await tx.get(db.collection('checkins'))).docs;
    const series = (await tx.get(db.collection('periodics'))).docs.map((d) => ({ id: d.id, data: d.data() as Periodic }));
    const due = checkins.filter((d) => d.get('status') === 'open' && millis(d.get('endsAt')) <= nowMs);
    const answered = new Map<string, Set<string>>();
    for (const d of due) answered.set(d.id, await answersOf(tx, db, d.id));
    const players = due.length > 0 ? await readPlayers(tx, db) : new Map<string, Player>();
    const scoring = scoringFor(pack, settings, state, now);

    const result: CheckinTickResult = { opened: [], closed: [] };
    for (const d of due) {
      closeCheckin(tx, db, now, scoring, d, answered.get(d.id)!, players, 'time');
      result.closed.push(d.id);
    }

    const quiet = isQuietHours(now, settings.quietHours, pack.timeZone);
    for (const s of series) {
      if (s.data.status !== 'running' || periodicDone(s.data)) continue;
      if (s.data.nextAt == null) {
        tx.update(db.doc(`periodics/${s.id}`), { nextAt: toTs(new Date(nowMs + s.data.intervalMin * MIN_MS)) });
        continue;
      }
      const mine = checkins.filter((d) => d.get('periodicId') === s.id);
      const busy = mine.some((d) => d.get('status') === 'open' && !due.includes(d));
      if (millis(s.data.nextAt) > nowMs || busy || quiet) continue;
      const prompt = drawPrompt(s.data, mine.map((d) => d.get('prompt') as string), rng);
      result.opened.push(openCheckin(tx, db, now, s, prompt));
    }
    return result;
  });
}

/** A player answers an open check-in with a photo and/or a comment, once, before its time is up. */
export async function answerCheckin(
  db: Db,
  ctx: Ctx,
  data: { checkinId?: unknown; imagePath?: unknown; thumbPath?: unknown; caption?: unknown },
): Promise<{ ok: true }> {
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.checkins) fail('failed-precondition', `${t.checkin.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status === 'lobby' || state.status === 'ended') fail('failed-precondition', `The game isn't running, so there is nothing to answer.`);
    const id = asId(data.checkinId, 'checkinId');
    const snap = await tx.get(db.doc(`checkins/${id}`));
    if (!snap.exists) fail('not-found', `No such ${t.checkin.one}.`);
    const c = snap.data() as Checkin;
    if (c.status !== 'open' || ctx.now.getTime() >= millis(c.endsAt)) fail('failed-precondition', `Time's up for this one.`);
    const evidence = parseEvidence(uid, data);
    const answerRef = db.doc(`checkins/${id}/answers/${uid}`);
    if ((await tx.get(answerRef)).exists) fail('already-exists', 'You have already answered this one.');

    const answer = { imagePath: evidence.imagePath ?? null, thumbPath: evidence.thumbPath ?? null, caption: evidence.caption ?? null };
    const feedId = addFeed(tx, db, ctx.now, {
      type: 'checkin-answer',
      text: `${player.displayName} answered the ${midSentence(c.name)}`,
      uid,
      ref: id,
      questTitle: c.prompt,
      photoURL: player.photoURL ?? null,
      ...answer,
    });
    const doc: CheckinAnswer = { uid, ...answer, createdAt: toTs(ctx.now), feedId };
    tx.create(answerRef, doc);
    return { ok: true as const };
  });
}

export type PeriodicAction = 'create' | 'update' | 'start' | 'stop' | 'fire' | 'end' | 'delete';

/** What the GM sends: `fields` for create (all) and update (any); `prompt` to override fire's; `checkinId` and `charge` for end. */
export interface ManagePeriodicInput {
  action?: unknown;
  id?: unknown;
  fields?: unknown;
  /** create: start running straight away (default true). */
  start?: unknown;
  prompt?: unknown;
  checkinId?: unknown;
  charge?: unknown;
}

const FIELD_KEYS = ['name', 'prompts', 'intervalMin', 'windowMin', 'penalty', 'count'] as const;

function readFields(raw: unknown, base?: PeriodicFields): PeriodicFields {
  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) fail('invalid-argument', 'fields must be an object.');
  const given = (raw ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const k of FIELD_KEYS) if (given[k] !== undefined) merged[k] = given[k];
  const problems = periodicProblems(merged);
  if (problems.length > 0) fail('invalid-argument', problems[0]!);
  return cleanPeriodic(merged as unknown as PeriodicFields);
}

/**
 * The GM manages periodic missions:
 * - `create` a series (running straight away unless `start: false`; the first one goes an interval later),
 * - `update` its fields (a new interval restarts a running series' clock),
 * - `start` / `stop` its timer (stopping leaves an open one open),
 * - `fire` its next one now (while the game runs; counts towards its number and restarts its clock),
 * - `end` an open check-in early, with fines (`charge: true`) or without,
 * - `delete` it (not while one of its check-ins is open; past ones stay in the feed).
 */
export async function managePeriodic(db: Db, ctx: Ctx, data: ManagePeriodicInput): Promise<{ id: string }> {
  const { pack } = ctx;
  const t = termForms(pack.terms);
  if (!pack.features.checkins) fail('failed-precondition', `${t.checkin.Many} are not part of this game.`);
  const action = data?.action as PeriodicAction;
  if (!['create', 'update', 'start', 'stop', 'fire', 'end', 'delete'].includes(action)) fail('invalid-argument', 'Unknown action.');
  const now = ctx.now;
  const nowMs = now.getTime();
  const later = (min: number) => toTs(new Date(nowMs + min * MIN_MS));

  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);

    if (action === 'create') {
      const fields = readFields(data.fields ?? {});
      const running = data.start !== false;
      const ref = db.collection('periodics').doc();
      const doc: Periodic = { ...fields, sent: 0, status: running ? 'running' : 'stopped', nextAt: running ? later(fields.intervalMin) : null, createdAt: toTs(now) };
      tx.create(ref, doc);
      return { id: ref.id };
    }

    if (action === 'end') {
      const checkinId = asId(data.checkinId, 'checkinId');
      const snap = await tx.get(db.doc(`checkins/${checkinId}`));
      if (!snap.exists) fail('not-found', `No such ${t.checkin.one}.`);
      if (snap.get('status') !== 'open') fail('failed-precondition', 'That one has already closed.');
      const charge = data.charge === true;
      const answered = charge ? await answersOf(tx, db, checkinId) : new Set<string>();
      const players = charge ? await readPlayers(tx, db) : new Map<string, Player>();
      const state = await loadState(db, tx);
      const settings = await loadSettings(db, tx);
      closeCheckin(tx, db, now, scoringFor(pack, settings, state, now), snap, answered, players, charge ? 'gm-charge' : 'gm-free');
      return { id: checkinId };
    }

    const id = asId(data.id, 'id');
    const ref = db.doc(`periodics/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) fail('not-found', `No such ${t.checkin.one}.`);
    const p = snap.data() as Periodic;
    const own = (await tx.get(db.collection('checkins').where('periodicId', '==', id))).docs;
    const open = own.some((d) => d.get('status') === 'open');

    switch (action) {
      case 'update': {
        const fields = readFields(data.fields, p);
        const restart = p.status === 'running' && fields.intervalMin !== p.intervalMin;
        tx.update(ref, { ...fields, ...(restart ? { nextAt: later(fields.intervalMin) } : {}) });
        break;
      }
      case 'start':
        if (periodicDone(p)) fail('failed-precondition', `All ${p.count} have been sent. Raise how many to send more.`);
        tx.update(ref, { status: 'running', nextAt: later(p.intervalMin) });
        break;
      case 'stop':
        tx.update(ref, { status: 'stopped', nextAt: null });
        break;
      case 'fire': {
        const state: GameState = await loadState(db, tx);
        if (state.status !== 'active') fail('failed-precondition', `${t.checkin.Many} can only be sent while the game is running.`);
        if (open) fail('failed-precondition', `"${p.name}" already has one open. End it first, or wait for it to close.`);
        if (periodicDone(p)) fail('failed-precondition', `All ${p.count} have been sent. Raise how many to send more.`);
        let prompt: string | null = null;
        if (data.prompt !== undefined && data.prompt !== null) {
          if (typeof data.prompt !== 'string' || data.prompt.trim().length < 1 || data.prompt.trim().length > PERIODIC_LIMITS.promptMax) {
            fail('invalid-argument', `The prompt must be 1 to ${PERIODIC_LIMITS.promptMax} characters.`);
          }
          prompt = (data.prompt as string).trim();
        }
        openCheckin(tx, db, now, { id, data: p }, prompt ?? drawPrompt(p, own.map((d) => d.get('prompt') as string), ctx.rng ?? Math.random));
        break;
      }
      case 'delete':
        if (open) fail('failed-precondition', `"${p.name}" has one open. End it first.`);
        tx.delete(ref);
        break;
    }
    return { id };
  });
}
