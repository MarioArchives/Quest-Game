// Data-layer plan edge cases 22-29: the mock backend runs the real game on an in-memory store: demo data,
// "sign in as", real callables and triggers, live queries, the side-quest tick and in-memory files.
import { afterEach, describe, expect, it } from 'vitest';
import { getPack } from '../../../functions/src/shared/packs/index.ts';
import { Stamp } from '../../../functions/src/shared/store/stamp.ts';
import { testPack } from '../../../functions/test/packs.ts';
import type { Doc } from '../../shared';
import { BackendError } from '../errors';
import { SERVER_TIME, type BackendUser } from '../types';
import { createMockBackend, type MockBackend } from './index';

const NOW = new Date('2026-10-10T14:00:00Z');

function seeded(seed = 7): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let opened: MockBackend[] = [];
function mock(pack = getPack('lancaster')): MockBackend {
  const m = createMockBackend({ pack, now: () => NOW, rng: seeded(), tickMs: null });
  opened.push(m);
  return m;
}
afterEach(() => {
  for (const m of opened) m.dispose();
  opened = [];
});

const read = async (m: MockBackend, path: string) => (await m.store.doc(path).get()).data();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any> & { id: string };
const docs = async (m: MockBackend, path: string): Promise<AnyDoc[]> =>
  (await m.store.collection(path).get()).docs.map((d) => ({ id: d.id, ...d.data()! }));

async function callError(p: Promise<unknown>): Promise<BackendError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BackendError);
  return err as BackendError;
}

describe('E22. a fresh mock', () => {
  it('holds the demo game, started, for the pack', async () => {
    const m = mock();
    expect(m.kind).toBe('mock');
    expect((await docs(m, 'players')).map((p) => p.id).sort()).toEqual(['demo-jonah', 'demo-maya', 'demo-priya', 'demo-sam']);
    expect(await read(m, 'game/state')).toMatchObject({ status: 'active', pack: 'lancaster' });
    expect(await read(m, 'game/settings')).toMatchObject({ scoring: 'classic' });
    expect(await read(m, 'admins/mock-gm')).toBeDefined();
    expect((await docs(m, 'questTemplates')).length).toBe(88);
    expect((await docs(m, 'feed')).length).toBeGreaterThan(0);
    expect((await m.store.collectionGroup('reactions').get()).size).toBeGreaterThan(0);
    expect((await docs(m, 'globalQuests')).map((q) => q.status)).toEqual(['live']);
    expect((await docs(m, 'locations')).length).toBe(4);
  });

  it('has no map pins when the pack has no map', async () => {
    expect(await docs(mock(testPack({ features: { map: false } })), 'locations')).toEqual([]);
  });

  it('starts signed out, offering the GM and the demo players', () => {
    const m = mock();
    expect(m.auth.current()).toBeNull();
    const seen: Array<BackendUser | null> = [];
    m.auth.onUser((u) => seen.push(u));
    expect(seen).toEqual([null]);
    expect(m.auth.accounts!()).toEqual([
      { uid: 'mock-gm', label: 'You (GM)', role: 'gm' },
      { uid: 'demo-maya', label: 'Maya', role: 'player' },
      { uid: 'demo-sam', label: 'Sam', role: 'player' },
      { uid: 'demo-priya', label: 'Priya', role: 'player' },
      { uid: 'demo-jonah', label: 'Jonah', role: 'player' },
    ]);
    expect(m.push).toBeNull();
  });
});

describe('E23. signing in', () => {
  it('signs in as the GM by default', async () => {
    const m = mock();
    const seen: Array<BackendUser | null> = [];
    m.auth.onUser((u) => seen.push(u));
    await m.auth.signIn();
    expect(m.auth.current()).toMatchObject({ uid: 'mock-gm', displayName: 'You (GM)' });
    expect(seen.at(-1)).toMatchObject({ uid: 'mock-gm' });
  });

  it('signs in as a demo player, who sees their player doc and hand', async () => {
    const m = mock();
    await m.auth.signIn('demo-maya');
    expect(m.auth.current()).toMatchObject({ uid: 'demo-maya', displayName: 'Maya' });
    let player: Doc<{ displayName: string }> | null = null;
    m.data.watchDoc<{ displayName: string }>('players/demo-maya', (d) => (player = d), (e) => { throw e; });
    expect(player).toMatchObject({ id: 'demo-maya', displayName: 'Maya' });
    let hand: unknown[] = [];
    m.data.watchQuery({ path: 'players/demo-maya/quests' }, (d) => (hand = d), (e) => { throw e; });
    expect(hand.length).toBeGreaterThanOrEqual(5);
  });

  it('signs out, and refuses unknown accounts', async () => {
    const m = mock();
    await m.auth.signIn('demo-sam');
    await m.auth.signOut();
    expect(m.auth.current()).toBeNull();
    const err = await callError(m.auth.signIn('nobody'));
    expect(err).toMatchObject({ source: 'auth', code: 'auth/user-not-found' });
  });
});

