// Evidence after approval (Revision 3 V11, Revision 3b X5): the owner adds a photo and/or a caption
// to an approved claim; it lands on the submission and on its feed post. Side-quest entries can only
// change their evidence while the side quest is still live.
import { describe, expect, it } from 'vitest';
import { addEvidence } from '../src/game/evidence.js';
import { handleSubmissionCreated, reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, enterSideQuest } from '../src/game/votes.js';
import {
  addMin,
  ctx,
  expectCode,
  feedOf,
  getData,
  hand,
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

const db = useEmulatorDb('demo-fq-evidence');

const photo = (uid: string, name = 's1-1') => ({
  imagePath: `submissions/${uid}/${name}.jpg`,
  thumbPath: `submissions/${uid}/${name}_thumb.jpg`,
});

async function approvedClaim() {
  await seedGame(db(), { status: 'active' });
  await seedPersonalTemplates(db(), 20);
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { quests: hand(['p01', 'p02', 'p03', 'p04', 'p05']) });
  await seedPlayer(db(), 'bob');
  await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1' });
  await handleSubmissionCreated(db(), 's1', T0, seededRng(1));
  await reviewSubmission(db(), ctx('bob', addMin(T0, 2), seededRng(2)), { submissionId: 's1', approve: true });
}

const evidence = (by: string | null, data: Record<string, unknown>, now = addMin(T0, 5)) =>
  addEvidence(db(), ctx(by, now), { submissionId: 's1', ...data });

describe('addEvidence on a personal claim', () => {
  it('adds a photo and caption to the submission and its approval post', async () => {
    await approvedClaim();
    expect(await evidence('alice', { ...photo('alice'), caption: 'The setlist, taped to the monitor' })).toEqual({ ok: true });
    expect(await getData(db(), 'submissions/s1')).toMatchObject({ ...photo('alice'), caption: 'The setlist, taped to the monitor' });
    const post = (await feedOf(db(), 'approved'))[0];
    expect(post).toMatchObject({ ...photo('alice'), caption: 'The setlist, taped to the monitor', submissionId: 's1' });
  });

  it('accepts just a caption, or just a photo', async () => {
    await approvedClaim();
    await evidence('alice', { caption: 'No photo, but trust me' });
    expect((await feedOf(db(), 'approved'))[0]).toMatchObject({ caption: 'No photo, but trust me' });
    await evidence('alice', photo('alice', 's1-2'));
    expect((await feedOf(db(), 'approved'))[0]).toMatchObject(photo('alice', 's1-2'));
  });

  it('a second call replaces the evidence', async () => {
    await approvedClaim();
    await evidence('alice', { ...photo('alice', 's1-1'), caption: 'first' });
    await evidence('alice', { ...photo('alice', 's1-2'), caption: 'second' });
    expect((await feedOf(db(), 'approved'))[0]).toMatchObject({ ...photo('alice', 's1-2'), caption: 'second' });
  });

  it('only the owner can add evidence', async () => {
    await approvedClaim();
    await expectCode(evidence('bob', { caption: 'hi' }), 'permission-denied');
    await expectCode(evidence('gm', { caption: 'hi' }), 'permission-denied');
    await expectCode(evidence(null, { caption: 'hi' }), 'unauthenticated');
  });

  it('only approved claims take evidence', async () => {
    await approvedClaim();
    await seedSubmission(db(), 's2', { uid: 'alice', questId: 'q2' });
    await handleSubmissionCreated(db(), 's2', T0, seededRng(3));
    await expectCode(addEvidence(db(), ctx('alice'), { submissionId: 's2', caption: 'too early' }), 'failed-precondition');
    await reviewSubmission(db(), ctx('bob', addMin(T0, 3), seededRng(4)), { submissionId: 's2', approve: false });
    await expectCode(addEvidence(db(), ctx('alice'), { submissionId: 's2', caption: 'too late' }), 'failed-precondition');
    await expectCode(addEvidence(db(), ctx('alice'), { submissionId: 'nope', caption: 'x' }), 'not-found');
  });

  it.each([
    ['nothing at all', {}],
    ['a blank caption', { caption: '   ' }],
    ['a 281-character caption', { caption: 'x'.repeat(281) }],
    ['a photo in someone else\'s folder', photo('bob')],
    ['an image without its thumbnail', { imagePath: 'submissions/alice/s1-1.jpg' }],
    ['a thumbnail without its image', { thumbPath: 'submissions/alice/s1-1_thumb.jpg' }],
    ['a path outside submissions/', { imagePath: 'avatars/alice/x.jpg', thumbPath: 'avatars/alice/x_thumb.jpg' }],
  ])('rejects %s', async (_label, data) => {
    await approvedClaim();
    await expectCode(evidence('alice', data), 'invalid-argument');
  });

  it('accepts a 280-character caption', async () => {
    await approvedClaim();
    await evidence('alice', { caption: 'x'.repeat(280) });
    expect((await getData(db(), 'submissions/s1'))?.caption).toHaveLength(280);
  });

  it('is refused once the game has ended', async () => {
    await approvedClaim();
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(evidence('alice', { caption: 'late' }), 'failed-precondition');
  });
});

describe('addEvidence on a side-quest entry (X5, R6)', () => {
  async function entered() {
    await seedGame(db(), { status: 'active' });
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    await seedGlobalQuest(db(), 'gq1', { status: 'live', endsAt: addMin(T0, 30) });
    const { submissionId } = await enterSideQuest(db(), ctx('alice'), { globalQuestId: 'gq1', ...photo('alice', 'e-1'), caption: 'Mine' });
    return submissionId;
  }

  it('can replace the evidence while the side quest is live; the post stays bare until the vote opens', async () => {
    const id = await entered();
    await addEvidence(db(), ctx('alice', addMin(T0, 2)), { submissionId: id, ...photo('alice', 'e-2'), caption: 'Better one' });
    expect(await getData(db(), `submissions/${id}`)).toMatchObject({ ...photo('alice', 'e-2'), caption: 'Better one', status: 'sealed' });
    const before = (await feedOf(db(), 'approved')).find((p) => p.submissionId === id)!;
    expect(before.imagePath ?? null).toBeNull();
    expect(before.caption ?? null).toBeNull();

    await advanceGlobalQuest(db(), ctx('gm', addMin(T0, 3)), { globalQuestId: 'gq1' }); // entries close: checking
    expect((await feedOf(db(), 'approved')).find((p) => p.submissionId === id)!.imagePath ?? null).toBeNull();
    await advanceGlobalQuest(db(), ctx('gm', addMin(T0, 4)), { globalQuestId: 'gq1' }); // the vote opens
    const after = (await feedOf(db(), 'approved')).find((p) => p.submissionId === id)!;
    expect(after).toMatchObject({ ...photo('alice', 'e-2'), caption: 'Better one' });
  });

  it.each(['checking', 'voting', 'closed'] as const)('cannot change it once the side quest is %s', async (status) => {
    const id = await entered();
    await db().doc('globalQuests/gq1').update({ status });
    await expectCode(addEvidence(db(), ctx('alice', addMin(T0, 2)), { submissionId: id, caption: 'sneaky edit' }), 'failed-precondition');
  });
});
