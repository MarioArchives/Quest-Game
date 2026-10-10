// Personal-quest claims (Revision 3): V6, V7, V8, V9, V12 + permissions (W6) and game state (W12).
// A player claims a quest naming a witness (no photo). The witness — or a GM, never the claimant —
// approves (+100) or rejects (−25, quest swapped) with an optional note. Everything posts to the feed.
// The GM can override an approval as fraud (points back + fine, public fraud post, original flagged).
import { describe, expect, it } from 'vitest';
import { handleSubmissionCreated, reviewSubmission } from '../src/game/submissions.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  getQuests,
  hand,
  ledgerFor,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-submissions');

const FIVE = ['p01', 'p02', 'p03', 'p04', 'p05'];

async function setup(settings: Partial<Settings> = {}, alicePoints = 0) {
  await seedGame(db(), { status: 'active', settings });
  await seedPersonalTemplates(db(), 20);
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { points: alicePoints, quests: hand(FIVE) });
  await seedPlayer(db(), 'bob', { quests: hand(['p06', 'p07', 'p08', 'p09', 'p10']).map((q) => ({ ...q, id: `b${q.id}` })) });
  await seedPlayer(db(), 'carol');
}

/** `uid` claims `questId`, naming `witnessUid` (default: bob, or alice when bob claims; null = none). */
async function claim(id: string, uid: string, questId: string, witnessUid?: string | null, createdAt = T0) {
  await seedSubmission(db(), id, { uid, questId, createdAt, witnessUid });
  await handleSubmissionCreated(db(), id, createdAt, seededRng(5));
}

const review = (id: string, approve: boolean, by: string | null, note?: string, now = addMin(T0, 5)) =>
  reviewSubmission(db(), ctx(by, now, seededRng(6)), { submissionId: id, approve, note });

const active = (qs: Array<Record<string, any>>) => qs.filter((q) => q.status === 'active');
const activeOrSubmitted = (qs: Array<Record<string, any>>) => qs.filter((q) => q.status === 'active' || q.status === 'submitted');
const sortedDeltas = (l: Array<Record<string, any>>) => l.map((e) => e.delta).sort((a, b) => a - b);

describe('claim trigger (V6)', () => {
  it('a claim without any photo is pending: the quest is submitted and the claim copied for the witness', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    expect((await getQuests(db(), 'alice')).find((q) => q.id === 'q1')).toMatchObject({ status: 'submitted', submissionId: 's1' });
    const s = await getData(db(), 'submissions/s1');
    expect(s).toMatchObject({
      status: 'pending',
      witnessUid: 'bob',
      claimTitle: 'Personal quest p01',
      claimDescription: 'Do the thing p01',
    });
    expect(s?.imagePath ?? null).toBeNull();
    expect(s?.processedAt).toBeDefined();
  });

  it.each(['submitted', 'done', 'exposed', 'replaced'] as const)(
    'auto-rejects a claim for a quest that is already %s, with no penalty',
    async (status) => {
      await setup();
      await seedPlayer(db(), 'alice', { quests: [{ id: 'q1', templateId: 'p01', status }] });
      await claim('s1', 'alice', 'q1');
      const s = await getData(db(), 'submissions/s1');
      expect(s?.status).toBe('rejected');
      expect(s?.rejectReason).toEqual(expect.any(String));
      expect((await getPlayer(db(), 'alice')).points).toBe(0);
      expect(await ledgerFor(db(), 'alice')).toHaveLength(0);
    },
  );

  it("auto-rejects a claim for a quest the claimant doesn't hold", async () => {
    await setup();
    await claim('s1', 'alice', 'bq1');
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('rejected');
    expect((await getQuests(db(), 'bob')).find((q) => q.id === 'bq1')!.status).toBe('active');
  });

  it.each([
    ['themselves', 'alice'],
    ['someone who is not a player', 'nobody'],
    ['nobody at all (missing)', null],
  ])('auto-rejects a claim whose witness is %s, leaving the quest in the hand', async (_label, witness) => {
    await setup();
    await claim('s1', 'alice', 'q1', witness);
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('rejected');
    expect((await getQuests(db(), 'alice')).find((q) => q.id === 'q1')!.status).toBe('active');
  });

  it('a client-written side-quest claim is auto-rejected (side quests are entered via enterSideQuest)', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'live' });
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'gq1', kind: 'global' });
    await handleSubmissionCreated(db(), 's1', T0);
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('rejected');
  });

  it('never auto-approves, even if an old autoApprove setting is stored', async () => {
    await setup({ autoApprove: true } as Partial<Settings>);
    await claim('s1', 'alice', 'q1');
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('pending');
  });

  it('changes nothing when the trigger is delivered twice', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await handleSubmissionCreated(db(), 's1', addMin(T0, 1));
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('pending');
    expect(await getQuests(db(), 'alice')).toHaveLength(5);
    expect(await allDocs(db(), 'feed')).toHaveLength(0);
  });
});

