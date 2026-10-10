// Side quests judged by everyone's vote (Revision 3 V13–V15, V19; Revision 3b X1–X3).
// Players enter a live side quest directly with evidence (no witness). Voting opens when everyone has
// entered, when the window ends (tick, see globals.test.ts) or when the GM advances it; most votes wins,
// ties all win the full bonus; voting closes when every eligible voter has voted or the GM ends it.
import { describe, expect, it } from 'vitest';
import { advanceGlobalQuest, castVote, enterSideQuest } from '../src/game/votes.js';
import { tallyVotes } from '../src/shared/votes.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  ledgerFor,
  MIN,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedPlayer,
  T0,
  toMillis,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-votes');

describe('tallyVotes (V19)', () => {
  it('counts votes per entry and picks the single top entry', () => {
    expect(tallyVotes(['a', 'a', 'b'], ['a', 'b', 'c'])).toEqual({ counts: { a: 2, b: 1, c: 0 }, winners: ['a'] });
  });

  it('returns every entry tied on the top count, in entry order', () => {
    expect(tallyVotes(['b', 'a'], ['a', 'b', 'c'])).toEqual({ counts: { a: 1, b: 1, c: 0 }, winners: ['a', 'b'] });
  });

  it('has no winners when nobody voted, or there are no entries', () => {
    expect(tallyVotes([], ['a', 'b'])).toEqual({ counts: { a: 0, b: 0 }, winners: [] });
    expect(tallyVotes(['a'], [])).toEqual({ counts: {}, winners: [] });
  });

  it('ignores votes for anything that is not an entry', () => {
    expect(tallyVotes(['x', 'a'], ['a', 'b'])).toEqual({ counts: { a: 1, b: 0 }, winners: ['a'] });
  });
});

const photo = (uid: string, name: string) => ({
  imagePath: `submissions/${uid}/${name}.jpg`,
  thumbPath: `submissions/${uid}/${name}_thumb.jpg`,
});

async function setup(players = ['alice', 'bob', 'carol'], settings: Partial<Settings> = {}) {
  await seedGame(db(), { status: 'active', settings });
  await seedAdmin(db(), 'gm');
  for (const uid of players) await seedPlayer(db(), uid);
  await seedGlobalQuest(db(), 'gq1', { status: 'live', endsAt: addMin(T0, 30), bonusPoints: 100 });
}

const enter = (uid: string, data: Record<string, unknown> = {}, now = T0) =>
  enterSideQuest(db(), ctx(uid, now), { globalQuestId: 'gq1', ...photo(uid, `${uid}-1`), caption: `${uid}'s entry`, ...data });

const vote = (uid: string, submissionId: string, now = addMin(T0, 5)) =>
  castVote(db(), ctx(uid, now), { globalQuestId: 'gq1', submissionId });

const advance = (by = 'gm', now = addMin(T0, 5)) => advanceGlobalQuest(db(), ctx(by, now), { globalQuestId: 'gq1' });

