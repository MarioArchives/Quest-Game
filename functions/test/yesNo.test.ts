// Yes/no votes (plan "Voting takeover: polaroid swipe, the cork board, and yes/no voting", edge cases 1–9): the GM's
// voteStyle setting, copied onto a side quest as its vote opens; a yes or a no on every entry but your own, each sent
// on its own; the vote closing early once every ballot is complete; the winner on yes − no (ties all win, only when
// ahead); points per vote paid per yes; and one vote each ('pick') working exactly as before.
// setup() seeds a GM ('gm') who does not play, and alice, bob and carol.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { fireGlobalQuest, runTick } from '../src/game/globals.js';
import { reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, enterSideQuest } from '../src/game/votes.js';
import type { GamePack, StoryQuest } from '../src/shared/packs/types.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  constRng,
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
  seedSubmission,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-yes-no');

const STORY: StoryQuest[] = [
  {
    id: 's-weapon', title: 'The weapon', description: 'An object, and how it was done', judging: 'vote', question: 'What killed it?',
    points: 2, votePoints: 2, tieBonus: 1, penalty: 2, records: { key: 'weapon', label: 'The weapon' },
  },
  { id: 's-plain', title: 'Plain vote', description: 'As before', judging: 'vote', points: 5 },
  { id: 's-fast', title: 'Fast', description: 'Quick!', judging: 'vote', points: 4, fastestBonus: 3, penalty: 2 },
];
const PACK: GamePack = testPack({ catalogue: { ...lancaster().catalogue, story: STORY } });

/** 10 points, a fine of 1, open 40 min, voting 20 min; yes/no unless a test says otherwise. */
const SETTINGS: Partial<Settings> = {
  sideQuestPoints: 10,
  sideQuestSkipPenalty: 1,
  globalWindowMin: 40,
  voteWindowMin: 20,
  fraudPenalty: 2,
  quietHours: null,
  voteStyle: 'yesno',
};

async function setup(settings: Partial<Settings> = {}, players = ['alice', 'bob', 'carol']) {
  await seedGame(db(), { settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of players) await seedPlayer(db(), uid);
}

const as = (uid: string | null, now: Date = T0) => ctx(uid, now, constRng(0), undefined, PACK);

async function fire(storyId: string, now: Date = T0): Promise<string> {
  const { globalQuestId } = await fireGlobalQuest(db(), as('gm', now), { mode: 'story', storyId } as never);
  return globalQuestId;
}

const photo = (uid: string) => ({ imagePath: `submissions/${uid}/${uid}-1.jpg`, thumbPath: `submissions/${uid}/${uid}-1_thumb.jpg` });

async function enter(uid: string, questId: string, now: Date): Promise<string> {
  const { submissionId } = await enterSideQuest(db(), as(uid, now), { globalQuestId: questId, ...photo(uid), caption: `${uid}'s entry` });
  return submissionId;
}

const tick = (now: Date) => runTick(db(), now, constRng(0), PACK);
const advance = (questId: string, now: Date) => advanceGlobalQuest(db(), as('gm', now), { globalQuestId: questId });
const judge = (uid: string, questId: string, submissionId: string, vote: unknown, now: Date) =>
  castVote(db(), as(uid, now), { globalQuestId: questId, submissionId, vote } as never);
const pick = (uid: string, questId: string, submissionId: string, now: Date) => castVote(db(), as(uid, now), { globalQuestId: questId, submissionId });
const quest = async (id: string) => (await getData(db(), `globalQuests/${id}`))!;
const submission = async (id: string) => (await getData(db(), `submissions/${id}`))!;
const voteDoc = (questId: string, uid: string) => getData(db(), `globalQuests/${questId}/votes/${uid}`);
const points = async (uid: string) => (await getPlayer(db(), uid)).points as number;
const reasons = async (uid: string) =>
  (await ledgerFor(db(), uid)).map((l) => [l.reason, l.delta]).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1]));

/**
 * Fires a story mission, the given players enter it (a minute apart), and its vote opens: by the timer at the end of
 * the window, or at once when everyone has entered. `at(m)` is m minutes into the vote; `ends` its deadline.
 */
