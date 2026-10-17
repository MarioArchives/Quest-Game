// Story missions (plan "Story missions, random-drop controls, standings and police check-ins", edge cases 1–18):
// side quests from the pack's ordered story list (catalogue.story), fired by the GM, judged by a vote or by
// submission with no GM check, with the mission's own fine for not entering and a bonus for the fastest entry.
// Plus the timer's random-drop switch (settings.autoSideQuests). setup() seeds a GM ('gm') who does not play.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { fireGlobalQuest, runTick } from '../src/game/globals.js';
import { reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, checkEntry, enterSideQuest } from '../src/game/votes.js';
import type { GamePack, StoryQuest } from '../src/shared/packs/types.js';
import { nextStoryId, storyStates, type FiredQuest } from '../src/shared/story.js';
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
  ledgerFor,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedGlobalTemplate,
  seedPlayer,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-story');

const STORY: StoryQuest[] = [
  { id: 's-body', title: 'The body is found', description: 'Your alibi, as a photo', judging: 'submit', windowMin: 20, points: 5, fastestBonus: 3, penalty: 4 },
  { id: 's-will', title: 'The will', description: 'The opening line of the new will', judging: 'vote' },
  { id: 's-lineup', title: 'The line-up', description: 'Your table as a police line-up', judging: 'vote', points: 7, fastestBonus: 2, penalty: 3 },
];
const PACK: GamePack = testPack({ catalogue: { ...lancaster().catalogue, story: STORY } });

/** Defaults the story falls back to: 10 points, a fine of 1, open 40 min, voting 20 min. */
const SETTINGS: Partial<Settings> = {
  sideQuestPoints: 10,
  sideQuestSkipPenalty: 1,
  globalWindowMin: 40,
  voteWindowMin: 20,
  fraudPenalty: 2,
  quietHours: null,
};

