import type { DocSnap, Txn } from '../shared/store/types.js';
import { drawTemplate } from '../shared/draw.js';
import { getPack } from '../shared/packs/index.js';
import { termForms } from '../shared/packs/terms.js';
import type { GamePack, StoryQuest } from '../shared/packs/types.js';
import type { StoryEntry } from '../shared/types.js';
import { derange } from '../shared/derange.js';
import type { GlobalQuest, GlobalQuestSource, Judging, Player, QuietHours, Settings, Vote } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, isPlaying, loadSettings, loadState, requireGM } from './guards.js';
import { MIN_MS, millis, nextGlobalTime, toTs } from './util.js';
import { scoringFor, type Scoring } from './ledger.js';
import {
  attachPosts,
  closeWithTally,
  moveOn,
  openVoteNow,
  readAllEntries,
  readEntries,
  readMoveOn,
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
export function isQuietHours(now: Date, quiet: QuietHours | null, timeZone: string): boolean {
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

const picked = (doc: DocSnap): Picked => ({
  id: doc.id,
  title: doc.get('title') as string,
  description: doc.get('description') as string,
  windowMin: (doc.get('windowMin') as number | null) ?? null,
});

/** An active global template, preferring ones no side quest has used yet. Reads only. */
async function chooseGlobalTemplate(
  tx: Txn,
  db: Db,
  existing: DocSnap[],
  rng: () => number,
): Promise<Picked | null> {
  const snap = await tx.get(db.collection('questTemplates').where('scope', '==', 'global').where('active', '==', true));
  const doc = drawTemplate(
    snap.docs,
    existing.map((q) => q.get('templateId') as string | null),
    rng,
  );
  return doc ? picked(doc) : null;
}

interface OpenSpec {
  title: string;
  description: string;
  bonusPoints: number;
  source: GlobalQuestSource;
  templateId: string | null;
  windowMin: number;
  /** A story mission's own fields (see GlobalQuest); a random or custom side quest leaves them out. */
  story?: {
    storyId: string;
    judging: Judging;
    skipPenalty: number;
    fastestBonus: number;
    longRun?: boolean;
    entry?: StoryEntry;
    votePoints?: number;
    tieBonus?: number;
    records?: { key: string; label: string };
    question?: string | null;
  };
}

/** Creates a live side quest, schedules the next timer quest and announces it. Returns the new id. */
function openGlobalQuest(
  tx: Txn,
  db: Db,
  now: Date,
  rng: () => number,
  pack: GamePack,
  settings: Settings,
  spec: OpenSpec,
): string {
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
    ...(spec.story ? { ...spec.story, gmChecks: false } : {}),
  };
  tx.create(ref, quest);
  tx.update(db.doc('game/state'), { nextGlobalQuestAt: toTs(nextGlobalTime(now, settings, rng)) });
  addFeed(tx, db, now, {
    type: 'global-open',
    text: `New ${termForms(pack.terms).sideQuest.one}: ${spec.title}`,
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

const asQuest = (doc: DocSnap): Quest => ({ id: doc.id, ref: doc.ref, gq: doc.data() as GlobalQuest });

/** What one tick did: the side quest it opened, the ones whose time was up (sent to checking), and the votes it closed. */
export interface TickResult {
  opened: string | null;
  closed: string[];
  checking: string[];
}

/** The scheduled job (every 15 min) and the dev ticker both call this. */
export async function runTick(db: Db, now: Date, rng: () => number, pack: GamePack = getPack()): Promise<TickResult> {
  if (!pack.features.sideQuests) return { opened: null, closed: [], checking: [] };
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status !== 'active') return { opened: null, closed: [], checking: [] };
    const settings = await loadSettings(db, tx);

    const nowMs = now.getTime();
    const quests = (await tx.get(db.collection('globalQuests'))).docs;
    const live = quests.filter((q) => q.get('status') === 'live');
    const expired = live.filter((q) => millis(q.get('endsAt')) <= nowMs);
    // A long-running mission is never moved on by another (it waits for its own deadline), and it does not hold back random drops.
    const running = live.filter((q) => !expired.includes(q) && !q.get('longRun'));
    // Checking never runs out: only a GM opens the vote.
    const votingOver = quests.filter((q) => q.get('status') === 'voting' && q.get('votingEndsAt') && millis(q.get('votingEndsAt')) <= nowMs);

    // A due random drop needs the timer on, and waits while a story mission is still open for entries.
    const nextAt = state.nextGlobalQuestAt;
    const storyOpen = running.some((q) => q.get('storyId'));
    const due =
      settings.autoSideQuests !== false &&
      !storyOpen &&
      !isQuietHours(now, settings.quietHours, pack.timeZone) &&
      (nextAt == null || millis(nextAt) <= nowMs);
    const template = due ? await chooseGlobalTemplate(tx, db, quests, rng) : null;

    // Only one live quest at a time: whatever is still running makes way for the new one (late entries still count).
    const moving = [...expired, ...(template ? running : [])].map(asQuest);
    const move = await readMoveOn(tx, db, moving, votingOver.length > 0);
    const entries = votingOver.length > 0 ? await readAllEntries(tx, db) : new Map<string, Entry[]>();
    const votes = new Map<string, Map<string, Vote>>();
    for (const q of votingOver) votes.set(q.id, await readVotes(tx, db, q.id));
    const scoring = scoringFor(pack, settings, state, now);

    const result: TickResult = { opened: null, closed: [], checking: [] };
    for (const q of moving) {
      const status = moveOn(tx, db, now, pack, settings, scoring, q, move);
      if (status === 'checking') result.checking.push(q.id);
      else if (status === 'closed') result.closed.push(q.id);
    }
    for (const doc of votingOver) {
      closeWithTally(tx, db, now, pack, scoring, asQuest(doc), entries.get(doc.id) ?? [], votes.get(doc.id) ?? new Map(), move.players);
      result.closed.push(doc.id);
    }
    if (template) result.opened = openGlobalQuest(tx, db, now, rng, pack, settings, fromTemplate(template, settings, 'timer'));
    return result;
  });
}

interface GmFields {
  title?: unknown;
  description?: unknown;
  windowMin?: unknown;
  points?: unknown;
}

/** A story mission from the pack's list; anything left out falls back to the story's own value, then to the settings. */
interface StoryFields extends GmFields {
  storyId?: unknown;
  judging?: unknown;
  fastestBonus?: unknown;
  penalty?: unknown;
}

export type FireGlobalInput =
  | { mode?: 'random' }
  | ({ mode: 'story' } & StoryFields)
  | ({ mode: 'custom' } & GmFields)
  /** One the GM drew and looked at first (see `drawTemplate`), sent as it is or with their edits. */
  | ({ mode: 'template'; templateId?: unknown } & GmFields);

interface Fields {
  title: string;
  description: string;
  windowMin: number;
  points: number;
}

/**
 * The GM's title, description, window and points. In custom mode every field is required; with a `base` (the
 * template's own values) a field left out keeps the base value, and every field given is checked the same way.
 */
function parseFields(data: Record<string, unknown>, base?: Fields, maxWindow = 180): Fields {
  const bad = (message: string): never => fail('invalid-argument', message);
  const given = (key: keyof GmFields) => base === undefined || data[key] !== undefined;
  let title = base?.title ?? '';
  if (given('title')) {
    if (typeof data.title !== 'string') bad('Enter a title.');
    title = (data.title as string).trim();
    if (title.length < 1 || title.length > 80) bad('The title must be 1 to 80 characters.');
  }
  let description = base?.description ?? '';
  if (given('description')) {
    if (typeof data.description !== 'string' || data.description.length > 500) bad('The description must be text of at most 500 characters.');
    description = (data.description as string).trim();
  }
  let windowMin = base?.windowMin ?? 0;
  if (given('windowMin')) {
    const w = data.windowMin;
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 5 || w > maxWindow) bad(`The window must be a whole number of minutes from 5 to ${maxWindow}.`);
    windowMin = w as number;
  }
  let points = base?.points ?? 0;
  if (given('points')) {
    const p = data.points;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) bad('Points must be a whole number, 0 or more.');
    points = p as number;
  }
  return { title, description, windowMin, points };
}