async function openVote(entrants: string[], opts: { storyId?: string; settings?: Partial<Settings>; players?: string[] } = {}) {
  await setup(opts.settings, opts.players);
  const id = await fire(opts.storyId ?? 's-weapon');
  const subs: Record<string, string> = {};
  for (const [i, uid] of entrants.entries()) subs[uid] = await enter(uid, id, addMin(T0, 1 + i));
  if ((await quest(id)).status === 'live') await tick(addMin(T0, 41));
  const q = await quest(id);
  expect(q.status).toBe('voting');
  const endsMs = toMillis(q.votingEndsAt);
  const at = (m: number) => new Date(endsMs - 20 * MIN + m * MIN);
  return { id, subs, at, ends: new Date(endsMs) };
}

describe('the way of voting is fixed when the vote opens (edge case 1)', () => {
  it('a vote opened with the setting on yes/no records it, and asks the question its story mission asks', async () => {
    const { id } = await openVote(['alice', 'bob']);
    expect(await quest(id)).toMatchObject({ voteStyle: 'yesno', question: 'What killed it?' });
  });

  it('with the engine default, a vote opens as one vote each; a mission without a question has none', async () => {
    const { id } = await openVote(['alice', 'bob'], { storyId: 's-plain', settings: { voteStyle: DEFAULT_SETTINGS.voteStyle } });
    const q = await quest(id);
    expect(q.voteStyle).toBe('pick');
    expect(q.question ?? null).toBeNull();
  });

  it('a vote the GM opens after checking the entries records it too', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'live', startsAt: addMin(T0, -10), endsAt: addMin(T0, 30) });
    await enterSideQuest(db(), as('alice', T0), { globalQuestId: 'gq1', ...photo('alice'), caption: 'a' });
    await enterSideQuest(db(), as('bob', addMin(T0, 1)), { globalQuestId: 'gq1', ...photo('bob'), caption: 'b' });
    await advance('gq1', addMin(T0, 2));
    expect((await quest('gq1')).status).toBe('checking');
    await advance('gq1', addMin(T0, 3));
    expect(await quest('gq1')).toMatchObject({ status: 'voting', voteStyle: 'yesno' });
  });

  it('changing the setting mid-vote leaves the open vote as it was', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    await db().doc('game/settings').update({ voteStyle: 'pick' });
    await judge('carol', id, subs.alice!, 'yes', at(1));
    expect((await voteDoc(id, 'carol'))!.ballot).toEqual({ [subs.alice!]: 'yes' });
    await expectCode(pick('carol', id, subs.bob!, at(2)), 'invalid-argument');
    expect((await quest(id)).voteStyle).toBe('yesno');
  });

  it('a side quest in voting without the field (from before) takes one vote each', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'voting', votingEndsAt: addMin(T0, 10) });
    await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await seedSubmission(db(), 'eb', { uid: 'bob', kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true });
    await expectCode(judge('carol', 'gq1', 'ea', 'yes', T0), 'invalid-argument');
    expect(await pick('carol', 'gq1', 'ea', T0)).toEqual({ closed: false });
    expect((await voteDoc('gq1', 'carol'))!.submissionId).toBe('ea');
  });
});

