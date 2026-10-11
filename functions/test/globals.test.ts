// Edge cases 28–29 (quiet hours, runTick, fireGlobalQuest) as revised for voted side quests
// (Revision 3 V13/V15): the timer moves expired side quests to 'checking' (always, entries or not; late entries
// still come in there) and closes voting when it ends. It never opens the vote: only a GM does.
import { describe, expect, it } from 'vitest';
import { fireGlobalQuest, isQuietHours, runTick } from '../src/game/globals.js';
import { castVote } from '../src/game/votes.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  constRng,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  MIN,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedGlobalTemplate,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-globals');

describe('isQuietHours (Europe/London)', () => {
  const night = { start: '01:00', end: '10:00' };
  const wrap = { start: '23:00', end: '09:00' };

  it.each([
    ['01:30 BST', '2026-10-10T00:30:00Z', night, true],
    ['10:30 BST', '2026-10-10T09:30:00Z', night, false],
    ['exactly the start, 01:00 BST (inclusive)', '2026-10-10T00:00:00Z', night, true],
    ['exactly the end, 10:00 BST (exclusive)', '2026-10-10T09:00:00Z', night, false],
    ['00:30 UTC in October = 01:30 BST', '2026-10-11T00:30:00Z', night, true],
    ['00:30 UTC in November = 00:30 GMT', '2026-11-10T00:30:00Z', night, false],
    ['01:30 GMT in November', '2026-11-10T01:30:00Z', night, true],
    ['23:30 BST across midnight', '2026-10-10T22:30:00Z', wrap, true],
    ['08:30 BST across midnight', '2026-10-10T07:30:00Z', wrap, true],
    ['09:30 BST across midnight', '2026-10-10T08:30:00Z', wrap, false],
    ['13:00 BST across midnight', '2026-10-10T12:00:00Z', wrap, false],
  ])('%s', (_label, iso, quiet, expected) => {
    expect(isQuietHours(new Date(iso), quiet)).toBe(expected);
  });

  it('is never quiet when quietHours is null', () => {
    expect(isQuietHours(new Date('2026-10-10T02:00:00Z'), null)).toBe(false);
  });
});

async function tickSetup(opts: { status?: 'lobby' | 'active' | 'paused' | 'ended'; next?: Date | null; settings?: Partial<Settings> } = {}) {
  await seedGame(db(), {
    status: opts.status ?? 'active',
    settings: opts.settings,
    state: { nextGlobalQuestAt: opts.next === undefined ? ts(addMin(T0, -1)) : opts.next === null ? null : ts(opts.next) },
  });
}

const liveQuests = async () => (await allDocs(db(), 'globalQuests')).filter((q) => q.status === 'live');