async function setup(settings: Partial<Settings> = {}, status: 'active' | 'paused' = 'active') {
  await seedGame(db(), { status, settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid);
}

const as = (uid: string | null, now: Date = T0, pack: GamePack = PACK) => ctx(uid, now, constRng(0), undefined, pack);

/** The GM fires a story mission (by id, with any of the GM's changes). Returns the side quest's id. */
async function fire(data: Record<string, unknown>, now: Date = T0, by = 'gm', pack: GamePack = PACK): Promise<string> {
  const { globalQuestId } = await fireGlobalQuest(db(), as(by, now, pack), { mode: 'story', ...data } as never);
  return globalQuestId;
}

const photo = (uid: string) => ({ imagePath: `submissions/${uid}/${uid}-1.jpg`, thumbPath: `submissions/${uid}/${uid}-1_thumb.jpg` });

async function enter(uid: string, questId: string, now: Date): Promise<string> {
  const { submissionId } = await enterSideQuest(db(), as(uid, now), { globalQuestId: questId, ...photo(uid), caption: `${uid}'s entry` });
  return submissionId;
}

const tick = (now: Date) => runTick(db(), now, constRng(0), PACK);
const advance = (questId: string, now: Date) => advanceGlobalQuest(db(), as('gm', now), { globalQuestId: questId });
const vote = (uid: string, questId: string, submissionId: string, now: Date) =>
  castVote(db(), as(uid, now), { globalQuestId: questId, submissionId });
const quest = async (id: string) => (await getData(db(), `globalQuests/${id}`))!;
const points = async (uid: string) => (await getPlayer(db(), uid)).points as number;
const reasons = async (uid: string) =>
  (await ledgerFor(db(), uid)).map((l) => [l.reason, l.delta]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe('storyStates and nextStoryId', () => {
  const fired = (storyId: string | null, status: FiredQuest['status']): FiredQuest => ({ storyId, status });

  it('with nothing fired, every one is still to come and the first is next', () => {
    expect(storyStates(STORY, [])).toEqual({ 's-body': 'not-yet', 's-will': 'not-yet', 's-lineup': 'not-yet' });
    expect(nextStoryId(STORY, [])).toBe('s-body');
  });

  it('marks closed ones done and open ones running (live, checking or voting); next is the first never fired', () => {
    const quests = [fired('s-body', 'closed'), fired('s-will', 'voting')];
    expect(storyStates(STORY, quests)).toEqual({ 's-body': 'done', 's-will': 'running', 's-lineup': 'not-yet' });
    expect(nextStoryId(STORY, quests)).toBe('s-lineup');
    expect(storyStates(STORY, [fired('s-body', 'live'), fired('s-will', 'checking')])).toMatchObject({ 's-body': 'running', 's-will': 'running' });
  });

  it("keeps the pack's order, whatever order they were fired in", () => {
    expect(nextStoryId(STORY, [fired('s-lineup', 'closed')])).toBe('s-body');
    expect(nextStoryId(STORY, [fired('s-body', 'closed'), fired('s-lineup', 'closed')])).toBe('s-will');
  });

  it('a mission fired again is running while its second run is open', () => {
    expect(storyStates(STORY, [fired('s-body', 'closed'), fired('s-body', 'live')])['s-body']).toBe('running');
  });

  it('has nothing next once every one has been fired', () => {
    expect(nextStoryId(STORY, STORY.map((s) => fired(s.id, 'closed')))).toBeNull();
    expect(nextStoryId([], [])).toBeNull();
  });

  it('ignores side quests that are not story missions, or name a mission the pack no longer has', () => {
    const quests = [fired(null, 'closed'), fired('s-gone', 'live')];
    expect(storyStates(STORY, quests)).toEqual({ 's-body': 'not-yet', 's-will': 'not-yet', 's-lineup': 'not-yet' });
    expect(nextStoryId(STORY, quests)).toBe('s-body');
  });
});

describe('firing a story mission (edge cases 1–4)', () => {
  it('opens it live with its own judging, window, points, fastest bonus and fine, no GM check, and the usual post', async () => {
    await setup();
    const id = await fire({ storyId: 's-body' });
    const q = await quest(id);
    expect(q).toMatchObject({
      title: 'The body is found',
      description: 'Your alibi, as a photo',
      source: 'story',
      storyId: 's-body',
      judging: 'submit',
      gmChecks: false,
      bonusPoints: 5,
      fastestBonus: 3,
      skipPenalty: 4,
      status: 'live',
      templateId: null,
    });
    expect(toMillis(q.startsAt)).toBe(T0.getTime());
    expect(toMillis(q.endsAt)).toBe(addMin(T0, 20).getTime());
    const posts = await feedOf(db(), 'global-open');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ ref: id, questTitle: 'The body is found' });
  });

  it('falls back to the settings for anything the story leaves out', async () => {
    await setup();
    const q = await quest(await fire({ storyId: 's-will' }));
    expect(q).toMatchObject({ judging: 'vote', gmChecks: false, bonusPoints: 10, fastestBonus: 0, skipPenalty: 1, storyId: 's-will' });
    expect(toMillis(q.endsAt)).toBe(addMin(T0, 40).getTime());
  });

  it("takes the GM's changes: how it is judged, its words, window, points, bonus and fine", async () => {
    await setup();
    const q = await quest(
      await fire({ storyId: 's-will', judging: 'submit', title: 'The new will', description: 'One line', windowMin: 15, points: 2, fastestBonus: 1, penalty: 6 }),
    );
    expect(q).toMatchObject({ title: 'The new will', description: 'One line', judging: 'submit', bonusPoints: 2, fastestBonus: 1, skipPenalty: 6, storyId: 's-will' });
    expect(toMillis(q.endsAt)).toBe(addMin(T0, 15).getTime());
  });

  it('refuses a player, a game that is not running, an unknown mission, and a pack with no story', async () => {
    await setup();
    await expectCode(fire({ storyId: 's-body' }, T0, 'alice'), 'permission-denied');
    await expectCode(fire({ storyId: 's-nope' }), 'not-found');
    await expectCode(fire({ storyId: 's-body' }, T0, 'gm', lancaster()), 'not-found');
    await db().doc('game/state').update({ status: 'paused' });
    await expectCode(fire({ storyId: 's-body' }), 'failed-precondition');
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
  });

  it.each([
    ['no mission id', { storyId: undefined }],
    ['a mission id that is not text', { storyId: 7 }],
    ['an unknown way of judging', { storyId: 's-body', judging: 'secret' }],
    ['a window under 5 minutes', { storyId: 's-body', windowMin: 4 }],
    ['a window over 180 minutes', { storyId: 's-body', windowMin: 181 }],
    ['a fractional window', { storyId: 's-body', windowMin: 12.5 }],
    ['negative points', { storyId: 's-body', points: -1 }],
    ['a fractional fastest bonus', { storyId: 's-body', fastestBonus: 1.5 }],
    ['a negative fine', { storyId: 's-body', penalty: -2 }],
    ['a blank title', { storyId: 's-body', title: '   ' }],
  ])('refuses %s', async (_label, data) => {
    await setup();
    await expectCode(fire(data), 'invalid-argument');
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
  });

  it('refuses a mission that is still live or voting; a closed one can run again', async () => {
    await setup();
    const first = await fire({ storyId: 's-body' });
    await expectCode(fire({ storyId: 's-body' }, addMin(T0, 1)), 'failed-precondition');
    await db().doc(`globalQuests/${first}`).update({ status: 'voting', votingEndsAt: ts(addMin(T0, 30)) });
    await expectCode(fire({ storyId: 's-body' }, addMin(T0, 2)), 'failed-precondition');
    await db().doc(`globalQuests/${first}`).update({ status: 'closed' });
    const again = await fire({ storyId: 's-body' }, addMin(T0, 3));
    expect(again).not.toBe(first);
    const runs = (await allDocs(db(), 'globalQuests')).filter((q) => q.storyId === 's-body');
    expect(runs.map((q) => q.status).sort()).toEqual(['closed', 'live']);
  });

  it('a random side quest still live moves on to checking, as before', async () => {
    await setup();
    await seedGlobalQuest(db(), 'old', { status: 'live', endsAt: addMin(T0, 30) });
    await fire({ storyId: 's-body' });
    expect((await quest('old')).status).toBe('checking');
  });

  it('a story mission still live moves on by its own mode: a vote opens its voting, a submission is scored', async () => {
    await setup();
    const lineup = await fire({ storyId: 's-lineup' });
    await enter('alice', lineup, addMin(T0, 1));
    await fire({ storyId: 's-body' }, addMin(T0, 2));
    expect((await quest(lineup)).status).toBe('voting');

    const body = (await allDocs(db(), 'globalQuests')).find((q) => q.storyId === 's-body')!.id;
    await enter('bob', body, addMin(T0, 3));
    await fire({ storyId: 's-will' }, addMin(T0, 4));
    expect((await quest(body)).status).toBe('closed');
    expect(await reasons('bob')).toEqual([
      ['fastest', 3],
      ['global-entry', 5],
    ]);
  });
});