describe('E24. game actions run the real rules', () => {
  it('a GM points adjustment changes the points and posts to the feed', async () => {
    const m = mock();
    await m.auth.signIn();
    const before = (await read(m, 'players/demo-maya'))!.points as number;
    const out = await m.call<unknown, { points: number }>('adjustPoints', { uid: 'demo-maya', delta: 10, reason: 'Great hat' });
    expect(out.points).toBe(before + 10);
    expect((await read(m, 'players/demo-maya'))!.points).toBe(before + 10);
    const posts = (await docs(m, 'feed')).filter((p) => p.type === 'adjust');
    expect(posts.map((p) => p.text)).toEqual([expect.stringContaining('Great hat')]);
  });

  it('a second guess too soon fails with resource-exhausted and a retryAt', async () => {
    const m = mock();
    await m.auth.signIn('demo-sam');
    const held = new Set((await docs(m, 'players/demo-maya/quests')).map((q) => q.templateId));
    const other = (await docs(m, 'questTemplates')).find((t) => t.scope === 'personal' && !held.has(t.id))!;
    expect(await m.call('guessQuest', { targetUid: 'demo-maya', templateId: other.id })).toEqual({ correct: false });
    const err = await callError(m.call('guessQuest', { targetUid: 'demo-maya', templateId: other.id }));
    expect(err).toMatchObject({ source: 'call', code: 'resource-exhausted' });
    expect((err.details as { retryAt: number }).retryAt).toBeGreaterThan(NOW.getTime());
  });

  it('an unknown action fails with not-found', async () => {
    const m = mock();
    await m.auth.signIn();
    expect(await callError(m.call('noSuchThing', {}))).toMatchObject({ source: 'call', code: 'not-found' });
  });

  it('a signed-out action fails with unauthenticated', async () => {
    const m = mock();
    const err = await callError(m.call('adjustPoints', { uid: 'demo-maya', delta: 10, reason: 'x' }));
    expect(err).toMatchObject({ source: 'call', code: 'unauthenticated' });
  });

  it('a reset also wipes the stored photos', async () => {
    const m = mock();
    await m.auth.signIn();
    const photo = (await docs(m, 'submissions')).find((s) => typeof s.imagePath === 'string')!.imagePath as string;
    await expect(m.files.url(photo)).resolves.toMatch(/^data:/);
    await m.call('resetGame', { confirm: 'RESET' });
    expect(await docs(m, 'players')).toEqual([]);
    expect(await callError(m.files.url(photo))).toMatchObject({ source: 'files', code: 'storage/object-not-found' });
  });
});