describe('what castVote takes in a yes/no vote (edge case 2)', () => {
  it.each([
    ['no judgement', undefined],
    ['maybe', 'maybe'],
    ['a number', 1],
    ['true', true],
    ['YES in capitals', 'YES'],
  ])('refuses %s', async (_label, vote) => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    await expectCode(judge('carol', id, subs.alice!, vote, at(1)), 'invalid-argument');
    expect(await voteDoc(id, 'carol')).toBeUndefined();
  });

  it('refuses a judgement in a vote of one vote each', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { settings: { voteStyle: 'pick' } });
    await expectCode(judge('carol', id, subs.alice!, 'yes', at(1)), 'invalid-argument');
    await expectCode(judge('carol', id, subs.alice!, 'no', at(1)), 'invalid-argument');
  });

  it('refuses a judgement on your own entry, yes or no, in either way of voting', async () => {
    const yesNo = await openVote(['alice', 'bob']);
    await expectCode(judge('alice', yesNo.id, yesNo.subs.alice!, 'yes', yesNo.at(1)), 'permission-denied');
    await expectCode(judge('alice', yesNo.id, yesNo.subs.alice!, 'no', yesNo.at(1)), 'permission-denied');
  });

  it('refuses your own entry in a vote of one vote each, as before', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { settings: { voteStyle: 'pick' } });
    await expectCode(pick('alice', id, subs.alice!, at(1)), 'permission-denied');
  });

  it('refuses a judgement once the deadline has passed', async () => {
    const { id, subs, ends } = await openVote(['alice', 'bob']);
    await expectCode(judge('carol', id, subs.alice!, 'yes', ends), 'failed-precondition');
  });

  it("refuses another side quest's entry", async () => {
    const { id, at } = await openVote(['alice', 'bob']);
    await seedGlobalQuest(db(), 'other', { status: 'live' });
    await seedSubmission(db(), 'elsewhere', { uid: 'bob', kind: 'global', questId: 'other', witnessUid: null, status: 'sealed', evidence: true });
    await expectCode(judge('carol', id, 'elsewhere', 'yes', at(1)), 'invalid-argument');
  });

  it('refuses a player who has left, and the GM who does not play', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    await db().doc('players/carol').update({ left: 'out' });
    await expectCode(judge('carol', id, subs.alice!, 'yes', at(1)), 'permission-denied');
    await expectCode(judge('gm', id, subs.alice!, 'yes', at(1)), 'permission-denied');
  });
});

describe('a ballot (edge case 3)', () => {
  it('collects each judgement into one vote doc, each sent on its own', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    expect(await judge('carol', id, subs.alice!, 'yes', at(1))).toEqual({ closed: false });
    expect(await judge('carol', id, subs.bob!, 'no', at(2))).toEqual({ closed: false });
    const doc = (await voteDoc(id, 'carol'))!;
    expect(doc.ballot).toEqual({ [subs.alice!]: 'yes', [subs.bob!]: 'no' });
    expect(doc.submissionId).toBeUndefined();
  });

  it('a changed mind replaces that judgement, keeping when the ballot was started', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    const first = (await voteDoc(id, 'carol'))!;
    await judge('carol', id, subs.alice!, 'no', at(3));
    const doc = (await voteDoc(id, 'carol'))!;
    expect(doc.ballot).toEqual({ [subs.alice!]: 'no' });
    expect(toMillis(doc.createdAt)).toBe(toMillis(first.createdAt));
    expect(toMillis(doc.createdAt)).toBe(at(1).getTime());
    expect(toMillis(doc.updatedAt)).toBe(at(3).getTime());
  });
});

describe('closing early (edge case 4)', () => {
  it('closes once every player has judged every entry but their own, not before', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob', 'carol']);
    const { alice: a, bob: b, carol: c } = subs as Record<string, string>;
    await judge('alice', id, b, 'yes', at(1));
    await judge('alice', id, c, 'no', at(1));
    await judge('bob', id, a, 'yes', at(2));
    await judge('bob', id, c, 'yes', at(2));
    // carol is one entry short.
    expect(await judge('carol', id, a, 'yes', at(3))).toEqual({ closed: false });
    expect((await quest(id)).status).toBe('voting');
    expect(await judge('carol', id, b, 'no', at(4))).toEqual({ closed: true });
    expect((await quest(id)).status).toBe('closed');
  });

  it('a changed mind on a complete ballot does not close it while others are still judging', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'yes', at(1));
    expect(await judge('carol', id, subs.bob!, 'no', at(2))).toEqual({ closed: false });
    await judge('alice', id, subs.bob!, 'yes', at(3));
    expect(await judge('bob', id, subs.alice!, 'no', at(4))).toEqual({ closed: true });
  });

  it('does not wait for a player who has left', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave'] });
    await db().doc('players/dave').update({ left: 'frozen' });
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'yes', at(1));
    await judge('alice', id, subs.bob!, 'yes', at(2));
    expect(await judge('bob', id, subs.alice!, 'yes', at(3))).toEqual({ closed: true });
  });

  it('does not ask for a judgement on an entry thrown out mid-vote', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob', 'carol']);
    const { alice: a, bob: b, carol: c } = subs as Record<string, string>;
    await reviewSubmission(db(), as('gm', at(1)), { submissionId: c, approve: false });
    await judge('alice', id, b, 'yes', at(2));
    await judge('bob', id, a, 'no', at(2));
    // carol's own entry is gone, but carol still votes on the others.
    await judge('carol', id, a, 'yes', at(3));
    expect(await judge('carol', id, b, 'yes', at(3))).toEqual({ closed: true });
  });
});