describe('judged by submission (edge cases 5–11)', () => {
  /** s-body: 5 points to each entrant, +3 to the fastest, −4 for not entering, open 20 min from T0. */
  async function bodyMission(settings: Partial<Settings> = {}, over: Record<string, unknown> = {}) {
    await setup(settings);
    return fire({ storyId: 's-body', ...over });
  }

  it('when time is up the timer scores it: points to each entrant, the bonus to the fastest, the fine to the rest', async () => {
    const id = await bodyMission();
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    const res = await tick(addMin(T0, 21));
    expect(res.closed).toContain(id);
    expect(res.checking).not.toContain(id);

    const q = await quest(id);
    expect(q).toMatchObject({ status: 'closed', fastestSubmissionId: a, winnerUids: [] });
    expect(await points('alice')).toBe(8);
    expect(await points('bob')).toBe(5);
    expect(await points('carol')).toBe(-4);
    expect(await reasons('alice')).toEqual([
      ['fastest', 3],
      ['global-entry', 5],
    ]);
    expect(await reasons('bob')).toEqual([['global-entry', 5]]);
    expect(await reasons('carol')).toEqual([['skipped', -4]]);
    expect((await getData(db(), `submissions/${a}`))?.pointsAwarded).toBe(8);
    expect((await getData(db(), `submissions/${b}`))?.pointsAwarded).toBe(5);
  });

  it('reveals the entries with their evidence on their posts, never stops at checking, and posts one summary', async () => {
    const id = await bodyMission();
    const a = await enter('alice', id, addMin(T0, 1));
    await tick(addMin(T0, 21));
    const entry = (await getData(db(), `submissions/${a}`))!;
    expect(entry.status).toBe('approved');
    const post = (await getData(db(), `feed/${entry.feedId}`))!;
    expect(post).toMatchObject({ imagePath: photo('alice').imagePath, thumbPath: photo('alice').thumbPath, caption: "alice's entry" });
    expect(await feedOf(db(), 'checking')).toEqual([]);
    expect(await feedOf(db(), 'voting-open')).toEqual([]);
    const summary = await feedOf(db(), 'global-scored');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ ref: id, questTitle: 'The body is found' });
    expect(summary[0]!.text).toMatch(/Alice/);
  });

  it('spares players who left, players who joined after it opened, and a GM who does not play', async () => {
    const id = await bodyMission();
    await seedPlayer(db(), 'dave', { joinedAt: addMin(T0, 5) });
    await seedPlayer(db(), 'erin');
    await db().doc('players/erin').update({ left: 'frozen' });
    await enter('alice', id, addMin(T0, 1));
    await tick(addMin(T0, 21));
    expect(await reasons('dave')).toEqual([]);
    expect(await reasons('erin')).toEqual([]);
    expect(await ledgerFor(db(), 'gm')).toEqual([]);
    expect(await reasons('bob')).toEqual([['skipped', -4]]);
  });

  it('the last player still playing to enter scores it at once', async () => {
    const id = await bodyMission();
    await db().doc('players/carol').update({ left: 'out' });
    await enter('alice', id, addMin(T0, 1));
    expect((await quest(id)).status).toBe('live');
    await enter('bob', id, addMin(T0, 2));
    expect((await quest(id)).status).toBe('closed');
    expect(await points('alice')).toBe(8);
    expect(await points('bob')).toBe(5);
  });

  it('the GM closing entries early scores it at once', async () => {
    const id = await bodyMission();
    await enter('alice', id, addMin(T0, 1));
    expect(await advance(id, addMin(T0, 2))).toEqual({ status: 'closed' });
    expect(await points('alice')).toBe(8);
    expect(await points('bob')).toBe(-4);
    expect(await points('carol')).toBe(-4);
  });

  it('with no entries, everyone who could have entered is fined and nobody is fastest', async () => {
    const id = await bodyMission();
    await tick(addMin(T0, 21));
    expect(await quest(id)).toMatchObject({ status: 'closed', fastestSubmissionId: null });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([['skipped', -4]]);
  });

  it('with 0 points and no fastest bonus, entrants get no ledger lines but the fines still apply', async () => {
    const id = await bodyMission({}, { points: 0, fastestBonus: 0 });
    await enter('alice', id, addMin(T0, 1));
    await tick(addMin(T0, 21));
    expect(await ledgerFor(db(), 'alice')).toEqual([]);
    expect(await reasons('bob')).toEqual([['skipped', -4]]);
  });

  it('an entry disqualified before scoring is neither paid nor fastest, and its player counts as skipped', async () => {
    const id = await bodyMission();
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await reviewSubmission(db(), as('gm', addMin(T0, 3)), { submissionId: a, approve: false, note: 'Taken last week' });
    await tick(addMin(T0, 21));
    expect((await quest(id)).fastestSubmissionId).toBe(b);
    expect(await points('bob')).toBe(8);
    expect(await reasons('alice')).toEqual([
      ['fraud', -2],
      ['skipped', -4],
    ]);
  });

  it('a disqualification after scoring takes back the points and the bonus, plus the fraud fine', async () => {
    const id = await bodyMission();
    const a = await enter('alice', id, addMin(T0, 1));
    await tick(addMin(T0, 21));
    expect(await points('alice')).toBe(8);
    await reviewSubmission(db(), as('gm', addMin(T0, 25)), { submissionId: a, approve: false, note: 'Not a real alibi' });
    expect(await points('alice')).toBe(-2);
  });

  it('refuses entries once the deadline has passed, even before the timer runs', async () => {
    const id = await bodyMission();
    await expectCode(enter('alice', id, addMin(T0, 20)), 'failed-precondition');
    await expectCode(enter('alice', id, addMin(T0, 25)), 'failed-precondition');
    expect(await allDocs(db(), 'submissions')).toEqual([]);
  });

  it('a second timer run never pays or fines twice', async () => {
    const id = await bodyMission();
    await enter('alice', id, addMin(T0, 1));
    await tick(addMin(T0, 21));
    const before = (await allDocs(db(), 'pointsLedger')).length;
    const res = await tick(addMin(T0, 30));
    expect(res.closed).not.toContain(id);
    expect(await allDocs(db(), 'pointsLedger')).toHaveLength(before);
    expect(await feedOf(db(), 'global-scored')).toHaveLength(1);
  });

  it('respects the zero floor for the fines', async () => {
    await bodyMission({ pointsFloorZero: true });
    await db().doc('players/carol').update({ points: 2 });
    await tick(addMin(T0, 21));
    expect(await points('carol')).toBe(0);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
  });
});

