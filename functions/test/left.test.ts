// Players who have left: the GM freezes them (kept on the leaderboard) or puts them out (off it and the final
// standings), or brings them back. Either way they can't play, be guessed or witness, and don't hold anyone up.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { guessQuest } from '../src/game/guesses.js';
import { setPlayerLeft } from '../src/game/left.js';
import { pushTokenId, sendPush, type PushSender } from '../src/game/push.js';
import { rerollQuest } from '../src/game/quests.js';
import { handleSubmissionCreated } from '../src/game/submissions.js';
import { castVote, enterSideQuest } from '../src/game/votes.js';
import {
  addMin,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  hand,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-left');

async function setup() {
  await seedGame(db(), { status: 'active' });
  await seedAdmin(db(), 'gm');
  const templates = await seedPersonalTemplates(db(), 20);
  await seedPlayer(db(), 'alice', { points: 120, quests: hand(templates.slice(0, 5)) });
  await seedPlayer(db(), 'bob', { points: 80, quests: hand(templates.slice(5, 10)) });
  await seedPlayer(db(), 'carol', { points: 40, quests: hand(templates.slice(10, 15)) });
  return templates;
}

const mark = (uid: string, left: 'frozen' | 'out' | null, by = 'gm', now = T0) => setPlayerLeft(db(), ctx(by, now), { uid, left });

describe('setPlayerLeft', () => {
  it('freezes a player: flagged, map pin removed, a quiet feed line, points kept', async () => {
    await setup();
    await db().doc('locations/carol').set({ lat: 54.05, lng: -2.8, accuracy: 10, updatedAt: ts(T0) });
    expect(await mark('carol', 'frozen')).toEqual({ left: 'frozen', push: null });

    const carol = await getPlayer(db(), 'carol');
    expect(carol).toMatchObject({ left: 'frozen', points: 40 });
    expect(await getData(db(), 'locations/carol')).toBeUndefined();
    const posts = await feedOf(db(), 'left');
    expect(posts).toEqual([expect.objectContaining({ uid: 'carol', actorUid: 'gm', text: 'Carol has left the game. Their score is frozen' })]);
  });

  it('brings a player back', async () => {
    await setup();
    await mark('carol', 'out');
    expect((await mark('carol', null)).left).toBeNull();
    expect((await getPlayer(db(), 'carol')).left).toBeNull();
    expect((await feedOf(db(), 'left')).map((p) => p.text)).toEqual(['Carol is out of the game', 'Carol is back in the game']);
  });

  it('does nothing when nothing changes', async () => {
    await setup();
    await mark('carol', 'frozen');
    expect(await mark('carol', 'frozen')).toEqual({ left: 'frozen', push: null });
    await mark('bob', null);
    expect(await feedOf(db(), 'left')).toHaveLength(1);
  });

  it('asks anyone waiting on them as witness to pick someone else', async () => {
    await setup();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'carol' });
    await seedSubmission(db(), 's2', { uid: 'bob', questId: 'q1', witnessUid: 'carol' });
    await seedSubmission(db(), 's3', { uid: 'alice', questId: 'q2', witnessUid: 'carol', status: 'approved' });
    const { push } = await mark('carol', 'frozen');
    expect(push).toEqual({ to: expect.arrayContaining(['alice', 'bob']), message: expect.objectContaining({ title: 'Pick another witness', link: '#/account' }) });
    expect(push?.to).toHaveLength(2);
    expect(push?.message.body).toContain('Carol');
    expect((await mark('carol', null)).push).toBeNull(); // bringing back asks nobody
  });

  it('putting a player out withdraws their side-quest entries still in play, not finished ones', async () => {
    await setup();
    await seedGlobalQuest(db(), 'live', { status: 'live' });
    await seedGlobalQuest(db(), 'voting', { status: 'voting', votingEndsAt: addMin(T0, 10) });
    await seedGlobalQuest(db(), 'done', { status: 'closed' });
    await seedSubmission(db(), 'e1', { uid: 'carol', kind: 'global', questId: 'live', witnessUid: null, status: 'sealed', evidence: true });
    await seedSubmission(db(), 'e2', { uid: 'carol', kind: 'global', questId: 'voting', witnessUid: null, status: 'approved', evidence: true });
    await seedSubmission(db(), 'e3', { uid: 'carol', kind: 'global', questId: 'done', witnessUid: null, status: 'approved', evidence: true });
    await mark('carol', 'out');
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('rejected');
    expect((await getData(db(), 'submissions/e2'))?.status).toBe('rejected');
    expect((await getData(db(), 'submissions/e3'))?.status).toBe('approved');
  });

  it('freezing keeps their side-quest entries in play', async () => {
    await setup();
    await seedGlobalQuest(db(), 'live', { status: 'live' });
    await seedSubmission(db(), 'e1', { uid: 'carol', kind: 'global', questId: 'live', witnessUid: null, status: 'sealed', evidence: true });
    await mark('carol', 'frozen');
    expect((await getData(db(), 'submissions/e1'))?.status).toBe('sealed');
  });

  it('is for GMs only, never on yourself, and checks its input', async () => {
    await setup();
    await expectCode(mark('carol', 'frozen', 'alice'), 'permission-denied');
    await expectCode(setPlayerLeft(db(), ctx(null), { uid: 'carol', left: 'frozen' }), 'unauthenticated');
    await seedPlayer(db(), 'gm');
    await expectCode(mark('gm', 'frozen'), 'permission-denied');
    await expectCode(mark('nobody', 'frozen'), 'not-found');
    await expectCode(setPlayerLeft(db(), ctx('gm'), { uid: 'carol', left: 'gone' }), 'invalid-argument');
    await expectCode(setPlayerLeft(db(), ctx('gm'), { left: 'frozen' }), 'invalid-argument');
    expect((await getPlayer(db(), 'carol')).left ?? null).toBeNull();
  });

  it('refuses once the game has ended', async () => {
    await setup();
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(mark('carol', 'frozen'), 'failed-precondition');
  });
});

