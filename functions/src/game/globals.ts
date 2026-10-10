import type { QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import type { GlobalQuest, GlobalQuestSource, QuietHours, Settings } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, loadState, requireGM } from './guards.js';
import { MIN_MS, millis, nextGlobalTime, toTs } from './util.js';
import {
  closeEntries,
  closeWithTally,
  attachPosts,
  finishChecking,
  readAllEntries,
  readGMs,
  readPlayers,
  readVotes,
  type Entry,
  type Quest,
} from './voting.js';

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** True when `now`, in the given time zone, falls inside [start, end) — which may wrap past midnight. */
export function isQuietHours(now: Date, quiet: QuietHours | null, timeZone = 'Europe/London'): boolean {
  if (!quiet) return false;
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === null || end === null) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = (num('hour') % 24) * 60 + num('minute');
  return start <= end ? local >= start && local < end : local >= start || local < end;
}

interface Picked {
  id: string;
  title: string;
  description: string;
  windowMin: number | null;
}

/** An active global template, preferring ones no side quest has used yet. Reads only. */
async function chooseGlobalTemplate(
  tx: Transaction,
  db: Db,
  existing: QueryDocumentSnapshot[],
  rng: () => number,
): Promise<Picked | null> {
  const snap = await tx.get(db.collection('questTemplates').where('scope', '==', 'global').where('active', '==', true));
  const candidates = snap.docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return null;
  const used = new Set(existing.map((q) => q.get('templateId') as string | null));
  const fresh = candidates.filter((d) => !used.has(d.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const doc = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return {
    id: doc.id,
    title: doc.get('title'),
    description: doc.get('description'),
    windowMin: (doc.get('windowMin') as number | null) ?? null,
  };
}

interface OpenSpec {
  title: string;
  description: string;
  bonusPoints: number;
  source: GlobalQuestSource;
  templateId: string | null;
  windowMin: number;
}

/** Creates a live side quest, schedules the next timer quest and announces it. Returns the new id. */
function openGlobalQuest(tx: Transaction, db: Db, now: Date, rng: () => number, settings: Settings, spec: OpenSpec): string {
  const ref = db.collection('globalQuests').doc();
  const quest: GlobalQuest = {
    title: spec.title,
    description: spec.description,
    bonusPoints: spec.bonusPoints,
    source: spec.source,
    templateId: spec.templateId,
    startsAt: toTs(now),
    endsAt: toTs(new Date(now.getTime() + spec.windowMin * MIN_MS)),
    status: 'live',
    votingEndsAt: null,
    winnerUids: [],
    winningSubmissionIds: [],
    tally: null,
  };
  tx.create(ref, quest);
  tx.update(db.doc('game/state'), { nextGlobalQuestAt: toTs(nextGlobalTime(now, settings, rng)) });
  addFeed(tx, db, now, {
    type: 'global-open',
    text: `New side quest: ${spec.title}`,
    uid: null,
    ref: ref.id,
    questTitle: spec.title,
  });
  return ref.id;
}

function fromTemplate(t: Picked, settings: Settings, source: GlobalQuestSource): OpenSpec {
  return {
    title: t.title,
    description: t.description,
    bonusPoints: settings.sideQuestPoints,
    source,
    templateId: t.id,
    windowMin: t.windowMin ?? settings.globalWindowMin,
  };
}

const asQuest = (doc: QueryDocumentSnapshot): Quest => ({ id: doc.id, ref: doc.ref, gq: doc.data() as GlobalQuest });

/** What one tick did: the side quest it opened, and the ones it closed, sent to checking or opened for voting. */
export interface TickResult {
  opened: string | null;
  closed: string[];
  checking: string[];
  voting: string[];
}

/** The scheduled job (every 15 min) and the dev ticker both call this. */
export async function runTick(db: Db, now: Date, rng: () => number): Promise<TickResult> {
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status !== 'active') return { opened: null, closed: [], checking: [], voting: [] };
    const settings = await loadSettings(db, tx);

    const nowMs = now.getTime();
    const quests = (await tx.get(db.collection('globalQuests'))).docs;
    const live = quests.filter((q) => q.get('status') === 'live');
    const expired = live.filter((q) => millis(q.get('endsAt')) <= nowMs);
    const running = live.filter((q) => !expired.includes(q));
    // Checking that ran out of time: the unchecked entries go to the vote anyway.
    const checkingOver = quests.filter(
      (q) => q.get('status') === 'checking' && q.get('checkingEndsAt') && millis(q.get('checkingEndsAt')) <= nowMs,
    );
    const votingOver = quests.filter((q) => q.get('status') === 'voting' && q.get('votingEndsAt') && millis(q.get('votingEndsAt')) <= nowMs);

    const nextAt = state.nextGlobalQuestAt;
    const due = !isQuietHours(now, settings.quietHours) && (nextAt == null || millis(nextAt) <= nowMs);
    const template = due ? await chooseGlobalTemplate(tx, db, quests, rng) : null;

    // Only one quest at a time: whatever is still running makes way for the new one.
    const moveOn = [...expired, ...(template ? running : [])];
    const touched = moveOn.length + checkingOver.length + votingOver.length;
    const entries = touched > 0 ? await readAllEntries(tx, db) : new Map<string, Entry[]>();
    await attachPosts(tx, db, [...moveOn, ...checkingOver].flatMap((q) => entries.get(q.id) ?? []));
    const gms = moveOn.length > 0 ? await readGMs(tx, db) : [];
    const votes = new Map<string, Map<string, string>>();
    for (const q of votingOver) votes.set(q.id, await readVotes(tx, db, q.id));
    const players = votingOver.length > 0 ? await readPlayers(tx, db) : new Map();

    const result: TickResult = { opened: null, closed: [], checking: [], voting: [] };
    for (const doc of moveOn) {
      result[closeEntries(tx, db, now, settings, asQuest(doc), entries.get(doc.id) ?? [], gms)].push(doc.id);
    }
    for (const doc of checkingOver) {
      result[finishChecking(tx, db, now, settings, asQuest(doc), entries.get(doc.id) ?? [])].push(doc.id);
    }
    for (const doc of votingOver) {
      closeWithTally(tx, db, now, settings, asQuest(doc), entries.get(doc.id) ?? [], votes.get(doc.id) ?? new Map(), players);
      result.closed.push(doc.id);
    }
    if (template) result.opened = openGlobalQuest(tx, db, now, rng, settings, fromTemplate(template, settings, 'timer'));
    return result;
  });
}