describe('judged by a vote (edge cases 12–14)', () => {
  /** s-lineup: 7 to the winner, +2 to the fastest, −3 for not entering, open 40 min (the settings' window). */
  async function lineupMission() {
    await setup();
    return fire({ storyId: 's-lineup' });
  }

  it('when time is up it goes straight to voting: entries revealed, no checking', async () => {
    const id = await lineupMission();
    const a = await enter('alice', id, addMin(T0, 1));
    await enter('bob', id, addMin(T0, 2));
    const res = await tick(addMin(T0, 41));
    expect(res.checking).toEqual([]);
    const q = await quest(id);
    expect(q.status).toBe('voting');
    expect(toMillis(q.votingEndsAt)).toBe(addMin(T0, 61).getTime());
    const entry = (await getData(db(), `submissions/${a}`))!;
    expect(entry.status).toBe('approved');
    expect((await getData(db(), `feed/${entry.feedId}`))?.imagePath).toBe(photo('alice').imagePath);
    expect(await feedOf(db(), 'voting-open')).toHaveLength(1);
    expect(await feedOf(db(), 'checking')).toEqual([]);
  });

  it('goes to voting at once when everyone still playing is in, or when the GM closes entries', async () => {
    const id = await lineupMission();
    for (const [i, uid] of ['alice', 'bob', 'carol'].entries()) await enter(uid, id, addMin(T0, i + 1));
    expect((await quest(id)).status).toBe('voting');

    const next = await fire({ storyId: 's-will' }, addMin(T0, 5));
    await enter('alice', next, addMin(T0, 6));
    expect(await advance(next, addMin(T0, 7))).toEqual({ status: 'voting' });
  });

  it("with no entries it closes with no winner, and everyone pays the mission's own fine", async () => {
    const id = await lineupMission();
    await tick(addMin(T0, 41));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([['skipped', -3]]);
  });

  it('its entries are never checked by the GM', async () => {
    const id = await lineupMission();
    const a = await enter('alice', id, addMin(T0, 1));
    await expectCode(checkEntry(db(), as('gm', addMin(T0, 2)), { submissionId: a, accept: true }), 'failed-precondition');
    await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await expectCode(checkEntry(db(), as('gm', addMin(T0, 42)), { submissionId: a, accept: false }), 'failed-precondition');
  });

  it("the winner gets the bonus, the fastest gets the fastest bonus, and non-entrants pay the mission's own fine", async () => {
    const id = await lineupMission();
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('alice', id, b, addMin(T0, 42));
    await vote('carol', id, b, addMin(T0, 43));
    await vote('bob', id, a, addMin(T0, 44));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: ['bob'], fastestSubmissionId: a });
    expect(await reasons('bob')).toEqual([['global-win', 7]]);
    expect(await reasons('alice')).toEqual([['fastest', 2]]);
    expect(await reasons('carol')).toEqual([['skipped', -3]]);
    expect((await getData(db(), `submissions/${a}`))?.pointsAwarded).toBe(2);
    expect((await getData(db(), `submissions/${b}`))?.pointsAwarded).toBe(7);
  });

  it('the fastest who also wins gets both', async () => {
    const id = await lineupMission();
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('bob', id, a, addMin(T0, 42));
    await vote('carol', id, a, addMin(T0, 43));
    await vote('alice', id, b, addMin(T0, 44));
    expect(await points('alice')).toBe(9);
  });
});