describe('enterSideQuest (X1, X2)', () => {
  it('R4: creates a sealed, witness-free entry; the feed only says that they entered', async () => {
    await setup();
    const res = await enter('alice');
    expect(res).toEqual({ submissionId: expect.any(String), votingOpened: false });
    const s = await getData(db(), `submissions/${res.submissionId}`);
    expect(s).toMatchObject({
      uid: 'alice',
      kind: 'global',
      questId: 'gq1',
      status: 'sealed',
      pointsAwarded: 0,
      ...photo('alice', 'alice-1'),
      caption: "alice's entry",
    });
    expect(s?.witnessUid ?? null).toBeNull();
    const posts = await feedOf(db(), 'approved');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'alice', submissionId: res.submissionId, questTitle: 'Global gq1' });
    expect(posts[0].imagePath ?? null).toBeNull();
    expect(posts[0].thumbPath ?? null).toBeNull();
    expect(posts[0].caption ?? null).toBeNull();
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
  });

  it('accepts a caption only, or a photo only', async () => {
    await setup();
    await enterSideQuest(db(), ctx('alice'), { globalQuestId: 'gq1', caption: 'Words only' });
    await enterSideQuest(db(), ctx('bob'), { globalQuestId: 'gq1', ...photo('bob', 'b') });
    expect(await allDocs(db(), 'submissions')).toHaveLength(2);
  });

  it('lets a GM who plays enter (nobody has to approve it)', async () => {
    await setup();
    await seedPlayer(db(), 'gm');
    const { submissionId } = await enter('gm');
    expect((await getData(db(), `submissions/${submissionId}`))?.status).toBe('sealed');
  });

  it('refuses a second entry from the same player', async () => {
    await setup();
    await enter('alice');
    await expectCode(enter('alice', photo('alice', 'alice-2')), 'already-exists');
    expect(await allDocs(db(), 'submissions')).toHaveLength(1);
  });

  it('refuses signed-out callers, non-players and unknown side quests', async () => {
    await setup();
    await expectCode(enterSideQuest(db(), ctx(null), { globalQuestId: 'gq1', caption: 'x' }), 'unauthenticated');
    await expectCode(enterSideQuest(db(), ctx('stranger'), { globalQuestId: 'gq1', caption: 'x' }), 'permission-denied');
    await expectCode(enterSideQuest(db(), ctx('alice'), { globalQuestId: 'nope', caption: 'x' }), 'not-found');
  });

  it.each([
    ['in voting', 'voting', addMin(T0, 30), T0],
    ['closed', 'closed', addMin(T0, 30), T0],
    ['past its window', 'live', addMin(T0, 30), addMin(T0, 31)],
    ['exactly at the end of its window', 'live', addMin(T0, 30), addMin(T0, 30)],
  ] as const)('refuses entries when the side quest is %s', async (_label, status, endsAt, now) => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status, endsAt });
    await expectCode(enter('alice', {}, now), 'failed-precondition');
  });

  it('refuses entries while the game is paused', async () => {
    await setup();
    await db().doc('game/state').update({ status: 'paused' });
    await expectCode(enter('alice'), 'failed-precondition');
  });

  it.each([
    ['no evidence', { imagePath: undefined, thumbPath: undefined, caption: undefined }],
    ['a blank caption and no photo', { imagePath: undefined, thumbPath: undefined, caption: '  ' }],
    ['a 281-character caption', { caption: 'x'.repeat(281) }],
    ["a photo in someone else's folder", photo('bob', 'b')],
    ['an image without its thumbnail', { thumbPath: undefined }],
  ])('rejects %s', async (_label, data) => {
    await setup();
    await expectCode(enter('alice', data), 'invalid-argument');
  });
});

describe('voting opens (X3, V13)', () => {
  it('opens as soon as every player has entered', async () => {
    await setup();
    expect((await enter('alice')).votingOpened).toBe(false);
    expect((await enter('bob')).votingOpened).toBe(false);
    expect((await enter('carol', {}, addMin(T0, 3))).votingOpened).toBe(true);
    const gq = await getData(db(), 'globalQuests/gq1');
    expect(gq?.status).toBe('voting');
    expect(toMillis(gq!.votingEndsAt)).toBe(addMin(T0, 3).getTime() + 20 * MIN);
    expect(await feedOf(db(), 'voting-open')).toHaveLength(1);
  });

  it('R5: opening the vote reveals every entry (approved) and puts its evidence on its feed post', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await enter('bob');
    await enter('carol');
    const entries = (await allDocs(db(), 'submissions')).filter((x) => x.questId === 'gq1');
    expect(entries.map((e) => e.status)).toEqual(['approved', 'approved', 'approved']);
    const post = (await feedOf(db(), 'approved')).find((p) => p.submissionId === a)!;
    expect(post).toMatchObject({ ...photo('alice', 'alice-1'), caption: "alice's entry" });
  });

  it('R5: a GM starting the vote early reveals the entries too', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await advance();
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('approved');
    expect((await feedOf(db(), 'approved')).find((p) => p.submissionId === a)).toMatchObject(photo('alice', 'alice-1'));
  });

  it('uses the voteWindowMin setting', async () => {
    await setup(['alice', 'bob'], { voteWindowMin: 7 });
    await enter('alice');
    await enter('bob');
    expect(toMillis((await getData(db(), 'globalQuests/gq1'))!.votingEndsAt)).toBe(T0.getTime() + 7 * MIN);
  });

  it('a GM can start voting early, before everyone has entered', async () => {
    await setup();
    await enter('alice');
    expect(await advance()).toEqual({ status: 'voting' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('voting');
    expect(await feedOf(db(), 'voting-open')).toHaveLength(1);
  });

  it('advancing a side quest nobody entered closes it with no winner', async () => {
    await setup();
    expect(await advance()).toEqual({ status: 'closed' });
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ status: 'closed', winnerUids: [] });
  });

  it('only a GM can advance, and a closed side quest cannot be advanced', async () => {
    await setup();
    await expectCode(advance('alice'), 'permission-denied');
    await expectCode(advanceGlobalQuest(db(), ctx('gm'), { globalQuestId: 'nope' }), 'not-found');
    await db().doc('globalQuests/gq1').update({ status: 'closed' });
    await expectCode(advance(), 'failed-precondition');
  });
});