describe('E25. triggers', () => {
  it('a claim written by the app is processed: the quest is submitted and the witness asked', async () => {
    const m = mock();
    await m.auth.signIn('demo-maya');
    const quest = (await docs(m, 'players/demo-maya/quests')).find((q) => q.status === 'active')!;
    const id = m.data.newId('submissions');
    await m.data.set(`submissions/${id}`, {
      uid: 'demo-maya',
      kind: 'personal',
      questId: quest.id,
      witnessUid: 'demo-sam',
      createdAt: SERVER_TIME,
      status: 'pending',
    });
    await m.settle();
    expect((await read(m, `players/demo-maya/quests/${quest.id}`))!.status).toBe('submitted');
    const sub = (await read(m, `submissions/${id}`))!;
    expect(sub.createdAt).toBeInstanceOf(Stamp);
    expect(sub.createdAt.toMillis()).toBe(NOW.getTime());
    expect(sub.processedAt).toBeInstanceOf(Stamp);
    expect(sub.claimTitle).toBe(quest.title);

    await m.auth.signIn('demo-sam');
    let waiting: Array<{ id: string }> = [];
    m.data.watchQuery<{ id: string }>(
      { path: 'submissions', where: [['witnessUid', '==', 'demo-sam'], ['status', '==', 'pending']] },
      (d) => (waiting = d),
      (e) => { throw e; },
    );
    expect(waiting.map((s) => s.id)).toContain(id);
  });

  it('a reaction recounts the post', async () => {
    const m = mock();
    await m.auth.signIn('demo-maya');
    const post = (await docs(m, 'feed'))[0]!;
    await m.data.set(`feed/${post.id}/reactions/demo-maya`, { emoji: '🔥', createdAt: SERVER_TIME });
    await m.settle();
    const count = (await m.store.collection(`feed/${post.id}/reactions`).get()).size;
    expect(count).toBeGreaterThan(0);
    expect((await read(m, `feed/${post.id}`))!.reactionCount).toBe(count);
  });
});

describe('E26. live queries', () => {
  it('the feed query delivers new posts in order', async () => {
    const m = mock();
    await m.auth.signIn();
    const deliveries: Array<Array<{ id: string; type: string; createdAt: Stamp }>> = [];
    m.data.watchQuery<{ type: string; createdAt: Stamp }>(
      { path: 'feed', orderBy: ['createdAt', 'desc'], limit: 50 },
      (d) => deliveries.push(d),
      (e) => { throw e; },
    );
    expect(deliveries).toHaveLength(1);
    const first = deliveries[0]!;
    expect(first.length).toBeGreaterThan(0);
    for (let i = 1; i < first.length; i++) expect(first[i - 1]!.createdAt.toMillis()).toBeGreaterThanOrEqual(first[i]!.createdAt.toMillis());

    await m.call('adjustPoints', { uid: 'demo-jonah', delta: 5, reason: 'Kindness' });
    expect(deliveries.length).toBeGreaterThan(1);
    expect(deliveries.at(-1)![0]).toMatchObject({ type: 'adjust' });
  });

  it('writes from the app show up in watchDoc, and missing docs come back as null', async () => {
    const m = mock();
    await m.auth.signIn('demo-maya');
    const seen: unknown[] = [];
    m.data.watchDoc('locations/demo-maya', (d) => seen.push(d), (e) => { throw e; });
    await m.data.remove('locations/demo-maya');
    await m.data.set('locations/demo-maya', { lat: 1, lng: 2, accuracy: null, updatedAt: SERVER_TIME });
    expect(seen.at(-2)).toBeNull();
    expect(seen.at(-1)).toMatchObject({ id: 'demo-maya', lat: 1, lng: 2 });
  });
});

describe('E27. the side-quest tick', () => {
  it('opens a due side quest', async () => {
    const m = mock();
    await m.store.doc('game/state').update({ nextGlobalQuestAt: Stamp.fromMillis(NOW.getTime() - 60_000) });
    const before = (await docs(m, 'globalQuests')).length;
    await m.tick();
    expect((await docs(m, 'globalQuests')).length).toBe(before + 1);
  });

  it('never opens one when the pack has no side quests', async () => {
    const m = mock(testPack({ features: { sideQuests: false } }));
    await m.store.doc('game/state').update({ nextGlobalQuestAt: Stamp.fromMillis(NOW.getTime() - 60_000) });
    await m.tick();
    expect(await docs(m, 'globalQuests')).toEqual([]);
  });
});

