// Test helpers for the server game logic. Every test file calls useEmulatorDb() with its own
// demo project id so files can run in parallel against one Firestore emulator.
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import type { Ctx } from '../src/game/context.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { GameState, GlobalQuestStatus, QuestStatus, Settings, SubmissionKind, SubmissionStatus } from '../src/shared/types.js';

/** Saturday 10 Oct 2026, 15:00 BST (14:00 UTC). Outside the default quiet hours. */
export const T0 = new Date('2026-10-10T14:00:00Z');

export const MIN = 60_000;
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * MIN);
export const ts = (d: Date) => Timestamp.fromDate(d);

export function useEmulatorDb(projectId: string): () => Firestore {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  let app: App;
  let db: Firestore;
  beforeAll(() => {
    if (!host) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run tests via `npm test` (firebase emulators:exec).');
    app = initializeApp({ projectId }, projectId);
    db = getFirestore(app);
  });
  beforeEach(async () => {
    const res = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });
  return () => db;
}

export function ctx(uid: string | null, now: Date = T0, rng?: () => number, email?: string): Ctx {
  return { uid, now, rng, email: email ?? (uid ? `${uid}@example.com` : null) };
}

/** Deterministic PRNG (mulberry32). */
export function seededRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const constRng = (v: number) => () => v;

export async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

// ---------- seeding ----------

export async function seedGame(
  db: Firestore,
  opts: { status?: GameState['status']; settings?: Partial<Settings>; state?: Partial<GameState> } = {},
): Promise<void> {
  const state: GameState = {
    status: opts.status ?? 'active',
    startedAt: ts(addMin(T0, -120)),
    endedAt: null,
    nextGlobalQuestAt: null,
    announcement: null,
    ...opts.state,
  };
  await db.doc('game/state').set(state);
  await db.doc('game/settings').set({ ...DEFAULT_SETTINGS, ...opts.settings });
}

export async function seedAdmin(db: Firestore, uid: string): Promise<void> {
  await db.doc(`admins/${uid}`).set({ email: `${uid}@example.com` });
}

/** Personal templates p01..pNN (active unless listed in `retired`). Returns their ids. */
export async function seedPersonalTemplates(
  db: Firestore,
  count: number,
  opts: { retired?: string[]; prefix?: string } = {},
): Promise<string[]> {
  const prefix = opts.prefix ?? 'p';
  const ids: string[] = [];
  const batch = db.batch();
  for (let i = 1; i <= count; i++) {
    const id = `${prefix}${String(i).padStart(2, '0')}`;
    ids.push(id);
    batch.set(db.doc(`questTemplates/${id}`), {
      title: `Personal quest ${id}`,
      description: `Do the thing ${id}`,
      scope: 'personal',
      windowMin: null,
      active: !(opts.retired ?? []).includes(id),
    });
  }
  await batch.commit();
  return ids;
}

export async function seedGlobalTemplate(
  db: Firestore,
  id: string,
  opts: { windowMin?: number | null; active?: boolean } = {},
): Promise<void> {
  await db.doc(`questTemplates/${id}`).set({
    title: `Global quest ${id}`,
    description: `Everyone: do ${id}`,
    scope: 'global',
    windowMin: opts.windowMin ?? null,
    active: opts.active ?? true,
  });
}

export interface SeedQuest {
  id: string;
  templateId: string;
  status?: QuestStatus;
  submissionId?: string | null;
}

export async function seedPlayer(
  db: Firestore,
  uid: string,
  opts: {
    displayName?: string;
    points?: number;
    rerollsUsed?: number;
    /** GM-granted rerolls. Omitted → the field is absent, like player docs written before it existed. */
    extraRerolls?: number;
    questsCompleted?: number;
    joinedAt?: Date;
    quests?: SeedQuest[];
  } = {},
): Promise<void> {
  await db.doc(`players/${uid}`).set({
    displayName: opts.displayName ?? uid.charAt(0).toUpperCase() + uid.slice(1),
    photoURL: `https://example.com/${uid}.jpg`,
    joinedAt: ts(opts.joinedAt ?? addMin(T0, -120)),
    points: opts.points ?? 0,
    rerollsUsed: opts.rerollsUsed ?? 0,
    ...(opts.extraRerolls === undefined ? {} : { extraRerolls: opts.extraRerolls }),
    questsCompleted: opts.questsCompleted ?? 0,
  });
  for (const q of opts.quests ?? []) {
    await db.doc(`players/${uid}/quests/${q.id}`).set({
      templateId: q.templateId,
      title: `Personal quest ${q.templateId}`,
      description: `Do the thing ${q.templateId}`,
      status: q.status ?? 'active',
      assignedAt: ts(addMin(T0, -120)),
      submissionId: q.submissionId ?? null,
    });
  }
}