describe('the timer, random drops and the end of the game (edge cases 15–18)', () => {
  async function tickSetup(settings: Partial<Settings>, next: Date | null = addMin(T0, -1)) {
    await setup(settings);
    await db().doc('game/state').update({ nextGlobalQuestAt: next ? ts(next) : null });
    await seedGlobalTemplate(db(), 'g01');
  }

  it('with random drops off, nothing drops, but expired side quests still move on and votes still close', async () => {
    await tickSetup({ autoSideQuests: false });
    await seedGlobalQuest(db(), 'old', { status: 'live', endsAt: addMin(T0, -5) });
    await seedGlobalQuest(db(), 'v', { status: 'voting', endsAt: addMin(T0, -40), votingEndsAt: addMin(T0, -1) });
    const res = await tick(T0);
    expect(res.opened).toBeNull();
    expect(res.checking).toEqual(['old']);
    expect(res.closed).toEqual(['v']);
    expect((await allDocs(db(), 'globalQuests')).filter((q) => q.status === 'live')).toEqual([]);
  });

  it('turned back on, a drop that came due meanwhile goes on the next tick', async () => {
    await tickSetup({ autoSideQuests: false });
    expect((await tick(T0)).opened).toBeNull();
    await db().doc('game/settings').update({ autoSideQuests: true });
    expect((await tick(addMin(T0, 1))).opened).not.toBeNull();
  });

  it('a due random drop waits while a story mission is live, and goes once it is not', async () => {
    await tickSetup({});
    const id = await fire({ storyId: 's-body' });
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, 5)) });
    const waiting = await tick(addMin(T0, 10));
    expect(waiting.opened).toBeNull();
    expect((await quest(id)).status).toBe('live');

    const after = await tick(addMin(T0, 21));
    expect((await quest(id)).status).toBe('closed');
    expect(after.opened).not.toBeNull();
    expect((await quest(after.opened!)).source).toBe('timer');
  });

  it('a side quest from before story missions (no new fields) still goes to checking and takes late entries', async () => {
    await tickSetup({}, addMin(T0, 60));
    await seedGlobalQuest(db(), 'old', { status: 'live', endsAt: addMin(T0, -5) });
    expect((await tick(T0)).checking).toEqual(['old']);
    await enter('alice', 'old', addMin(T0, 1));
    expect((await quest('old')).status).toBe('checking');
  });

  it('ending the game tallies a story vote (fastest bonus included); a live story mission closes with nothing paid or charged', async () => {
    await setup();
    const lineup = await fire({ storyId: 's-lineup' });
    const a = await enter('alice', lineup, addMin(T0, 1));
    const b = await enter('bob', lineup, addMin(T0, 2));
    await advance(lineup, addMin(T0, 3));
    await vote('alice', lineup, b, addMin(T0, 4));
    const body = await fire({ storyId: 's-body' }, addMin(T0, 5));
    await enter('alice', body, addMin(T0, 6));

    await endGame(db(), as('gm', addMin(T0, 7)), { venues: [] });
    expect(await quest(lineup)).toMatchObject({ status: 'closed', winnerUids: ['bob'], fastestSubmissionId: a });
    expect((await quest(body)).status).toBe('closed');
    expect(await reasons('alice')).toEqual([['fastest', 2]]);
    expect(await reasons('bob')).toEqual([['global-win', 7]]);
    expect(await reasons('carol')).toEqual([['skipped', -3]]);
  });
});