describe('the count (edge case 5)', () => {
  it('publishes the yeses and noes of every entry, zeros included, with yes − no in the tally', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob', 'carol']);
    const { alice: a, bob: b, carol: c } = subs as Record<string, string>;
    await judge('alice', id, b, 'yes', at(1));
    await judge('bob', id, a, 'yes', at(1));
    await judge('carol', id, a, 'yes', at(1));
    await judge('carol', id, b, 'no', at(1));
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q.status).toBe('closed');
    expect(q.yesNo).toEqual({ [a]: { yes: 2, no: 0 }, [b]: { yes: 1, no: 1 }, [c]: { yes: 0, no: 0 } });
    expect(q.tally).toEqual({ [a]: 2, [b]: 0, [c]: 0 });
    expect(q.winnerUids).toEqual(['alice']);
    expect(q.winningSubmissionIds).toEqual([a]);
  });

  it('wins on yes − no, not on the most yeses', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave', 'erin', 'fay'] });
    const { alice: a, bob: b } = subs as Record<string, string>;
    // alice: 3 yes, 2 no (net 1). bob: 2 yes, no noes (net 2). (Each no comes with a yes: the rule of at least one.)
    await judge('bob', id, a, 'yes', at(1));
    await judge('carol', id, a, 'yes', at(1));
    await judge('dave', id, a, 'yes', at(1));
    await judge('erin', id, b, 'yes', at(1));
    await judge('fay', id, b, 'yes', at(1));
    await judge('erin', id, a, 'no', at(2));
    await judge('fay', id, a, 'no', at(2));
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q.yesNo).toEqual({ [a]: { yes: 3, no: 2 }, [b]: { yes: 2, no: 0 } });
    expect(q.tally).toEqual({ [a]: 1, [b]: 2 });
    expect(q.winnerUids).toEqual(['bob']);
  });

  it('every entry tied on the top net wins, each getting the tie bonus', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'yes', at(1));
    await tick(addMin(ends, 1));
    expect((await quest(id)).winnerUids.sort()).toEqual(['alice', 'bob']);
    expect(await reasons('alice')).toEqual([['global-votes', 2], ['global-win', 1]]);
    expect(await reasons('bob')).toEqual([['global-votes', 2], ['global-win', 1]]);
  });

  it('nobody wins when no entry is ahead: no win post, and the fact records no entries', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'no', at(1));
    await judge('bob', id, subs.alice!, 'no', at(1));
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q).toMatchObject({ status: 'closed', winnerUids: [], winningSubmissionIds: [] });
    expect(q.tally).toEqual({ [subs.alice!]: 0, [subs.bob!]: -1 });
    expect(await feedOf(db(), 'global-won')).toEqual([]);
    expect((await getData(db(), 'facts/weapon'))!.entries).toEqual([]);
  });

  it('nobody wins with no ballots at all', async () => {
    const { id, subs, ends } = await openVote(['alice', 'bob']);
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q.winnerUids).toEqual([]);
    expect(q.yesNo).toEqual({ [subs.alice!]: { yes: 0, no: 0 }, [subs.bob!]: { yes: 0, no: 0 } });
  });

  it('ignores judgements on entries that are not in the vote, and values that are not yes or no', async () => {
    const { id, subs, ends } = await openVote(['alice', 'bob']);
    await db().doc(`globalQuests/${id}/votes/carol`).set({ ballot: { [subs.alice!]: 'maybe', [subs.bob!]: 'yes', gone: 'yes' }, createdAt: ts(T0) });
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q.yesNo).toEqual({ [subs.alice!]: { yes: 0, no: 0 }, [subs.bob!]: { yes: 1, no: 0 } });
    expect(q.winnerUids).toEqual(['bob']);
  });
});