describe('a player who has left', () => {
  it.each(['frozen', 'out'] as const)('(%s) cannot guess, reroll, enter or vote', async (left) => {
    const templates = await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'live' });
    await mark('carol', left);
    await expectCode(guessQuest(db(), ctx('carol'), { targetUid: 'alice', templateId: templates[0] }), 'permission-denied');
    await expectCode(rerollQuest(db(), ctx('carol'), { questId: 'q1' }), 'permission-denied');
    await expectCode(enterSideQuest(db(), ctx('carol'), { globalQuestId: 'gq1', caption: 'back!' }), 'permission-denied');
    await db().doc('globalQuests/gq1').update({ status: 'voting', votingEndsAt: ts(addMin(T0, 10)) });
    await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await expectCode(castVote(db(), ctx('carol'), { globalQuestId: 'gq1', submissionId: 'ea' }), 'permission-denied');
  });

  it("cannot be guessed: the guesser isn't charged and nothing is exposed", async () => {
    const templates = await setup();
    await mark('carol', 'frozen');
    await expectCode(guessQuest(db(), ctx('alice'), { targetUid: 'carol', templateId: templates[10] }), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).points).toBe(120);
    expect((await getPlayer(db(), 'carol')).points).toBe(40);
  });

  it('cannot be named as a witness, and cannot claim', async () => {
    await setup();
    await mark('carol', 'frozen');
    await seedSubmission(db(), 'to-carol', { uid: 'alice', questId: 'q1', witnessUid: 'carol' });
    await handleSubmissionCreated(db(), 'to-carol', T0);
    expect(await getData(db(), 'submissions/to-carol')).toMatchObject({ status: 'rejected', rejectReason: expect.stringContaining('left') });
    expect((await getData(db(), 'players/alice/quests/q1'))?.status).toBe('active');

    await seedSubmission(db(), 'by-carol', { uid: 'carol', questId: 'q1', witnessUid: 'alice' });
    await handleSubmissionCreated(db(), 'by-carol', T0);
    expect((await getData(db(), 'submissions/by-carol'))?.status).toBe('rejected');
  });

  it("doesn't hold up a side quest: entries close once everyone still playing is in", async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'live', endsAt: addMin(T0, 30) });
    await mark('carol', 'frozen');
    await enterSideQuest(db(), ctx('alice'), { globalQuestId: 'gq1', caption: 'mine' });
    expect((await enterSideQuest(db(), ctx('bob'), { globalQuestId: 'gq1', caption: 'mine too' })).checking).toBe(true);
  });

  it("doesn't hold up the vote: it closes once everyone still playing has voted", async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'voting', votingEndsAt: addMin(T0, 10) });
    await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await seedSubmission(db(), 'eb', { uid: 'bob', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await mark('carol', 'frozen');
    await castVote(db(), ctx('alice'), { globalQuestId: 'gq1', submissionId: 'eb' });
    expect(await castVote(db(), ctx('bob'), { globalQuestId: 'gq1', submissionId: 'ea' })).toEqual({ closed: true });
  });

  it('gets no more broadcast notifications', async () => {
    await setup();
    for (const uid of ['alice', 'bob', 'carol']) {
      await db().doc(`pushTokens/${pushTokenId(`tok-${uid}`)}`).set({ uid, token: `tok-${uid}`, createdAt: ts(T0), updatedAt: ts(T0) });
    }
    await mark('carol', 'frozen');
    const sent: string[] = [];
    const sender: PushSender = {
      async send(batch) {
        sent.push(...batch.map((b) => b.token));
        return batch.map(() => ({ ok: true }));
      },
    };
    await sendPush(db(), sender, { to: 'players', message: { title: 'New side quest', body: 'x', link: '#/' } });
    expect(sent.sort()).toEqual(['tok-alice', 'tok-bob']);
  });

  it('frozen stays in the final standings with their score; out gets no place and no wrap', async () => {
    await setup();
    await mark('bob', 'frozen');
    await mark('carol', 'out');
    expect(await endGame(db(), ctx('gm', addMin(T0, 5)))).toEqual({ players: 2 });
    const standings = (await getData(db(), 'game/final'))!.standings as Array<Record<string, unknown>>;
    expect(standings.map((s) => [s.uid, s.points, s.rank])).toEqual([
      ['alice', 120, 1],
      ['bob', 80, 2],
    ]);
    expect(await getData(db(), 'wraps/bob')).toBeDefined();
    expect(await getData(db(), 'wraps/carol')).toBeUndefined();
  });

  it('can play again once brought back', async () => {
    const templates = await setup();
    await mark('carol', 'frozen');
    await mark('carol', null, 'gm', addMin(T0, 1));
    expect(await guessQuest(db(), ctx('carol', addMin(T0, 2)), { targetUid: 'alice', templateId: templates[19] })).toEqual({ correct: false });
  });
});