/** A whole number, 0 or more, when given (null counts as not given). */
function parseCount(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail('invalid-argument', `${what} must be a whole number, 0 or more.`);
  return value as number;
}

/** The story mission's fields: the GM's changes over the story's own values over the settings. */
function storySpec(input: Record<string, unknown>, story: StoryQuest, settings: Settings): OpenSpec {
  const f = parseFields(
    input,
    {
      title: story.title,
      description: story.description,
      windowMin: story.windowMin ?? settings.globalWindowMin,
      points: story.points ?? settings.sideQuestPoints,
    },
    story.longRun ? 720 : 180,
  );
  const judging = input.judging ?? story.judging;
  if (judging !== 'vote' && judging !== 'submit') fail('invalid-argument', "Judging must be 'vote' or 'submit'.");
  const fastestBonus = parseCount(input.fastestBonus, 'The fastest bonus') ?? story.fastestBonus ?? 0;
  const skipPenalty = parseCount(input.penalty, 'The fine') ?? story.penalty ?? settings.sideQuestSkipPenalty;
  return {
    title: f.title,
    description: f.description,
    bonusPoints: f.points,
    source: 'story',
    templateId: null,
    windowMin: f.windowMin,
    story: {
      storyId: story.id,
      judging: judging as Judging,
      skipPenalty,
      fastestBonus,
      ...(story.longRun ? { longRun: true } : {}),
      ...(story.entry ? { entry: story.entry } : {}),
      ...(story.votePoints != null ? { votePoints: story.votePoints } : {}),
      ...(story.tieBonus != null ? { tieBonus: story.tieBonus } : {}),
      ...(story.records ? { records: story.records } : {}),
      question: story.question ?? null,
    },
  };
}