describe('E28. files', () => {
  it('an upload can be loaded back from its URL, with progress reported', async () => {
    const m = mock();
    const progress: Array<[number, number]> = [];
    await m.files.upload('submissions/demo-maya/x.jpg', new Blob(['abc'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' }, (a, b) =>
      progress.push([a, b]),
    );
    const url = await m.files.url('submissions/demo-maya/x.jpg');
    expect(url).toBe('data:image/jpeg;base64,YWJj');
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it('a missing file fails with storage/object-not-found', async () => {
    expect(await callError(mock().files.url('submissions/none.jpg'))).toMatchObject({ source: 'files', code: 'storage/object-not-found' });
  });

  it('demo photos resolve to SVG posters', async () => {
    const m = mock();
    const photo = (await docs(m, 'submissions')).find((s) => typeof s.imagePath === 'string')!.imagePath as string;
    expect(await m.files.url(photo)).toMatch(/^data:image\/svg\+xml/);
  });
});

describe('E29. the starter pack', () => {
  it('speaks its own words and keeps the map, with the players on it', async () => {
    const m = mock(getPack('starter'));
    expect(await read(m, 'game/state')).toMatchObject({ pack: 'starter' });
    const texts = (await docs(m, 'feed')).map((p) => String(p.text));
    expect(texts.some((t) => /bonus round/i.test(t))).toBe(true);
    expect(texts.some((t) => /side quest/i.test(t))).toBe(false);
    expect((await docs(m, 'locations')).length).toBe(4);
  });

  it('runs game actions with the pack’s words', async () => {
    const m = mock(getPack('starter'));
    await m.auth.signIn();
    await m.call('adjustPoints', { uid: 'demo-maya', delta: 10, reason: 'Nice' });
    const post = (await docs(m, 'feed')).find((p) => p.type === 'adjust')!;
    expect(post.text).toMatch(/^The GM adjusted/);
  });
});

describe('M23. the mystery pack', () => {
  it('demo players have characters, with private motives, and the pack’s settings', async () => {
    const m = mock(getPack('mystery'));
    expect(await read(m, 'game/state')).toMatchObject({ pack: 'mystery' });
    const players = await docs(m, 'players');
    for (const p of players) expect(p.character, p.id).toEqual({ name: expect.any(String), role: expect.any(String) });
    expect((await docs(m, 'motives')).map((x) => x.id).sort()).toEqual(players.map((p) => p.id).sort());
    expect(await read(m, 'game/settings')).toMatchObject({ guessLimit: 3, sideQuestSkipPenalty: 25, cleanPoints: 50, framePoints: 50 });
  });

  it('a confirmed mission earns a reward; framing through call() posts anonymously and costs the target', async () => {
    const m = mock(getPack('mystery'));
    await m.auth.signIn('demo-maya');
    const quest = (await docs(m, 'players/demo-maya/quests')).find((q) => q.status === 'active')!;
    const id = m.data.newId('submissions');
    await m.data.set(`submissions/${id}`, {
      uid: 'demo-maya',
      kind: 'personal',
      questId: quest.id,
      witnessUid: 'demo-sam',
      createdAt: SERVER_TIME,
      status: 'pending',
    });
    await m.settle();
    await m.auth.signIn('demo-sam');
    await m.call('reviewSubmission', { submissionId: id, approve: true });
    await m.settle();

    await m.auth.signIn('demo-maya');
    let pending: Array<{ id: string }> = [];
    m.data.watchQuery<{ id: string }>(
      { path: 'rewards', where: [['uid', '==', 'demo-maya'], ['status', '==', 'pending']] },
      (d) => (pending = d),
      (e) => { throw e; },
    );
    expect(pending.map((r) => r.id)).toContain(id);

    const before = (await read(m, 'players/demo-priya'))!.points as number;
    expect(await m.call('resolveReward', { rewardId: id, choice: 'frame', targetUid: 'demo-priya' })).toEqual({ status: 'framed', points: -50 });
    await m.settle();
    expect((await read(m, 'players/demo-priya'))!.points).toBe(before - 50);
    expect(pending.map((r) => r.id)).not.toContain(id);
    const framed = (await docs(m, 'feed')).filter((p) => p.type === 'framed');
    expect(framed).toHaveLength(1);
    expect(framed[0]).toMatchObject({ uid: 'demo-priya' });
    expect(framed[0]!.actorUid ?? null).toBeNull();
    expect(String(framed[0]!.text)).not.toMatch(/maya/i);
  });

  it('the GM sets a character through call()', async () => {
    const m = mock(getPack('mystery'));
    await m.auth.signIn();
    expect(await m.call('setCharacter', { uid: 'demo-sam', name: 'Professor Plum', role: 'Old friend', motive: 'Debts.' })).toEqual({ ok: true });
    expect((await read(m, 'players/demo-sam'))!.character).toEqual({ name: 'Professor Plum', role: 'Old friend' });
    expect((await read(m, 'motives/demo-sam'))!.text).toBe('Debts.');
  });
});