describe('what it pays (edge case 6)', () => {
  /**
   * alice: 2 yes, 1 no (net 1, wins). bob: 1 yes, 2 no (net −1). carol, dave and erin don't enter; dave doesn't vote
   * either. alice and bob each have only the other's entry to judge, so a no alone is fine for them.
   */
  async function scored() {
    const run = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave', 'erin'] });
    const { alice: a, bob: b } = run.subs as Record<string, string>;
    await judge('carol', run.id, a, 'yes', run.at(1));
    await judge('erin', run.id, a, 'yes', run.at(1));
    await judge('bob', run.id, a, 'no', run.at(1));
    await judge('erin', run.id, b, 'yes', run.at(1));
    await judge('alice', run.id, b, 'no', run.at(1));
    await judge('carol', run.id, b, 'no', run.at(1));
    await tick(addMin(run.ends, 1));
    return run;
  }

  it('points per vote for every yes, a win for the sole entry ahead, and the fine for not entering', async () => {
    const { id, subs } = await scored();
    expect((await quest(id)).winnerUids).toEqual(['alice']);
    expect(await reasons('alice')).toEqual([['global-votes', 4], ['global-win', 2]]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
    expect((await submission(subs.alice!)).pointsAwarded).toBe(6);
  });

  it('an entry behind on the net still gets its points per yes, and a no takes nothing away', async () => {
    const { subs } = await scored();
    expect(await reasons('bob')).toEqual([['global-votes', 2]]);
    expect((await submission(subs.bob!)).pointsAwarded).toBe(2);
  });

  it("a fraud override takes back an entry's yes points as well as its win", async () => {
    const { subs, ends } = await scored();
    expect(await points('alice')).toBe(6);
    await reviewSubmission(db(), as('gm', addMin(ends, 5)), { submissionId: subs.alice!, approve: false });
    expect(await points('alice')).toBe(-2);
    expect(await reasons('alice')).toContainEqual(['reversal', -6]);
  });

  it('a mission without points per vote pays only the win', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob'], { storyId: 's-plain' });
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'no', at(1));
    await tick(addMin(ends, 1));
    expect(await reasons('alice')).toEqual([['global-win', 5]]);
    expect(await reasons('bob')).toEqual([]);
  });

  it('pays the fastest entry and fines those who did not enter, as before', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob'], { storyId: 's-fast' });
    await judge('carol', id, subs.bob!, 'yes', at(1));
    await tick(addMin(ends, 1));
    expect((await quest(id)).fastestSubmissionId).toBe(subs.alice);
    expect(await reasons('alice')).toEqual([['fastest', 3]]);
    expect(await reasons('bob')).toEqual([['global-win', 4]]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
  });
});

describe('the words (edge case 7)', () => {
  it('the win post gives the yeses and noes', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('bob', id, subs.alice!, 'yes', at(1));
    await judge('carol', id, subs.bob!, 'no', at(1));
    await tick(addMin(ends, 1));
    const won = await feedOf(db(), 'global-won');
    expect(won).toHaveLength(1);
    expect(won[0]!.text).toMatch(/^Alice won the .+ "The weapon" with 2 yes · 0 no$/);
  });

  it('the fact records the winner with yes − no as its votes, and its yeses and noes', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob']);
    await judge('carol', id, subs.alice!, 'yes', at(1));
    await judge('bob', id, subs.alice!, 'yes', at(1));
    await judge('alice', id, subs.bob!, 'no', at(1));
    await tick(addMin(ends, 1));
    expect((await getData(db(), 'facts/weapon'))!.entries).toEqual([
      expect.objectContaining({ submissionId: subs.alice, uid: 'alice', votes: 2, yes: 2, no: 0 }),
    ]);
  });
});

describe('every way a vote closes counts the ballots (edge case 8)', () => {
  /** carol: yes to alice, no to bob. */
  async function oneBallot() {
    const run = await openVote(['alice', 'bob']);
    await judge('carol', run.id, run.subs.alice!, 'yes', run.at(1));
    await judge('carol', run.id, run.subs.bob!, 'no', run.at(1));
    return run;
  }

  it('the timer, at the deadline', async () => {
    const { id, ends } = await oneBallot();
    await tick(addMin(ends, 1));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: ['alice'] });
  });

  it('the GM ending the vote', async () => {
    const { id, at } = await oneBallot();
    await advance(id, at(2));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: ['alice'] });
    expect((await quest(id)).yesNo).toBeTruthy();
  });

  it('the GM ending the game', async () => {
    const { id, at } = await oneBallot();
    await endGame(db(), as('gm', at(2)), { venues: [] });
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: ['alice'] });
    expect(await reasons('alice')).toEqual([['global-votes', 2], ['global-win', 2]]);
  });
});