function parseCustom(data: Record<string, unknown>): OpenSpec {
  const f = parseFields(data);
  return { title: f.title, description: f.description, bonusPoints: f.points, source: 'gm-custom', templateId: null, windowMin: f.windowMin };
}

/**
 * The GM opens a side quest now: random from the global templates, a template they drew and looked at first
 * (as it is or edited; it still counts as used, so the timer won't repeat it soon), or a custom one.
 */
export async function fireGlobalQuest(db: Db, ctx: Ctx, data: FireGlobalInput): Promise<{ globalQuestId: string }> {
  const { pack } = ctx;
  const t = termForms(pack.terms);
  if (!pack.features.sideQuests) fail('failed-precondition', `${t.sideQuest.Many} are not part of this game.`);
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', `${t.sideQuest.Many} can only be fired while the game is running.`);

    const input = data as Record<string, unknown>;
    const mode = input.mode ?? 'random';
    if (mode !== 'random' && mode !== 'custom' && mode !== 'template' && mode !== 'story') {
      fail('invalid-argument', "mode must be 'random', 'custom', 'template' or 'story'.");
    }
    const storyId = input.storyId;
    if (mode === 'story' && (typeof storyId !== 'string' || storyId.length === 0)) fail('invalid-argument', 'Say which story mission to fire.');
    const custom = mode === 'custom' ? parseCustom(input) : null;
    const templateId = input.templateId;
    if (mode === 'template' && (typeof templateId !== 'string' || templateId.length === 0 || templateId.includes('/'))) {
      fail('invalid-argument', 'Say which template to fire.');
    }

    const settings = await loadSettings(db, tx);
    const quests = (await tx.get(db.collection('globalQuests'))).docs;
    let spec: OpenSpec;
    let announcement: StoryQuest | null = null;
    let dealt: Record<string, string> | null = null;
    if (custom) {
      spec = custom;
    } else if (mode === 'story') {
      const story = (pack.catalogue.story ?? []).find((q) => q.id === storyId);
      if (!story) fail('not-found', `That story mission is not in this game.`);
      if (story!.kind === 'announce') {
        announcement = story!;
      } else if (quests.some((q) => q.get('storyId') === storyId && q.get('status') !== 'closed')) {
        fail('failed-precondition', `That story mission is already running.`);
      }
      spec = announcement ? ({} as OpenSpec) : storySpec(input, story!, settings);
      if (story!.entry?.tag === 'assigned') {
        // Everyone still playing is dealt another player to write about (or tag); it needs at least two.
        const players = await readPlayers(tx, db);
        const playing = [...players].filter(([, p]) => isPlaying(p)).map(([uid]) => uid);
        if (playing.length < 2) fail('failed-precondition', `At least two players are needed to deal each one another.`);
        dealt = derange(playing, rng);
      }
    } else if (mode === 'template') {
      const doc = await tx.get(db.doc(`questTemplates/${templateId as string}`));
      if (!doc.exists) fail('not-found', `That ${t.sideQuest.one} is no longer in the templates.`);
      if (doc.get('scope') !== 'global' || doc.get('active') !== true) fail('failed-precondition', `That template isn't an active ${t.sideQuest.one}.`);
      const template = fromTemplate(picked(doc), settings, 'gm-random');
      const f = parseFields(input, {
        title: template.title,
        description: template.description,
        windowMin: template.windowMin,
        points: template.bonusPoints,
      });
      spec = { ...template, title: f.title, description: f.description, windowMin: f.windowMin, bonusPoints: f.points };
    } else {
      const template = await chooseGlobalTemplate(tx, db, quests, rng);
      if (!template) fail('failed-precondition', `There are no active global ${t.quest.one} templates.`);
      spec = fromTemplate(template, settings, 'gm-random');
    }

    const scoring = scoringFor(pack, settings, state, ctx.now);
    if (announcement) return { globalQuestId: await fireAnnouncement(tx, db, ctx.now, settings, scoring, announcement, quests) };

    // Only one live quest at a time: the current one moves on first, by its own mode (a random one to checking,
    // where late entries still count; a story vote to voting; a story submission is scored). A long-running one stays.
    const live = quests.filter((q) => q.get('status') === 'live' && !q.get('longRun')).map(asQuest);
    const move = await readMoveOn(tx, db, live);
    for (const q of live) moveOn(tx, db, ctx.now, pack, settings, scoring, q, move, ctx.uid);
    const id = openGlobalQuest(tx, db, ctx.now, rng, pack, settings, spec);
    for (const [uid, targetUid] of Object.entries(dealt ?? {})) {
      tx.create(db.doc(`assignments/${id}_${uid}`), { globalQuestId: id, uid, targetUid, createdAt: toTs(ctx.now) });
    }
    return { globalQuestId: id };
  });
}