describe('the witness approves (V7)', () => {
  it('pays out, completes and refills the quest, and posts an approval with the witness and their comment', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    expect(await review('s1', true, 'bob', 'Saw it with my own eyes')).toEqual({ status: 'approved' });

    expect(await getPlayer(db(), 'alice')).toMatchObject({ points: 100, questsCompleted: 1 });
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: 100, reason: 'quest', ref: 's1', by: 'bob' })]);
    const quests = await getQuests(db(), 'alice');
    expect(quests.find((q) => q.id === 'q1')!.status).toBe('done');
    expect(activeOrSubmitted(quests)).toHaveLength(5);

    const s = await getData(db(), 'submissions/s1');
    expect(s).toMatchObject({ status: 'approved', pointsAwarded: 100, reviewedBy: 'bob', reviewNote: 'Saw it with my own eyes' });
    const posts = await feedOf(db(), 'approved');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      uid: 'alice',
      actorUid: 'bob',
      note: 'Saw it with my own eyes',
      points: 100,
      submissionId: 's1',
      questTitle: 'Personal quest p01',
    });
    expect(posts[0].imagePath ?? null).toBeNull();
    expect(s?.feedId).toBe(posts[0].id);
  });

  it('approves without a comment too', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    expect((await feedOf(db(), 'approved'))[0].note ?? null).toBeNull();
  });

  it('keeps the title hidden (post, submission and claim copy) when revealOnComplete is off', async () => {
    await setup({ revealOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    const s = await getData(db(), 'submissions/s1');
    expect(s?.questTitle ?? null).toBeNull();
    expect(s?.claimTitle ?? null).toBeNull();
    const post = (await feedOf(db(), 'approved'))[0];
    expect(post.questTitle ?? null).toBeNull();
    expect(post.text).not.toContain('Personal quest p01');
  });

  it('uses questPoints and refillOnComplete', async () => {
    await setup({ questPoints: 150, refillOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(150);
    expect(await getQuests(db(), 'alice')).toHaveLength(5);
  });

  it('approving twice changes nothing', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    await review('s1', true, 'bob');
    await review('s1', true, 'gm');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
    expect(await feedOf(db(), 'approved')).toHaveLength(1);
  });
});

describe('who may review (W6)', () => {
  it('refuses a player who is not the named witness, for approving and rejecting', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await expectCode(review('s1', true, 'carol'), 'permission-denied');
    await expectCode(review('s1', false, 'carol'), 'permission-denied');
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('pending');
  });

  it('refuses the claimant reviewing their own claim, even as GM', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await expectCode(review('s1', true, 'alice'), 'permission-denied');
    await expectCode(review('s1', false, 'alice'), 'permission-denied');
    await seedPlayer(db(), 'gm', { quests: [{ id: 'gmq1', templateId: 'p11' }] });
    await claim('s2', 'gm', 'gmq1', 'alice');
    await expectCode(review('s2', true, 'gm'), 'permission-denied');
    await review('s2', true, 'alice');
    expect((await getPlayer(db(), 'gm')).points).toBe(100);
  });

  it("lets a GM review someone else's claim", async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'gm');
    expect((await getData(db(), 'submissions/s1'))?.reviewedBy).toBe('gm');
  });

  it('refuses signed-out callers and unknown submissions', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await expectCode(review('s1', true, null), 'unauthenticated');
    await expectCode(review('nope', true, 'gm'), 'not-found');
  });
});

describe('rejection (V8, V9)', () => {
  it('the witness rejects: −25, quest swapped for a fresh one, rejection posted with their comment', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    expect(await review('s1', false, 'bob', 'You were at the bar the whole time')).toEqual({ status: 'rejected' });

    expect(await getData(db(), 'submissions/s1')).toMatchObject({
      status: 'rejected',
      reviewedBy: 'bob',
      reviewNote: 'You were at the bar the whole time',
    });
    expect(await getPlayer(db(), 'alice')).toMatchObject({ points: -25, rerollsUsed: 0 });
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: -25, reason: 'rejected', ref: 's1', by: 'bob' })]);
    const quests = await getQuests(db(), 'alice');
    expect(quests.find((q) => q.id === 'q1')!.status).toBe('replaced');
    expect(active(quests)).toHaveLength(5);
    expect(active(quests).find((q) => !FIVE.includes(q.templateId))).toBeDefined();

    const posts = await feedOf(db(), 'rejected');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', actorUid: 'bob', note: 'You were at the bar the whole time', points: -25, submissionId: 's1' });
  });

  it('a GM can reject a pending claim with the same effect', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', false, 'gm');
    expect((await getPlayer(db(), 'alice')).points).toBe(-25);
    expect((await feedOf(db(), 'rejected'))[0]).toMatchObject({ actorUid: 'gm', points: -25 });
  });

  it('rejecting twice charges once', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', false, 'bob');
    await review('s1', false, 'gm');
    expect((await getPlayer(db(), 'alice')).points).toBe(-25);
    expect(await feedOf(db(), 'rejected')).toHaveLength(1);
  });

  it('respects pointsFloorZero, and with rejectPenalty 0 writes no ledger entry but still posts', async () => {
    await setup({ pointsFloorZero: true }, 10);
    await claim('s1', 'alice', 'q1');
    await review('s1', false, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
    expect(await ledgerFor(db(), 'alice')).toEqual([expect.objectContaining({ delta: -10, reason: 'rejected' })]);

    await db().doc('game/settings').update({ rejectPenalty: 0, pointsFloorZero: false });
    await claim('s2', 'alice', 'q2');
    await review('s2', false, 'bob', undefined, addMin(T0, 7)); // later than the first post, so the order is defined
    expect(await ledgerFor(db(), 'alice')).toHaveLength(1);
    expect((await feedOf(db(), 'rejected')).map((p) => p.points)).toEqual([-10, 0]);
  });

  it('the witness cannot undo an approval; only the GM can (fraud)', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    await expectCode(review('s1', false, 'bob'), 'permission-denied');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it('a rejected claim cannot be approved afterwards', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', false, 'bob');
    await expectCode(review('s1', true, 'bob'), 'failed-precondition');
    await expectCode(review('s1', true, 'gm'), 'failed-precondition');
  });
});