describe('one vote each, as before (edge case 9)', () => {
  it('keeps the vote doc as it was, replaces a re-vote, closes early, and posts "with N votes"', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { settings: { voteStyle: 'pick' } });
    await pick('carol', id, subs.bob!, at(1));
    expect(await pick('carol', id, subs.alice!, at(2))).toEqual({ closed: false });
    const doc = (await voteDoc(id, 'carol'))!;
    expect(doc.submissionId).toBe(subs.alice);
    expect(doc.ballot).toBeUndefined();
    await pick('bob', id, subs.alice!, at(3));
    expect(await pick('alice', id, subs.bob!, at(4))).toEqual({ closed: true });
    const q = await quest(id);
    expect(q.tally).toEqual({ [subs.alice!]: 2, [subs.bob!]: 1 });
    expect(q.yesNo ?? null).toBeNull();
    expect(q.winnerUids).toEqual(['alice']);
    expect((await feedOf(db(), 'global-won'))[0]!.text).toMatch(/with 2 votes$/);
    expect(await reasons('alice')).toEqual([['global-votes', 4], ['global-win', 2]]);
  });
});

describe('at least one yes', () => {
  it('refuses the no that would finish a ballot without a yes, and keeps the ballot as it was', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave'] });
    await judge('carol', id, subs.alice!, 'no', at(1));
    await expectCode(judge('carol', id, subs.bob!, 'no', at(2)), 'failed-precondition');
    expect((await voteDoc(id, 'carol'))!.ballot).toEqual({ [subs.alice!]: 'no' });
    // A yes finishes it.
    expect(await judge('carol', id, subs.bob!, 'yes', at(3))).toMatchObject({ closed: false });
    expect((await voteDoc(id, 'carol'))!.ballot).toEqual({ [subs.alice!]: 'no', [subs.bob!]: 'yes' });
  });

  it('refuses turning your only yes into a no', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave'] });
    await judge('carol', id, subs.alice!, 'no', at(1));
    await judge('carol', id, subs.bob!, 'yes', at(1));
    await expectCode(judge('carol', id, subs.bob!, 'no', at(2)), 'failed-precondition');
    // With another yes it may go.
    await judge('carol', id, subs.alice!, 'yes', at(3));
    expect(await judge('carol', id, subs.bob!, 'no', at(4))).toMatchObject({ closed: false });
  });

  it('lets a no on the only entry you can judge stand', async () => {
    const { id, subs, at } = await openVote(['alice', 'bob'], { players: ['alice', 'bob', 'carol', 'dave'] });
    expect(await judge('bob', id, subs.alice!, 'no', at(1))).toMatchObject({ closed: false });
    expect((await voteDoc(id, 'bob'))!.ballot).toEqual({ [subs.alice!]: 'no' });
  });

  it('counts nothing from a ballot without a yes, so leaving the last entry unjudged gets round nothing', async () => {
    const { id, subs, at, ends } = await openVote(['alice', 'bob', 'carol'], { players: ['alice', 'bob', 'carol', 'dave'] });
    const { alice: a, bob: b, carol: c } = subs as Record<string, string>;
    // dave says no to alice and bob and stops before carol's: none of it counts.
    await judge('dave', id, a, 'no', at(1));
    await judge('dave', id, b, 'no', at(1));
    // bob's no on alice counts, beside his yes on carol.
    await judge('bob', id, a, 'no', at(1));
    await judge('bob', id, c, 'yes', at(1));
    await tick(addMin(ends, 1));
    const q = await quest(id);
    expect(q.yesNo).toEqual({ [a]: { yes: 0, no: 1 }, [b]: { yes: 0, no: 0 }, [c]: { yes: 1, no: 0 } });
    expect(q.winnerUids).toEqual(['carol']);
  });
});