/**
 * Fires an announcement: a closed side quest (so the story shows it done), a story-beat post, the fact it settles, and, if it
 * names a mission, that mission's current run goes to its result now (entries close and its vote opens, or it closes with
 * fines when nobody entered; one already voting or closed is left alone). It never moves the live mission on or fines anyone else.
 */
async function fireAnnouncement(
  tx: Txn,
  db: Db,
  now: Date,
  settings: Settings,
  scoring: Scoring,
  story: StoryQuest,
  quests: DocSnap[],
): Promise<string> {
  // Reads first: the run it opens the vote on.
  const target = story.opensVoteOn
    ? quests
        .filter((q) => q.get('storyId') === story.opensVoteOn && (q.get('status') === 'live' || q.get('status') === 'checking'))
        .sort((a, b) => millis(b.get('startsAt')) - millis(a.get('startsAt')))[0]
    : undefined;
  let entries: Entry[] = [];
  let players = new Map<string, Player>();
  if (target) {
    entries = await readEntries(tx, db, target.id);
    await attachPosts(tx, db, entries);
    players = await readPlayers(tx, db);
  }

  const ref = db.collection('globalQuests').doc();
  const quest: GlobalQuest = {
    title: story.title,
    description: story.description,
    bonusPoints: 0,
    source: 'story',
    templateId: null,
    startsAt: toTs(now),
    endsAt: toTs(now),
    status: 'closed',
    votingEndsAt: null,
    winnerUids: [],
    winningSubmissionIds: [],
    tally: null,
    storyId: story.id,
    kind: 'announce',
    gmChecks: false,
  };
  tx.create(ref, quest);
  addFeed(tx, db, now, { type: 'story-beat', text: story.description, uid: null, ref: ref.id, questTitle: story.title });
  if (story.fact) {
    const { key, label, value } = story.fact;
    tx.set(db.doc(`facts/${key}`), { key, label, value, entries: [], storyId: story.id, at: toTs(now) });
  }
  if (target) openVoteNow(tx, db, now, settings, scoring, asQuest(target), entries, players);
  return ref.id;
}