describe('castVote and the tally (V14, V15)', () => {
  async function allEntered() {
    await setup();
    const a = (await enter('alice')).submissionId;
    const b = (await enter('bob')).submissionId;
    const c = (await enter('carol')).submissionId;
    return { a, b, c };
  }

  it('closes as soon as every eligible voter has voted and pays the top entry', async () => {
    const { a, b, c } = await allEntered();
    expect(await vote('alice', b)).toEqual({ closed: false });
    expect(await vote('bob', c)).toEqual({ closed: false });
    expect(await vote('carol', b)).toEqual({ closed: true });

    const gq = await getData(db(), 'globalQuests/gq1');
    expect(gq).toMatchObject({ status: 'closed', winnerUids: ['bob'], winningSubmissionIds: [b], tally: { [a]: 0, [b]: 2, [c]: 1 } });
    expect((await getPlayer(db(), 'bob')).points).toBe(100);
    expect(await ledgerFor(db(), 'bob')).toEqual([expect.objectContaining({ delta: 100, reason: 'global-win', ref: b })]);
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
    const won = await feedOf(db(), 'global-won');
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({ uid: 'bob', points: 100 });
  });

  it('a tie pays every tied entrant the full bonus', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    const b = (await enter('bob')).submissionId;
    await advance('gm', addMin(T0, 2)); // carol never entered
    await vote('alice', b);
    await vote('bob', a);
    expect(await advance('gm', addMin(T0, 10))).toEqual({ status: 'closed' }); // carol never voted either
    const gq = await getData(db(), 'globalQuests/gq1');
    expect([...gq!.winnerUids].sort()).toEqual(['alice', 'bob']);
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
    expect((await getPlayer(db(), 'bob')).points).toBe(100);
  });

  it('no votes means no winner', async () => {
    await allEntered();
    await advance('gm', addMin(T0, 10));
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ status: 'closed', winnerUids: [] });
    expect((await getPlayer(db(), 'alice')).points).toBe(0);
  });

  it('only counts players who have someone else to vote for as eligible voters', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await advance('gm', addMin(T0, 2));
    await vote('bob', a);
    expect(await vote('carol', a)).toEqual({ closed: true }); // alice has nobody else to vote for
    expect((await getData(db(), 'globalQuests/gq1'))?.winnerUids).toEqual(['alice']);
  });

  it('re-voting replaces your vote', async () => {
    const { a, b, c } = await allEntered();
    await vote('alice', b);
    await vote('alice', c);
    await vote('bob', a);
    await vote('carol', a);
    expect((await getData(db(), 'globalQuests/gq1'))?.tally).toEqual({ [a]: 2, [b]: 0, [c]: 1 });
  });

  it('refuses voting for your own entry', async () => {
    const { a } = await allEntered();
    await expectCode(vote('alice', a), 'permission-denied');
  });

  it('refuses votes for things that are not entries of this side quest', async () => {
    await allEntered();
    await expectCode(vote('alice', 'nope'), 'invalid-argument');
    // An approved entry of a different side quest, and a personal claim.
    await db().doc('submissions/foreign').set({ uid: 'bob', kind: 'global', questId: 'gq2', status: 'approved', createdAt: T0 });
    await db().doc('submissions/claim').set({ uid: 'bob', kind: 'personal', questId: 'q1', witnessUid: 'carol', status: 'approved', createdAt: T0 });
    await expectCode(vote('alice', 'foreign'), 'invalid-argument');
    await expectCode(vote('alice', 'claim'), 'invalid-argument');
  });

  it('refuses a disqualified (rejected) entry', async () => {
    const { b } = await allEntered();
    await db().doc(`submissions/${b}`).update({ status: 'rejected' });
    await expectCode(vote('alice', b), 'invalid-argument');
  });

  it('refuses voting unless the side quest is in voting', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await expectCode(vote('bob', a), 'failed-precondition'); // still live
    await db().doc('globalQuests/gq1').update({ status: 'closed' });
    await expectCode(vote('bob', a), 'failed-precondition');
  });

  it('refuses non-players and signed-out callers', async () => {
    const { a } = await allEntered();
    await expectCode(vote('stranger', a), 'permission-denied');
    await expectCode(castVote(db(), ctx(null), { globalQuestId: 'gq1', submissionId: a }), 'unauthenticated');
  });

  it('keeps votes server-side until the tally is published', async () => {
    const { b } = await allEntered();
    await vote('alice', b);
    expect((await getData(db(), 'globalQuests/gq1'))?.tally ?? null).toBeNull();
    expect((await db().collection('globalQuests/gq1/votes').get()).size).toBe(1);
  });
});
