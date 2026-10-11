// Side quests judged by everyone's vote (Revision 3 V13–V15, V19; Revision 3b X1–X3), with the GM's check.
// Players enter a live side quest directly with evidence (no witness). Time is up when everyone has entered, when
// the window ends (tick, see globals.test.ts) or when the GM advances it; it then always goes to 'checking', where
// a GM accepts or rejects each entry (checkEntry) and late entries still come in. Only the GM opens the vote
// (advancing it again). Most votes wins, ties all win the full bonus; voting closes when every eligible voter has
// voted or the GM ends it. setup() seeds a GM ('gm') who does not play.
import { describe, expect, it } from 'vitest';
import { reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, checkEntry, enterSideQuest } from '../src/game/votes.js';
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

/** The GM closes entries (live → checking) and then opens the vote without checking (checking → voting). */
const toVoting = async (now = addMin(T0, 5)) => {
  await advance('gm', now);
  await advance('gm', now);
};

describe('enterSideQuest (X1, X2)', () => {
  it('R4: creates a sealed, witness-free entry; the feed only says that they entered', async () => {
    await setup();
    const res = await enter('alice');
    expect(res).toEqual({ submissionId: expect.any(String), checking: false, late: false });
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

  it.each(['voting', 'closed'] as const)('refuses entries once the side quest is %s', async (status) => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status, endsAt: addMin(T0, 30) });
    await expectCode(enter('alice'), 'failed-precondition');
  });

  it.each([
    ['exactly at the end of its window', addMin(T0, 30)],
    ['past its window, before the timer moves it on', addMin(T0, 44)],
  ])('takes a late entry %s, still live', async (_label, now) => {
    await setup();
    const res = await enter('alice', {}, now);
    expect(res).toMatchObject({ checking: false, late: true });
    expect((await getData(db(), `submissions/${res.submissionId}`))?.status).toBe('sealed');
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('live');
  });

  it('takes late entries while the GM checks, sealed and unchecked, until the GM starts the vote', async () => {
    await setup();
    await enter('alice');
    await advance(); // time's up → checking
    const res = await enter('bob', {}, addMin(T0, 50));
    expect(res).toEqual({ submissionId: expect.any(String), checking: false, late: true });
    const late = await getData(db(), `submissions/${res.submissionId}`);
    expect(late).toMatchObject({ status: 'sealed', questId: 'gq1' });
    expect(late?.checked ?? null).toBeNull();
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect((await feedOf(db(), 'approved')).filter((p) => p.questTitle === 'Global gq1')).toHaveLength(2);
    expect(await feedOf(db(), 'checking')).toHaveLength(1); // no second "time's up"
    await expectCode(enter('bob', photo('bob', 'bob-2'), addMin(T0, 51)), 'already-exists');

    await advance('gm', addMin(T0, 52)); // the GM starts the vote: entries close for good
    expect((await getData(db(), `submissions/${res.submissionId}`))?.status).toBe('approved');
    await expectCode(enter('carol', {}, addMin(T0, 53)), 'failed-precondition');
  });

  it('a player who was not accepted at the check may enter again while checking', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await advance();
    await checkEntry(db(), ctx('gm', addMin(T0, 6)), { submissionId: a, accept: false, note: 'No hat' });
    const again = await enter('alice', photo('alice', 'alice-2'), addMin(T0, 7));
    expect(again.late).toBe(true);
    expect((await getData(db(), `submissions/${again.submissionId}`))?.status).toBe('sealed');
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
  it("time is up as soon as every player has entered: the GM checks them before the vote", async () => {
    await setup();
    expect(await enter('alice')).toMatchObject({ checking: false, late: false });
    expect(await enter('bob')).toMatchObject({ checking: false, late: false });
    expect(await enter('carol', {}, addMin(T0, 3))).toMatchObject({ checking: true, late: false });
    const gq = await getData(db(), 'globalQuests/gq1');
    expect(gq?.status).toBe('checking');
    expect(gq?.votingEndsAt ?? null).toBeNull();
    const entries = (await allDocs(db(), 'submissions')).filter((x) => x.questId === 'gq1');
    expect(entries.map((e) => e.status)).toEqual(['sealed', 'sealed', 'sealed']);
    expect(await feedOf(db(), 'checking')).toHaveLength(1);
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
  });

  it('checking is never skipped, even with no GM to check: the vote waits for a GM', async () => {
    await setup();
    await db().doc('admins/gm').delete();
    await enter('alice');
    await enter('bob');
    expect(await enter('carol', {}, addMin(T0, 3))).toMatchObject({ checking: true });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
    expect(await feedOf(db(), 'checking')).toHaveLength(1);
  });

  it('R5: opening the vote reveals every entry (approved) and puts its evidence on its feed post', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await enter('bob');
    await enter('carol');
    await advance(); // checking → voting
    const entries = (await allDocs(db(), 'submissions')).filter((x) => x.questId === 'gq1');
    expect(entries.map((e) => e.status)).toEqual(['approved', 'approved', 'approved']);
    const post = (await feedOf(db(), 'approved')).find((p) => p.submissionId === a)!;
    expect(post).toMatchObject({ ...photo('alice', 'alice-1'), caption: "alice's entry" });
  });

  it('R5: a GM starting the vote early reveals the entries too', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await toVoting();
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('approved');
    expect((await feedOf(db(), 'approved')).find((p) => p.submissionId === a)).toMatchObject(photo('alice', 'alice-1'));
  });

  it('uses the voteWindowMin setting', async () => {
    await setup(['alice', 'bob'], { voteWindowMin: 7 });
    await enter('alice');
    await enter('bob');
    await advance('gm', addMin(T0, 5));
    expect(toMillis((await getData(db(), 'globalQuests/gq1'))!.votingEndsAt)).toBe(addMin(T0, 5).getTime() + 7 * MIN);
  });

  it('a GM can close entries early, before everyone has entered, then start the vote without checking', async () => {
    await setup();
    await enter('alice');
    expect(await advance()).toEqual({ status: 'checking' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    // The GM who closed them is right there, so the checking post doesn't buzz them.
    expect((await feedOf(db(), 'checking'))[0]).toMatchObject({ actorUid: 'gm' });
    expect(await advance()).toEqual({ status: 'voting' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('voting');
    expect(await feedOf(db(), 'voting-open')).toHaveLength(1);
  });

  it('a side quest nobody entered still goes to checking; starting the vote with no entries closes it with no winner', async () => {
    await setup();
    expect(await advance()).toEqual({ status: 'checking' });
    expect(await advance()).toEqual({ status: 'closed' });
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ status: 'closed', winnerUids: [] });
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
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
    await advance(); // checking → voting
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
    await toVoting(addMin(T0, 2)); // carol never entered
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
    await toVoting(addMin(T0, 2));
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
    await advance();
    await expectCode(vote('bob', a), 'failed-precondition'); // being checked
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

describe('checkEntry: the GM accepts or rejects entries before the vote', () => {
  /** alice, bob and carol enter; the last entry closes entries, so gq1 is checking. */
  async function checking(settings: Partial<Settings> = {}) {
    await setup(['alice', 'bob', 'carol'], settings);
    const a = (await enter('alice')).submissionId;
    const b = (await enter('bob')).submissionId;
    const c = (await enter('carol')).submissionId;
    return { a, b, c };
  }

  const check = (submissionId: string, accept: boolean, opts: { by?: string; note?: unknown; now?: Date } = {}) =>
    checkEntry(db(), ctx(opts.by ?? 'gm', opts.now ?? addMin(T0, 5)), {
      submissionId,
      accept,
      ...(opts.note === undefined ? {} : { note: opts.note }),
    });

  it('accepting keeps the entry sealed and hidden while others are still unchecked', async () => {
    const { a } = await checking();
    expect(await check(a, true, { note: '  nice  ' })).toEqual({ checked: 'accepted', status: 'checking', push: null });
    expect(await getData(db(), `submissions/${a}`)).toMatchObject({ status: 'sealed', checked: 'accepted', reviewedBy: 'gm', reviewNote: 'nice' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
  });

  it('rejecting throws the entry out with no fine and no public post; only its owner is told, with the note', async () => {
    const { b } = await checking();
    const res = await check(b, false, { note: 'Not a kazoo' });
    expect(res).toEqual({
      checked: 'rejected',
      status: 'checking',
      push: { to: ['bob'], exclude: 'gm', message: expect.objectContaining({ title: 'Entry not accepted', link: '#/account' }) },
    });
    expect(res.push?.message.body).toContain('Not a kazoo');
    expect(res.push?.message.body).toContain('Global gq1');
    expect(await getData(db(), `submissions/${b}`)).toMatchObject({ status: 'rejected', checked: 'rejected', reviewedBy: 'gm', reviewNote: 'Not a kazoo' });
    expect((await getPlayer(db(), 'bob')).points).toBe(0);
    expect(await ledgerFor(db(), 'bob')).toEqual([]);
    expect(await feedOf(db(), 'fraud')).toHaveLength(0);
    expect(await feedOf(db(), 'rejected')).toHaveLength(0);
  });

  it('checking every entry does not open the vote; the GM does, with the accepted entries revealed and a rejected one out', async () => {
    const { a, b, c } = await checking({ voteWindowMin: 10 });
    await check(a, true);
    await check(b, false);
    expect(await check(c, true, { now: addMin(T0, 7) })).toMatchObject({ checked: 'accepted', status: 'checking' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect((await getData(db(), `submissions/${c}`))?.status).toBe('sealed');
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);

    expect(await advance('gm', addMin(T0, 8))).toEqual({ status: 'voting' });
    const gq = await getData(db(), 'globalQuests/gq1');
    expect(gq?.status).toBe('voting');
    expect(toMillis(gq!.votingEndsAt)).toBe(addMin(T0, 8).getTime() + 10 * MIN);
    expect(await getData(db(), `submissions/${a}`)).toMatchObject({ status: 'approved', checked: 'accepted' });
    expect(await getData(db(), `submissions/${c}`)).toMatchObject({ status: 'approved', checked: 'accepted', reviewedBy: 'gm' });
    expect((await getData(db(), `submissions/${b}`))?.status).toBe('rejected');
    const posts = await feedOf(db(), 'approved');
    expect(posts.find((p) => p.submissionId === c)).toMatchObject(photo('carol', 'carol-1'));
    expect(posts.find((p) => p.submissionId === b)?.imagePath ?? null).toBeNull();
    expect(await feedOf(db(), 'voting-open')).toHaveLength(1);

    await expectCode(vote('alice', b, addMin(T0, 9)), 'invalid-argument');
    expect(await vote('alice', c, addMin(T0, 9))).toEqual({ closed: false });
  });

  it('rejecting every entry leaves it checking (late entries may come); starting the vote then closes it with no winner', async () => {
    const { a, b, c } = await checking();
    await check(a, false);
    await check(b, false);
    expect((await check(c, false)).status).toBe('checking');
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect(await advance()).toEqual({ status: 'closed' });
    expect(await getData(db(), 'globalQuests/gq1')).toMatchObject({ status: 'closed', winnerUids: [] });
    expect(await feedOf(db(), 'voting-open')).toHaveLength(0);
  });

  it('the GM can change their mind about an accepted entry while checking', async () => {
    const { a } = await checking();
    await check(a, true);
    expect((await check(a, false)).checked).toBe('rejected');
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('rejected');
    await expectCode(check(a, true), 'failed-precondition'); // thrown out is final
  });

  it("nobody checks their own entry; a lone GM's entry goes to the vote unchecked when they start it", async () => {
    await setup(['alice', 'bob']);
    await seedPlayer(db(), 'gm');
    const g = (await enter('gm')).submissionId;
    const a = (await enter('alice')).submissionId;
    const b = (await enter('bob')).submissionId;
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    await expectCode(check(g, true), 'permission-denied');
    await check(a, true);
    expect((await check(b, true)).status).toBe('checking');
    expect(await advance()).toEqual({ status: 'voting' });
    expect((await getData(db(), `submissions/${g}`))?.status).toBe('approved');
  });

  it("with two GMs, each checks the other's entry", async () => {
    await setup(['alice']);
    await seedAdmin(db(), 'gm2');
    await seedPlayer(db(), 'gm2');
    const g2 = (await enter('gm2')).submissionId;
    await enter('alice');
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    await expectCode(check(g2, true, { by: 'gm2' }), 'permission-denied');
    expect(await check(g2, true)).toMatchObject({ checked: 'accepted', status: 'checking' });
  });

  it('disqualifying while checking fines as before and leaves the vote to the GM', async () => {
    const { a, b, c } = await checking();
    await check(a, true);
    await check(b, true);
    await reviewSubmission(db(), ctx('gm', addMin(T0, 6)), { submissionId: c, approve: false, note: 'Faked it' });
    expect((await getPlayer(db(), 'carol')).points).toBe(-50);
    expect(await feedOf(db(), 'fraud')).toHaveLength(1);
    expect((await getData(db(), `submissions/${c}`))?.status).toBe('rejected');
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('sealed');
  });

  it('a late entry can be checked like any other', async () => {
    await setup();
    await enter('alice');
    await advance();
    const late = (await enter('bob', {}, addMin(T0, 40))).submissionId;
    expect(await check(late, false, { note: 'No hat', now: addMin(T0, 41) })).toMatchObject({ checked: 'rejected', status: 'checking' });
    expect((await getData(db(), `submissions/${late}`))?.status).toBe('rejected');
  });

  it('starting the vote while checking puts the unchecked entries in', async () => {
    const { a, b } = await checking();
    await check(a, false);
    expect(await advance()).toEqual({ status: 'voting' });
    expect((await getData(db(), `submissions/${b}`))?.status).toBe('approved');
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('rejected');
  });

  it('only works while the side quest is checking', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await expectCode(check(a, true), 'failed-precondition'); // still live
    await toVoting();
    await expectCode(check(a, true), 'failed-precondition'); // voting
  });

  it('refuses players, signed-out callers, unknown ids, personal claims and bad input', async () => {
    const { a } = await checking();
    await expectCode(check(a, true, { by: 'bob' }), 'permission-denied');
    await expectCode(checkEntry(db(), ctx(null), { submissionId: a, accept: true }), 'unauthenticated');
    await expectCode(check('nope', true), 'not-found');
    await db().doc('submissions/claim').set({ uid: 'bob', kind: 'personal', questId: 'q1', witnessUid: 'carol', status: 'pending', createdAt: T0 });
    await expectCode(check('claim', true), 'invalid-argument');
    await expectCode(checkEntry(db(), ctx('gm'), { submissionId: a, accept: 'yes' }), 'invalid-argument');
    await expectCode(check(a, false, { note: 'x'.repeat(501) }), 'invalid-argument');
    await expectCode(check(a, false, { note: 42 }), 'invalid-argument');
    expect((await getData(db(), `submissions/${a}`))?.status).toBe('sealed');
  });

  it('refuses once the game has ended', async () => {
    const { a } = await checking();
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(check(a, true), 'failed-precondition');
  });
});