describe('runTick', () => {
  it.each(['lobby', 'paused', 'ended'] as const)('does nothing while the game is %s', async (status) => {
    await tickSetup({ status });
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalQuest(db(), 'old', { status: 'live', endsAt: addMin(T0, -5) });
    const res = await runTick(db(), T0, seededRng());
    expect(res).toEqual({ opened: null, closed: [], checking: [] });
    expect(await allDocs(db(), 'globalQuests')).toHaveLength(1);
    expect((await getData(db(), 'globalQuests/old'))?.status).toBe('live');
  });

  it('does not open a side quest during quiet hours', async () => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g01');
    const night = new Date('2026-10-10T02:00:00Z'); // 03:00 BST
    expect((await runTick(db(), night, seededRng())).opened).toBeNull();
    expect(await allDocs(db(), 'globalQuests')).toHaveLength(0);
  });

  it('opens a side quest once nextGlobalQuestAt has passed and schedules the next one 60–120 min out', async () => {
    await tickSetup({ next: addMin(T0, -1) });
    await seedGlobalTemplate(db(), 'g01');
    const res = await runTick(db(), T0, seededRng(4));
    expect(res.opened).toEqual(expect.any(String));
    const q = await getData(db(), `globalQuests/${res.opened}`);
    expect(q).toMatchObject({
      title: 'Global quest g01',
      description: 'Everyone: do g01',
      status: 'live',
      source: 'timer',
      templateId: 'g01',
      bonusPoints: 100,
      votingEndsAt: null,
      winnerUids: [],
      tally: null,
    });
    expect(q?.winRule).toBeUndefined();
    expect(q?.venueId).toBeUndefined();
    expect(toMillis(q!.startsAt)).toBe(T0.getTime());
    expect(toMillis(q!.endsAt)).toBe(T0.getTime() + 40 * MIN);
    const next = toMillis((await getData(db(), 'game/state'))!.nextGlobalQuestAt);
    expect(next).toBeGreaterThanOrEqual(T0.getTime() + 60 * MIN);
    expect(next).toBeLessThanOrEqual(T0.getTime() + 120 * MIN);
    expect((await feedOf(db(), 'global-open')).map((f) => f.ref)).toEqual([res.opened]);
  });

  it('opens a side quest when nextGlobalQuestAt is unset, and nothing before it is due', async () => {
    await tickSetup({ next: null });
    await seedGlobalTemplate(db(), 'g01');
    expect((await runTick(db(), T0, seededRng())).opened).toEqual(expect.any(String));
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, 1)) });
    expect((await runTick(db(), T0, seededRng())).opened).toBeNull();
  });

  it('can schedule the next side quest at exactly the minimum and the maximum interval', async () => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g01');
    await runTick(db(), T0, constRng(0));
    expect(toMillis((await getData(db(), 'game/state'))!.nextGlobalQuestAt)).toBe(T0.getTime() + 60 * MIN);
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, -1)) });
    await runTick(db(), T0, constRng(0.999999));
    expect(toMillis((await getData(db(), 'game/state'))!.nextGlobalQuestAt)).toBe(T0.getTime() + 120 * MIN);
  });

  it("uses the template's own windowMin and the sideQuestPoints setting", async () => {
    await tickSetup({ settings: { sideQuestPoints: 150 } });
    await seedGlobalTemplate(db(), 'g01', { windowMin: 25 });
    const { opened } = await runTick(db(), T0, seededRng());
    const q = await getData(db(), `globalQuests/${opened}`);
    expect(toMillis(q!.endsAt)).toBe(T0.getTime() + 25 * MIN);
    expect(q!.bonusPoints).toBe(150);
  });

  it('moves every expired live side quest to checking, entries or not: entries stay sealed and the GMs are told', async () => {
    await tickSetup({ next: addMin(T0, 30) });
    await seedGlobalQuest(db(), 'withEntries', { status: 'live', endsAt: addMin(T0, -1) });
    await seedGlobalQuest(db(), 'empty', { status: 'live', endsAt: T0 });
    await seedGlobalQuest(db(), 'running', { status: 'live', endsAt: addMin(T0, 10) });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'withEntries', witnessUid: null, status: 'sealed', evidence: true });
    const res = await runTick(db(), T0, seededRng());
    expect({ ...res, checking: [...res.checking].sort() }).toEqual({ opened: null, closed: [], checking: ['empty', 'withEntries'] });
    for (const id of ['withEntries', 'empty']) {
      const gq = await getData(db(), `globalQuests/${id}`);
      expect(gq?.status).toBe('checking');
      expect(gq?.votingEndsAt ?? null).toBeNull();
    }
    expect((await getData(db(), 'globalQuests/running'))?.status).toBe('live');
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('sealed');
    const posts = await feedOf(db(), 'checking');
    expect(posts.map((p) => p.ref).sort()).toEqual(['empty', 'withEntries']);
    expect(posts.find((p) => p.ref === 'withEntries')).toMatchObject({ questTitle: 'Global withEntries', uid: null });
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
  });

  it("a lone GM's own entry waits for the GM to start the vote too", async () => {
    await tickSetup({ next: addMin(T0, 30) });
    await seedAdmin(db(), 'gm');
    await seedGlobalQuest(db(), 'gq1', { status: 'live', endsAt: addMin(T0, -1) });
    await seedSubmission(db(), 'e1', { uid: 'gm', kind: 'global', questId: 'gq1', witnessUid: null, status: 'sealed', evidence: true });
    expect((await runTick(db(), T0, seededRng())).checking).toEqual(['gq1']);
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('sealed');
  });

  it('never opens the vote by itself: a checking side quest stays checking however long it waits', async () => {
    await tickSetup({ next: addMin(T0, 6000) });
    await seedAdmin(db(), 'gm');
    await seedGlobalQuest(db(), 'gq1', { status: 'checking', endsAt: addMin(T0, -40) });
    await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'sealed', evidence: true, extra: { checked: 'accepted' } });
    await seedSubmission(db(), 'eb', { uid: 'bob', kind: 'global', questId: 'gq1', witnessUid: null, status: 'sealed', evidence: true });
    expect(await runTick(db(), addMin(T0, 600), seededRng())).toEqual({ opened: null, closed: [], checking: [] });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect((await getData(db(), 'submissions/ea'))?.status).toBe('sealed');
    expect((await getData(db(), 'submissions/eb'))?.status).toBe('sealed');
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
  });

  it('a new timer side quest opens while another is still being checked, and leaves it alone', async () => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalQuest(db(), 'gq1', { status: 'checking', endsAt: addMin(T0, -5) });
    const res = await runTick(db(), T0, seededRng());
    expect(res.opened).toEqual(expect.any(String));
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
  });

  it('closes voting once votingEndsAt has passed and pays the winners', async () => {
    await tickSetup({ next: addMin(T0, 30) });
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    await seedPlayer(db(), 'carol');
    await seedGlobalQuest(db(), 'gq1', { status: 'voting', endsAt: addMin(T0, -30), votingEndsAt: addMin(T0, 10), bonusPoints: 100 });
    await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await seedSubmission(db(), 'eb', { uid: 'bob', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await castVote(db(), ctx('carol', T0), { globalQuestId: 'gq1', submissionId: 'ea' });

    expect((await runTick(db(), addMin(T0, 9), seededRng())).closed).toEqual([]); // not yet
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('voting');

    const res = await runTick(db(), addMin(T0, 10), seededRng());
    expect(res.closed).toEqual(['gq1']);
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ status: 'closed', winnerUids: ['alice'], tally: { ea: 1, eb: 0 } });
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it('moves a still-live side quest on to checking (entries or not) before opening the next one', async () => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g02');
    await seedGlobalQuest(db(), 'stillLive', { status: 'live', endsAt: addMin(T0, 10) });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'stillLive', witnessUid: null, status: 'sealed', evidence: true });
    await seedGlobalQuest(db(), 'stillEmpty', { status: 'live', endsAt: addMin(T0, 10) });
    const res = await runTick(db(), T0, seededRng());
    expect(res.opened).toEqual(expect.any(String));
    expect((await getData(db(), 'globalQuests/stillLive'))?.status).toBe('checking');
    expect((await getData(db(), 'globalQuests/stillEmpty'))?.status).toBe('checking');
    expect((await liveQuests()).map((q) => q.id)).toEqual([res.opened]);
  });

  it.each([0, 0.3, 0.6, 0.99])('prefers a template that has not been used yet (rng %s)', async (r) => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalTemplate(db(), 'g02');
    await seedGlobalTemplate(db(), 'g03');
    await seedGlobalQuest(db(), 'used1', { status: 'closed', templateId: 'g01', endsAt: addMin(T0, -100) });
    await seedGlobalQuest(db(), 'used2', { status: 'closed', templateId: 'g02', endsAt: addMin(T0, -50) });
    const { opened } = await runTick(db(), T0, constRng(r));
    expect((await getData(db(), `globalQuests/${opened}`))?.templateId).toBe('g03');
  });

  it('repeats templates once every one has been used', async () => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalTemplate(db(), 'g02');
    await seedGlobalQuest(db(), 'used1', { status: 'closed', templateId: 'g01', endsAt: addMin(T0, -100) });
    await seedGlobalQuest(db(), 'used2', { status: 'closed', templateId: 'g02', endsAt: addMin(T0, -50) });
    const { opened } = await runTick(db(), T0, seededRng());
    expect(['g01', 'g02']).toContain((await getData(db(), `globalQuests/${opened}`))?.templateId);
  });

  it('does nothing, without throwing, when there are no active global templates', async () => {
    await tickSetup();
    await seedPersonalTemplates(db(), 5);
    await seedGlobalTemplate(db(), 'retired', { active: false });
    expect((await runTick(db(), T0, seededRng())).opened).toBeNull();
    expect(await allDocs(db(), 'globalQuests')).toHaveLength(0);
  });
});