describe('fraud override (V12)', () => {
  it('points back plus the fine, quest replaced, original post flagged and a public fraud post', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    const refillId = (await getData(db(), 'submissions/s1'))?.refillQuestId as string;
    await review('s1', false, 'gm', 'That photo is from 2019', addMin(T0, 10));

    expect(await getPlayer(db(), 'alice')).toMatchObject({ points: -50, questsCompleted: 0 });
    const ledger = await ledgerFor(db(), 'alice');
    expect(sortedDeltas(ledger)).toEqual([-100, -50, 100]);
    expect(ledger.find((l) => l.delta === -50)).toMatchObject({ reason: 'fraud', by: 'gm' });
    const quests = await getQuests(db(), 'alice');
    expect(quests.find((q) => q.id === 'q1')!.status).toBe('replaced');
    expect(quests.find((q) => q.id === refillId)!.status).toBe('active');
    expect(active(quests)).toHaveLength(5);

    const approved = await feedOf(db(), 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].flagged).toBe(true);
    const fraud = await feedOf(db(), 'fraud');
    expect(fraud).toHaveLength(1);
    expect(fraud[0]).toMatchObject({ uid: 'alice', actorUid: 'gm', note: 'That photo is from 2019', points: -150, submissionId: 's1' });
    expect(await getData(db(), 'submissions/s1')).toMatchObject({ status: 'rejected', pointsAwarded: 0 });
  });

  it('deals a fresh quest when no refill was dealt at approval', async () => {
    await setup({ refillOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    await review('s1', false, 'gm', undefined, addMin(T0, 10));
    expect(active(await getQuests(db(), 'alice'))).toHaveLength(5);
  });

  it('with fraudPenalty 0 only the award comes back', async () => {
    await setup({ fraudPenalty: 0 });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    await review('s1', false, 'gm', undefined, addMin(T0, 10));
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
    expect((await feedOf(db(), 'fraud'))[0].points).toBe(-100);
  });

  it('disqualifying a side-quest winner takes back the bonus, fines them and removes them from the winners', async () => {
    await setup({}, 100);
    await seedGlobalQuest(db(), 'gq1', { status: 'closed', winnerUids: ['alice', 'bob'] });
    await db().doc('globalQuests/gq1').update({ winningSubmissionIds: ['e1', 'e2'] });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true, extra: { pointsAwarded: 100 } });
    await review('e1', false, 'gm', 'Stock photo', addMin(T0, 10));
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ winnerUids: ['bob'], winningSubmissionIds: ['e2'] });
    expect((await feedOf(db(), 'fraud'))[0]).toMatchObject({ uid: 'alice', points: -150 });
  });

  it('disqualifying a non-winning side-quest entry costs only the fine', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'voting' });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true, extra: { pointsAwarded: 0 } });
    await review('e1', false, 'gm');
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('rejected');
  });

  it('only a GM can disqualify a side-quest entry', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'voting' });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await expectCode(review('e1', false, 'bob'), 'permission-denied');
    await expectCode(review('e1', false, 'alice'), 'permission-denied');
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('approved');
  });
});

describe('game state (W12)', () => {
  it('refuses any review after the game has ended', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(review('s1', true, 'bob'), 'failed-precondition');
    await expectCode(review('s1', false, 'bob'), 'failed-precondition');
  });

  it('allows reviews while paused', async () => {
    await setup();
    await claim('s1', 'alice', 'q1');
    await db().doc('game/state').update({ status: 'paused' });
    await review('s1', true, 'bob');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });
});