export type FireGlobalInput =
  | { mode?: 'random' }
  | {
      mode: 'custom';
      title?: unknown;
      description?: unknown;
      windowMin?: unknown;
      points?: unknown;
    };

function parseCustom(data: Record<string, unknown>): OpenSpec {
  const bad = (message: string): never => fail('invalid-argument', message);
  if (typeof data.title !== 'string') bad('Enter a title.');
  const title = (data.title as string).trim();
  if (title.length < 1 || title.length > 80) bad('The title must be 1 to 80 characters.');
  if (typeof data.description !== 'string' || data.description.length > 500) bad('The description must be text of at most 500 characters.');
  const windowMin = data.windowMin;
  if (typeof windowMin !== 'number' || !Number.isInteger(windowMin) || windowMin < 5 || windowMin > 180) {
    bad('The window must be a whole number of minutes from 5 to 180.');
  }
  const points = data.points;
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 0) bad('Points must be a whole number, 0 or more.');
  return {
    title,
    description: (data.description as string).trim(),
    bonusPoints: points as number,
    source: 'gm-custom',
    templateId: null,
    windowMin: windowMin as number,
  };
}

/** GM opens a side quest now: random from global templates, or a custom one. */
export async function fireGlobalQuest(db: Db, ctx: Ctx, data: FireGlobalInput): Promise<{ globalQuestId: string }> {
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Side quests can only be fired while the game is running.');

    const input = data as Record<string, unknown>;
    const mode = input.mode ?? 'random';
    if (mode !== 'random' && mode !== 'custom') fail('invalid-argument', "mode must be 'random' or 'custom'.");
    const custom = mode === 'custom' ? parseCustom(input) : null;

    const settings = await loadSettings(db, tx);
    const quests = (await tx.get(db.collection('globalQuests'))).docs;
    let spec: OpenSpec;
    if (custom) {
      spec = custom;
    } else {
      const template = await chooseGlobalTemplate(tx, db, quests, rng);
      if (!template) fail('failed-precondition', 'There are no active global quest templates.');
      spec = fromTemplate(template, settings, 'gm-random');
    }

    // Only one quest at a time: the current live one moves on first (to checking or voting if anyone entered).
    const live = quests.filter((q) => q.get('status') === 'live');
    const entries = live.length > 0 ? await readAllEntries(tx, db) : new Map<string, Entry[]>();
    await attachPosts(tx, db, live.flatMap((q) => entries.get(q.id) ?? []));
    const gms = live.length > 0 ? await readGMs(tx, db) : [];
    for (const doc of live) closeEntries(tx, db, ctx.now, settings, asQuest(doc), entries.get(doc.id) ?? [], gms, ctx.uid);
    return { globalQuestId: openGlobalQuest(tx, db, ctx.now, rng, settings, spec) };
  });
}