describe('fireGlobalQuest', () => {
  const custom = (over: Record<string, unknown> = {}) => ({
    mode: 'custom' as const,
    title: 'Find a kazoo',
    description: 'Photo of a kazoo being played',
    windowMin: 30,
    points: 50,
    ...over,
  });

  it('only a GM can fire', async () => {
    await tickSetup();
    await seedGlobalTemplate(db(), 'g01');
    await seedPlayer(db(), 'alice');
    await expectCode(fireGlobalQuest(db(), ctx('alice'), { mode: 'random' }), 'permission-denied');
    await expectCode(fireGlobalQuest(db(), ctx(null), { mode: 'random' }), 'unauthenticated');
  });

  it.each(['lobby', 'paused', 'ended'] as const)('refuses while the game is %s', async (status) => {
    await tickSetup({ status });
    await seedAdmin(db(), 'gm');
    await seedGlobalTemplate(db(), 'g01');
    await expectCode(fireGlobalQuest(db(), ctx('gm'), { mode: 'random' }), 'failed-precondition');
  });

  it('random: opens a live side quest from the global templates and resets the timer', async () => {
    await tickSetup({ next: addMin(T0, 5) });
    await seedAdmin(db(), 'gm');
    await seedGlobalTemplate(db(), 'g01');
    const { globalQuestId } = await fireGlobalQuest(db(), ctx('gm', T0, seededRng()), { mode: 'random' });
    expect(await getData(db(), `globalQuests/${globalQuestId}`)).toMatchObject({ status: 'live', source: 'gm-random', templateId: 'g01' });
    const next = toMillis((await getData(db(), 'game/state'))!.nextGlobalQuestAt);
    expect(next).toBeGreaterThanOrEqual(T0.getTime() + 60 * MIN);
    expect(next).toBeLessThanOrEqual(T0.getTime() + 120 * MIN);
  });

  it('random: fails with failed-precondition when there are no global templates', async () => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    await expectCode(fireGlobalQuest(db(), ctx('gm'), { mode: 'random' }), 'failed-precondition');
  });

  it('custom: opens the side quest exactly as specified (no win rule, no venue)', async () => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    const { globalQuestId } = await fireGlobalQuest(db(), ctx('gm'), custom());
    const q = await getData(db(), `globalQuests/${globalQuestId}`);
    expect(q).toMatchObject({
      title: 'Find a kazoo',
      description: 'Photo of a kazoo being played',
      bonusPoints: 50,
      source: 'gm-custom',
      templateId: null,
      status: 'live',
      winnerUids: [],
    });
    expect(toMillis(q!.endsAt)).toBe(T0.getTime() + 30 * MIN);
  });

  it.each([
    ['title 80 chars', { title: 'x'.repeat(80) }],
    ['window 5 min', { windowMin: 5 }],
    ['window 180 min', { windowMin: 180 }],
    ['0 points', { points: 0 }],
  ])('custom: accepts the boundary %s', async (_label, over) => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    await expect(fireGlobalQuest(db(), ctx('gm'), custom(over))).resolves.toEqual({ globalQuestId: expect.any(String) });
  });

  it.each([
    ['empty title', { title: '' }],
    ['blank title', { title: '   ' }],
    ['81-char title', { title: 'x'.repeat(81) }],
    ['window 4 min', { windowMin: 4 }],
    ['window 181 min', { windowMin: 181 }],
    ['non-integer window', { windowMin: 10.5 }],
    ['negative points', { points: -1 }],
    ['non-numeric points', { points: '50' }],
  ])('custom: rejects %s', async (_label, over) => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    await expectCode(fireGlobalQuest(db(), ctx('gm'), custom(over)), 'invalid-argument');
    expect(await allDocs(db(), 'globalQuests')).toHaveLength(0);
  });

  it('moves the current live side quests on to checking (entries or not) before opening a new one', async () => {
    await tickSetup();
    await seedAdmin(db(), 'gm');
    await seedGlobalQuest(db(), 'old', { status: 'live', endsAt: addMin(T0, 20) });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'old', witnessUid: null, status: 'sealed', evidence: true });
    await seedGlobalQuest(db(), 'oldEmpty', { status: 'live', endsAt: addMin(T0, 20) });
    const { globalQuestId } = await fireGlobalQuest(db(), ctx('gm'), custom());
    expect((await getData(db(), 'globalQuests/old'))?.status).toBe('checking');
    expect((await getData(db(), 'globalQuests/oldEmpty'))?.status).toBe('checking');
    // The GM who fired it is right there, so the checking post doesn't buzz them.
    expect((await feedOf(db(), 'checking')).find((p) => p.ref === 'old')).toMatchObject({ actorUid: 'gm' });
    expect((await liveQuests()).map((q) => q.id)).toEqual([globalQuestId]);
  });
});