/** Five active quests q1..q5 holding templates p01..p05 (or the given template ids). */
export function hand(templateIds: string[], status: QuestStatus = 'active'): SeedQuest[] {
  return templateIds.map((templateId, i) => ({ id: `q${i + 1}`, templateId, status }));
}

/**
 * Seeds a claim exactly as the client writes it: {uid, kind, questId, witnessUid, createdAt, status}.
 * The witness defaults to 'bob' (or 'alice' when bob is the submitter); `witnessUid: null` omits it.
 * `evidence: true` adds a photo + caption as addEvidence would; `extra` merges any server fields.
 */
export async function seedSubmission(
  db: Firestore,
  id: string,
  data: {
    uid: string;
    kind?: SubmissionKind;
    questId: string;
    witnessUid?: string | null;
    createdAt?: Date;
    status?: SubmissionStatus;
    evidence?: boolean;
    location?: { lat: number; lng: number; accuracy?: number } | null;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  const witnessUid = data.witnessUid === undefined ? (data.uid === 'bob' ? 'alice' : 'bob') : data.witnessUid;
  await db.doc(`submissions/${id}`).set({
    uid: data.uid,
    kind: data.kind ?? 'personal',
    questId: data.questId,
    ...(witnessUid === null ? {} : { witnessUid }),
    createdAt: ts(data.createdAt ?? T0),
    status: data.status ?? 'pending',
    ...(data.evidence
      ? {
          imagePath: `submissions/${data.uid}/${id}.jpg`,
          thumbPath: `submissions/${data.uid}/${id}_thumb.jpg`,
          caption: `caption ${id}`,
        }
      : {}),
    ...(data.location ? { location: data.location } : {}),
    ...data.extra,
  });
}

export async function seedGlobalQuest(
  db: Firestore,
  id: string,
  opts: {
    status?: GlobalQuestStatus;
    startsAt?: Date;
    endsAt?: Date;
    checkingEndsAt?: Date | null;
    votingEndsAt?: Date | null;
    bonusPoints?: number;
    templateId?: string | null;
    winnerUids?: string[];
  } = {},
): Promise<void> {
  await db.doc(`globalQuests/${id}`).set({
    title: `Global ${id}`,
    description: `Global quest ${id}`,
    bonusPoints: opts.bonusPoints ?? 100,
    source: 'timer',
    templateId: opts.templateId ?? null,
    startsAt: ts(opts.startsAt ?? addMin(T0, -10)),
    endsAt: ts(opts.endsAt ?? addMin(T0, 30)),
    status: opts.status ?? 'live',
    ...(opts.checkingEndsAt === undefined ? {} : { checkingEndsAt: opts.checkingEndsAt ? ts(opts.checkingEndsAt) : null }),
    votingEndsAt: opts.votingEndsAt ? ts(opts.votingEndsAt) : null,
    winnerUids: opts.winnerUids ?? [],
    winningSubmissionIds: [],
    tally: null,
  });
}

/** Feed posts of one type, newest last. */
export async function feedOf(db: Firestore, type: string): Promise<Array<Record<string, any> & { id: string }>> {
  const snap = await db.collection('feed').where('type', '==', type).get();
  const posts: Array<Record<string, any> & { id: string }> = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return posts.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

// ---------- reading ----------

export async function getData(db: Firestore, path: string): Promise<Record<string, any> | undefined> {
  return (await db.doc(path).get()).data();
}

export async function getPlayer(db: Firestore, uid: string): Promise<Record<string, any>> {
  const d = await getData(db, `players/${uid}`);
  if (!d) throw new Error(`player ${uid} missing`);
  return d;
}

export async function getQuests(db: Firestore, uid: string): Promise<Array<Record<string, any> & { id: string }>> {
  const snap = await db.collection(`players/${uid}/quests`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function ledgerFor(db: Firestore, uid: string): Promise<Array<Record<string, any>>> {
  const snap = await db.collection('pointsLedger').where('uid', '==', uid).get();
  return snap.docs.map((d) => d.data());
}

export async function allDocs(db: Firestore, collection: string): Promise<Array<Record<string, any> & { id: string }>> {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const toMillis = (v: any): number => (v instanceof Timestamp ? v.toMillis() : (v as Date).getTime());
