// The story engine for an arc like the mystery pack's (plan "Mystery pack: minimal notifications, Bob's story arc, and
// the facts behind Case closed", edge cases 11–24): a long-running mission open alongside the rest, entries that name
// a player or are dealt one, video and text entries, points per vote with a tie rule, facts recorded from winners and
// announcements, and an announcement that opens another mission's vote. setup() seeds a GM ('gm') who does not play.
import { describe, expect, it } from 'vitest';
import { endGame } from '../src/game/endGame.js';
import { fireGlobalQuest, runTick } from '../src/game/globals.js';
import { resetGame } from '../src/game/reset.js';
import { reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, enterSideQuest } from '../src/game/votes.js';
import type { GamePack, StoryQuest } from '../src/shared/packs/types.js';
import { storyStates } from '../src/shared/story.js';
import { LEDGER_REASON_LIST, type Settings } from '../src/shared/types.js';
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
  seedGlobalTemplate,
  seedPlayer,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-story-arc');

/** An arc with every new kind of beat, in the mystery pack's order (with a plain vote mission for regressions). */
const ARC: StoryQuest[] = [
  {
    id: 's-photo', title: 'Incriminating evidence', description: 'Catch another player in the act',
    judging: 'vote', longRun: true, windowMin: 300, entry: { tag: 'player' }, points: 2, votePoints: 2, tieBonus: 1, penalty: 2,
  },
  { id: 's-motive', title: 'Motive', description: 'Why did they do it?', judging: 'submit', windowMin: 30, entry: { media: 'text', tag: 'assigned' }, points: 2, penalty: 2 },
  { id: 's-old-days', title: 'The good old days', description: 'A fond memory', judging: 'vote', points: 2, votePoints: 2, penalty: 2 },
  {
    id: 's-weapon', title: 'The weapon', description: 'An object, and how it was done', judging: 'vote', entry: { caption: 'required' },
    points: 2, votePoints: 2, tieBonus: 1, penalty: 2, records: { key: 'weapon', label: 'The weapon' },
  },
  { id: 's-time', kind: 'announce', title: 'Time of death', description: 'New evidence: it happened at 11:02 pm.', fact: { key: 'timeOfDeath', label: 'Time of death', value: '23:02' } },
  { id: 's-alibi', title: "Couldn't be me", description: 'A video alibi', judging: 'vote', entry: { media: 'video' }, points: 2, votePoints: 2, tieBonus: 1, penalty: 2 },
  { id: 's-reveal', kind: 'announce', title: 'New evidence is revealed!', description: 'The photos are out: vote.', opensVoteOn: 's-photo' },
  { id: 's-plain', title: 'Plain vote', description: 'As before', judging: 'vote', points: 5 },
];
const PACK: GamePack = testPack({ catalogue: { ...lancaster().catalogue, story: ARC } });

/** Defaults: 10 points, a fine of 1, open 40 min, voting 20 min. */
const SETTINGS: Partial<Settings> = {
  sideQuestPoints: 10,
  sideQuestSkipPenalty: 1,
  globalWindowMin: 40,
  voteWindowMin: 20,
  fraudPenalty: 2,
  quietHours: null,
};

async function setup(settings: Partial<Settings> = {}) {
  await seedGame(db(), { settings: { ...SETTINGS, ...settings } });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid);
}

const as = (uid: string | null, now: Date = T0) => ctx(uid, now, constRng(0), undefined, PACK);

async function fire(storyId: string, now: Date = T0, extra: Record<string, unknown> = {}): Promise<string> {
  const { globalQuestId } = await fireGlobalQuest(db(), as('gm', now), { mode: 'story', storyId, ...extra } as never);
  return globalQuestId;
}

const photo = (uid: string, n = 1) => ({ imagePath: `submissions/${uid}/${uid}-${n}.jpg`, thumbPath: `submissions/${uid}/${uid}-${n}_thumb.jpg` });

/** Enters with whatever is given (no photo unless it is in `data`). */
async function enterRaw(uid: string, questId: string, data: Record<string, unknown>, now: Date): Promise<string> {
  const { submissionId } = await enterSideQuest(db(), as(uid, now), { globalQuestId: questId, ...data } as never);
  return submissionId;
}

/** A photo and a caption, plus anything else (a tag). */
const enter = (uid: string, questId: string, now: Date, extra: Record<string, unknown> = {}) =>
  enterRaw(uid, questId, { ...photo(uid), caption: `${uid}'s entry`, ...extra }, now);

const tick = (now: Date) => runTick(db(), now, constRng(0), PACK);
const advance = (questId: string, now: Date) => advanceGlobalQuest(db(), as('gm', now), { globalQuestId: questId });
const vote = (uid: string, questId: string, submissionId: string, now: Date) => castVote(db(), as(uid, now), { globalQuestId: questId, submissionId });
const quest = async (id: string) => (await getData(db(), `globalQuests/${id}`))!;
const submission = async (id: string) => (await getData(db(), `submissions/${id}`))!;
const points = async (uid: string) => (await getPlayer(db(), uid)).points as number;
const reasons = async (uid: string) =>
  (await ledgerFor(db(), uid)).map((l) => [l.reason, l.delta]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
const fact = (key: string) => getData(db(), `facts/${key}`);
const storyQuests = async (storyId: string) => (await allDocs(db(), 'globalQuests')).filter((q) => q.storyId === storyId);

describe('a long-running mission runs alongside the rest (edge case 11)', () => {
  it('firing other story missions leaves it live', async () => {
    await setup();
    const photoId = await fire('s-photo');
    await fire('s-old-days', addMin(T0, 1));
    await fire('s-weapon', addMin(T0, 2));
    expect((await quest(photoId)).status).toBe('live');
  });

  it('a random mission fired by the GM, or dropped by the timer, leaves it live; it does not hold back random drops', async () => {
    await setup();
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalTemplate(db(), 'g02');
    const photoId = await fire('s-photo');
    await fireGlobalQuest(db(), as('gm', addMin(T0, 1)), { mode: 'random' });
    expect((await quest(photoId)).status).toBe('live');
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, 2)) });
    const res = await tick(addMin(T0, 3));
    expect(res.opened).not.toBeNull();
    expect((await quest(photoId)).status).toBe('live');
  });

  it('every other mission still keeps to one live at a time', async () => {
    await setup();
    const photoId = await fire('s-photo');
    const oldDays = await fire('s-old-days', addMin(T0, 1));
    await enter('alice', oldDays, addMin(T0, 2));
    await fire('s-weapon', addMin(T0, 3));
    expect((await quest(oldDays)).status).toBe('voting');
    expect((await quest(photoId)).status).toBe('live');
  });

  it('copies its settings onto the side quest', async () => {
    await setup();
    expect(await quest(await fire('s-photo'))).toMatchObject({
      longRun: true,
      entry: { tag: 'player' },
      votePoints: 2,
      tieBonus: 1,
      bonusPoints: 2,
      skipPenalty: 2,
      judging: 'vote',
      gmChecks: false,
    });
  });
});

describe('its deadline (edge cases 12, 13)', () => {
  it('opens for its own window, or the one the GM sets, from 5 minutes up to 12 hours', async () => {
    await setup();
    const own = await fire('s-photo');
    expect(toMillis((await quest(own)).endsAt)).toBe(addMin(T0, 300).getTime());
    await db().doc(`globalQuests/${own}`).update({ status: 'closed' });
    const long = await fire('s-photo', addMin(T0, 1), { windowMin: 720 });
    expect(toMillis((await quest(long)).endsAt)).toBe(addMin(T0, 721).getTime());
  });

  it('refuses a long-running window over 720 minutes; every other mission stays capped at 180', async () => {
    await setup();
    await expectCode(fire('s-photo', T0, { windowMin: 721 }), 'invalid-argument');
    await expectCode(fire('s-old-days', T0, { windowMin: 181 }), 'invalid-argument');
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
  });

  it('everyone in before the deadline does not move it on', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await enter('bob', id, addMin(T0, 2), { taggedUid: 'carol' });
    await enter('carol', id, addMin(T0, 3), { taggedUid: 'alice' });
    expect((await quest(id)).status).toBe('live');
    expect(await feedOf(db(), 'voting-open')).toEqual([]);
  });

  it('at the deadline entries close and it waits: the timer never opens its vote, and late entries are refused', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await tick(addMin(T0, 301));
    expect(await quest(id)).toMatchObject({ status: 'checking', votingEndsAt: null });
    await expectCode(enter('bob', id, addMin(T0, 302), { taggedUid: 'alice' }), 'failed-precondition');
    await tick(addMin(T0, 500));
    expect((await quest(id)).status).toBe('checking');
    expect(await feedOf(db(), 'voting-open')).toEqual([]);
  });

  it("the GM's advance opens its vote", async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await tick(addMin(T0, 301));
    expect(await advance(id, addMin(T0, 302))).toEqual({ status: 'voting' });
    expect(toMillis((await quest(id)).votingEndsAt)).toBe(addMin(T0, 322).getTime());
  });

  it('the GM can close its entries early: it waits for its vote, like at the deadline', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    expect(await advance(id, addMin(T0, 2))).toEqual({ status: 'checking' });
    expect(await quest(id)).toMatchObject({ status: 'checking', votingEndsAt: null });
    await expectCode(enter('bob', id, addMin(T0, 3), { taggedUid: 'alice' }), 'failed-precondition');
    expect(await feedOf(db(), 'voting-open')).toEqual([]);
  });

  it('with no entries at the deadline it closes and fines everyone still playing', async () => {
    await setup();
    const id = await fire('s-photo');
    await tick(addMin(T0, 301));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([['skipped', -2]]);
  });
});

describe('an entry that names a player (edge case 14)', () => {
  it('keeps the tag on the entry, sealed with it until the vote; then the post shows it', async () => {
    await setup();
    const id = await fire('s-photo');
    const a = await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    const entry = await submission(a);
    expect(entry).toMatchObject({ taggedUid: 'bob', status: 'sealed' });
    expect((await getData(db(), `feed/${entry.feedId}`))?.taggedUid ?? null).toBeNull();
    await advance(id, addMin(T0, 2)); // entries close: still sealed
    expect((await submission(a)).status).toBe('sealed');
    await advance(id, addMin(T0, 3)); // the vote opens
    expect((await submission(a)).status).toBe('approved');
    expect((await getData(db(), `feed/${entry.feedId}`))?.taggedUid).toBe('bob');
  });

  it.each([
    ['no tag', {}],
    ['yourself', { taggedUid: 'alice' }],
    ['a player who does not exist', { taggedUid: 'ghost' }],
    ['a GM who does not play', { taggedUid: 'gm' }],
    ['a tag that is not text', { taggedUid: 7 }],
  ])('refuses %s', async (_label, tag) => {
    await setup();
    const id = await fire('s-photo');
    await expectCode(enter('alice', id, addMin(T0, 1), tag), 'invalid-argument');
    expect((await allDocs(db(), 'submissions')).filter((s) => s.questId === id)).toEqual([]);
  });

  it('refuses a player who has left', async () => {
    await setup();
    await db().doc('players/bob').update({ left: 'out' });
    const id = await fire('s-photo');
    await expectCode(enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' }), 'invalid-argument');
  });

  it('refuses a tag on a mission that does not take one', async () => {
    await setup();
    const id = await fire('s-old-days');
    await expectCode(enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' }), 'invalid-argument');
  });
});

describe('a mission that deals each player another (edge case 15)', () => {
  const assignments = async () => (await allDocs(db(), 'assignments')).sort((a, b) => String(a.uid).localeCompare(String(b.uid)));

  it('deals everyone playing exactly one other player, nobody themselves, and everyone is dealt to someone', async () => {
    await setup();
    const id = await fire('s-motive');
    const dealt = await assignments();
    expect(dealt.map((d) => d.uid)).toEqual(['alice', 'bob', 'carol']);
    for (const d of dealt) {
      expect(d.id).toBe(`${id}_${d.uid}`);
      expect(d.globalQuestId).toBe(id);
      expect(d.targetUid).not.toBe(d.uid);
    }
    expect(dealt.map((d) => d.targetUid).sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('is the same deal for the same random numbers', async () => {
    await setup();
    await fire('s-motive');
    const first = (await assignments()).map((d) => [d.uid, d.targetUid]);
    expect(first).toHaveLength(3);
    await db().doc(`globalQuests/${(await storyQuests('s-motive'))[0]!.id}`).update({ status: 'closed' });
    for (const d of await allDocs(db(), 'assignments')) await db().doc(`assignments/${d.id}`).delete();
    await fire('s-motive', addMin(T0, 1));
    expect((await assignments()).map((d) => [d.uid, d.targetUid])).toEqual(first);
  });

  it('leaves out players who have left and a GM who does not play; two players swap', async () => {
    await setup();
    await db().doc('players/carol').update({ left: 'out' });
    await fire('s-motive');
    expect((await assignments()).map((d) => [d.uid, d.targetUid])).toEqual([
      ['alice', 'bob'],
      ['bob', 'alice'],
    ]);
  });

  it('refuses to fire with fewer than two players', async () => {
    await setup();
    for (const uid of ['bob', 'carol']) await db().doc(`players/${uid}`).update({ left: 'out' });
    await expectCode(fire('s-motive'), 'failed-precondition');
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
    expect(await allDocs(db(), 'assignments')).toEqual([]);
  });

  it("an entry is about the player you were dealt: left out, it is filled in; a different one is refused", async () => {
    await setup();
    const id = await fire('s-motive');
    const target = (await getData(db(), `assignments/${id}_alice`))!.targetUid as string;
    const other = ['alice', 'bob', 'carol'].find((u) => u !== 'alice' && u !== target)!;
    await expectCode(enterRaw('alice', id, { caption: 'They owed money', taggedUid: other }, addMin(T0, 1)), 'invalid-argument');
    const a = await enterRaw('alice', id, { caption: 'They owed money' }, addMin(T0, 2));
    expect((await submission(a)).taggedUid).toBe(target);
  });

  it('a player who joined after it fired has nobody, cannot enter, and is not fined', async () => {
    await setup();
    const id = await fire('s-motive');
    await seedPlayer(db(), 'dave', { joinedAt: addMin(T0, 5) });
    expect(await getData(db(), `assignments/${id}_dave`)).toBeUndefined();
    await expectCode(enterRaw('dave', id, { caption: 'No idea' }, addMin(T0, 6)), 'failed-precondition');
    await tick(addMin(T0, 31));
    expect(await reasons('dave')).toEqual([]);
  });
});

describe('what an entry must be (edge case 16)', () => {
  const video = (uid: string) => ({ videoPath: `submissions/${uid}/${uid}-alibi.mp4` });

  it('a video mission takes a video in your own folder, with or without a poster frame', async () => {
    await setup();
    const id = await fire('s-alibi');
    const a = await enterRaw('alice', id, video('alice'), addMin(T0, 1));
    expect(await submission(a)).toMatchObject({ videoPath: 'submissions/alice/alice-alibi.mp4', imagePath: null });
    const b = await enterRaw('bob', id, { ...video('bob'), thumbPath: 'submissions/bob/bob-alibi_thumb.jpg', caption: 'At the Crown' }, addMin(T0, 2));
    expect(await submission(b)).toMatchObject({ videoPath: 'submissions/bob/bob-alibi.mp4', thumbPath: 'submissions/bob/bob-alibi_thumb.jpg', caption: 'At the Crown' });
  });

  it('a video mission refuses an entry with no video, or a video in another folder', async () => {
    await setup();
    const id = await fire('s-alibi');
    await expectCode(enter('alice', id, addMin(T0, 1)), 'invalid-argument');
    await expectCode(enterRaw('alice', id, { videoPath: 'submissions/bob/bob-alibi.mp4' }, addMin(T0, 2)), 'invalid-argument');
    await expectCode(enterRaw('alice', id, { videoPath: 'avatars/alice/a.mp4' }, addMin(T0, 3)), 'invalid-argument');
  });

  it('photo and text missions refuse a video', async () => {
    await setup();
    const oldDays = await fire('s-old-days');
    await expectCode(enter('alice', oldDays, addMin(T0, 1), video('alice')), 'invalid-argument');
    await db().doc(`globalQuests/${oldDays}`).update({ status: 'closed' });
    const motive = await fire('s-motive', addMin(T0, 2));
    await expectCode(enterRaw('alice', motive, { caption: 'Money', ...video('alice') }, addMin(T0, 3)), 'invalid-argument');
  });

  it('a text mission needs a caption of 1 to 280 characters; a photo alone will not do', async () => {
    await setup();
    const id = await fire('s-motive');
    await expectCode(enterRaw('alice', id, photo('alice'), addMin(T0, 1)), 'invalid-argument');
    await expectCode(enterRaw('alice', id, { caption: 'x'.repeat(281) }, addMin(T0, 2)), 'invalid-argument');
    const a = await enterRaw('alice', id, { caption: 'They knew too much' }, addMin(T0, 3));
    expect((await submission(a)).caption).toBe('They knew too much');
  });

  it('a mission whose caption is required refuses a photo on its own', async () => {
    await setup();
    const id = await fire('s-weapon');
    await expectCode(enterRaw('alice', id, photo('alice'), addMin(T0, 1)), 'invalid-argument');
    await enter('alice', id, addMin(T0, 2));
  });
});

describe('points per vote, and the tie rule (edge case 18)', () => {
  it('has a ledger reason for votes received', () => {
    expect(LEDGER_REASON_LIST).toContain('global-votes');
  });

  /** alice and bob enter, carol does not; votes: alice 2, bob 1. Returns their entries. */
  async function twoToOne(storyId: string) {
    await setup();
    const id = await fire(storyId);
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('bob', id, a, addMin(T0, 42));
    await vote('carol', id, a, addMin(T0, 43));
    await vote('alice', id, b, addMin(T0, 44));
    return { id, a, b };
  }

  it('each entry gets the points per vote; the sole top entry also gets the points; non-entrants are fined', async () => {
    const { id, a, b } = await twoToOne('s-old-days');
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: ['alice'] });
    expect(await reasons('alice')).toEqual([['global-votes', 4], ['global-win', 2]]);
    expect(await reasons('bob')).toEqual([['global-votes', 2]]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
    expect((await submission(a)).pointsAwarded).toBe(6);
    expect((await submission(b)).pointsAwarded).toBe(2);
  });

  /** alice and bob enter, one vote each. */
  async function tied(storyId: string) {
    await setup();
    const id = await fire(storyId);
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('carol', id, a, addMin(T0, 42));
    await vote('alice', id, b, addMin(T0, 43));
    await tick(addMin(T0, 62));
    return { id, a, b };
  }

  it('tied top entries each get the tie bonus when the mission has one', async () => {
    const { id } = await tied('s-weapon');
    expect((await quest(id)).winnerUids.sort()).toEqual(['alice', 'bob']);
    expect(await reasons('alice')).toEqual([['global-votes', 2], ['global-win', 1]]);
    expect(await reasons('bob')).toEqual([['global-votes', 2], ['global-win', 1]]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
  });

  it('without a tie bonus, tied top entries each get the full points', async () => {
    await tied('s-old-days');
    expect(await reasons('alice')).toEqual([['global-votes', 2], ['global-win', 2]]);
    expect(await reasons('bob')).toEqual([['global-votes', 2], ['global-win', 2]]);
  });

  it('with no votes at all, nobody wins and nobody gets vote points; non-entrants are still fined', async () => {
    await setup();
    const id = await fire('s-old-days');
    await enter('alice', id, addMin(T0, 1));
    await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await tick(addMin(T0, 62));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    expect(await reasons('alice')).toEqual([]);
    expect(await reasons('bob')).toEqual([]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
  });

  it('a mission without points per vote or a tie bonus scores as before: tied winners get it all, no vote lines', async () => {
    const { id } = await tied('s-plain');
    expect((await quest(id)).winnerUids.sort()).toEqual(['alice', 'bob']);
    expect(await reasons('alice')).toEqual([['global-win', 5]]);
    expect(await reasons('bob')).toEqual([['global-win', 5]]);
    expect(await reasons('carol')).toEqual([['skipped', -1]]);
  });

  it("a fraud override on a scored entry takes back its vote points as well as its win", async () => {
    const { a } = await twoToOne('s-old-days');
    expect(await points('alice')).toBe(6);
    await reviewSubmission(db(), as('gm', addMin(T0, 50)), { submissionId: a, approve: false });
    expect(await points('alice')).toBe(-2);
    expect(await reasons('alice')).toContainEqual(['reversal', -6]);
  });
});

describe('facts recorded from winners (edge case 19)', () => {
  it('a sole winner is recorded with its entry', async () => {
    await setup();
    const id = await fire('s-weapon');
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('bob', id, a, addMin(T0, 42));
    await vote('carol', id, a, addMin(T0, 43));
    await vote('alice', id, b, addMin(T0, 44));
    const f = await fact('weapon');
    expect(f).toMatchObject({ key: 'weapon', label: 'The weapon', value: null, storyId: 's-weapon' });
    expect(f!.entries).toEqual([
      {
        submissionId: a, uid: 'alice', displayName: 'Alice', caption: "alice's entry",
        imagePath: photo('alice').imagePath, thumbPath: photo('alice').thumbPath, videoPath: null, votes: 2,
      },
    ]);
  });

  it("keeps the captions of the entries that didn't win, once each, for the police's decoys", async () => {
    await setup();
    await seedPlayer(db(), 'dave');
    const id = await fire('s-weapon');
    const a = await enter('alice', id, addMin(T0, 1), { caption: 'The dart' });
    await enter('bob', id, addMin(T0, 2), { caption: 'A pint glass' });
    await enter('carol', id, addMin(T0, 3), { caption: 'A pint glass' });
    await tick(addMin(T0, 41));
    const entries = (await allDocs(db(), 'submissions')).filter((x) => x.questId === id);
    const bob = entries.find((x) => x.uid === 'bob')!.id;
    for (const voter of ['bob', 'carol', 'dave']) await vote(voter, id, a, addMin(T0, 42));
    await vote('alice', id, bob, addMin(T0, 43));
    expect((await quest(id)).status).toBe('closed');
    const f = (await fact('weapon'))!;
    expect(f.entries.map((e: { caption: string }) => e.caption)).toEqual(['The dart']);
    expect(f.others).toEqual(['A pint glass']);
  });

  it('keeps at most six of them', async () => {
    await setup();
    const extra = ['dave', 'erin', 'fay', 'gus', 'hal', 'ida', 'jo'];
    for (const uid of extra) await seedPlayer(db(), uid);
    const id = await fire('s-weapon');
    const a = await enter('alice', id, addMin(T0, 1), { caption: 'The winner' });
    for (const [i, uid] of extra.entries()) await enter(uid, id, addMin(T0, 2 + i * 0.1), { caption: `Thing ${i}` });
    await tick(addMin(T0, 41));
    for (const voter of ['bob', 'carol']) await vote(voter, id, a, addMin(T0, 42));
    await tick(addMin(T0, 62));
    const f = (await fact('weapon'))!;
    expect(f.others).toHaveLength(6);
    expect(f.others).not.toContain('The winner');
  });

  it('tied winners are all recorded', async () => {
    await setup();
    const id = await fire('s-weapon');
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('carol', id, a, addMin(T0, 42));
    await vote('alice', id, b, addMin(T0, 43));
    await tick(addMin(T0, 62));
    expect((await fact('weapon'))!.entries.map((e: { uid: string }) => e.uid).sort()).toEqual(['alice', 'bob']);
  });

  it('with no winner, or no entries, the fact is recorded with nothing on it', async () => {
    await setup();
    await fire('s-weapon');
    await tick(addMin(T0, 41));
    expect(await fact('weapon')).toMatchObject({ key: 'weapon', entries: [] });
  });

  it('firing it again and closing it again replaces the fact', async () => {
    await setup();
    const first = await fire('s-weapon');
    const a = await enter('alice', first, addMin(T0, 1));
    await tick(addMin(T0, 41));
    await vote('bob', first, a, addMin(T0, 42));
    await tick(addMin(T0, 62));
    expect((await fact('weapon'))!.entries.map((e: { uid: string }) => e.uid)).toEqual(['alice']);
    const second = await fire('s-weapon', addMin(T0, 70));
    const b = await enter('bob', second, addMin(T0, 71));
    await tick(addMin(T0, 111));
    await vote('alice', second, b, addMin(T0, 112));
    await tick(addMin(T0, 132));
    expect((await fact('weapon'))!.entries.map((e: { uid: string }) => e.uid)).toEqual(['bob']);
  });

  it('a fraud override on a recorded entry takes it off the fact', async () => {
    await setup();
    const id = await fire('s-weapon');
    const a = await enter('alice', id, addMin(T0, 1));
    const b = await enter('bob', id, addMin(T0, 2));
    await tick(addMin(T0, 41));
    await vote('carol', id, a, addMin(T0, 42));
    await vote('alice', id, b, addMin(T0, 43));
    await tick(addMin(T0, 62));
    await reviewSubmission(db(), as('gm', addMin(T0, 63)), { submissionId: a, approve: false });
    expect((await fact('weapon'))!.entries.map((e: { uid: string }) => e.uid)).toEqual(['bob']);
  });
});

describe('announcements (edge case 20)', () => {
  it('firing one marks it done at once, posts it as a story beat and records its fact', async () => {
    await setup();
    const id = await fire('s-time');
    expect(await quest(id)).toMatchObject({ kind: 'announce', status: 'closed', storyId: 's-time', title: 'Time of death' });
    const beats = await feedOf(db(), 'story-beat');
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ ref: id, text: 'New evidence: it happened at 11:02 pm.', questTitle: 'Time of death' });
    expect(await feedOf(db(), 'global-open')).toEqual([]);
    expect(await fact('timeOfDeath')).toMatchObject({ key: 'timeOfDeath', label: 'Time of death', value: '23:02', entries: [], storyId: 's-time' });
    expect(storyStates(ARC, [{ storyId: 's-time', status: 'closed' }])['s-time']).toBe('done');
  });

  it('takes no entries', async () => {
    await setup();
    const id = await fire('s-time');
    await expectCode(enter('alice', id, addMin(T0, 1)), 'failed-precondition');
  });

  it('does not move the live mission on, and fines nobody', async () => {
    await setup();
    const oldDays = await fire('s-old-days');
    await fire('s-time', addMin(T0, 1));
    expect((await quest(oldDays)).status).toBe('live');
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([]);
  });

  it('fired again, it posts again and keeps the fact', async () => {
    await setup();
    await fire('s-time');
    await fire('s-time', addMin(T0, 5));
    expect(await feedOf(db(), 'story-beat')).toHaveLength(2);
    expect((await fact('timeOfDeath'))?.value).toBe('23:02');
  });
});

describe('an announcement that opens a vote (edge case 21)', () => {
  it('on a live mission with entries: entries close and its vote opens', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await fire('s-reveal', addMin(T0, 60));
    const q = await quest(id);
    expect(q.status).toBe('voting');
    expect(toMillis(q.votingEndsAt)).toBe(addMin(T0, 80).getTime());
    expect((await feedOf(db(), 'voting-open')).map((p) => p.ref)).toEqual([id]);
    expect(await feedOf(db(), 'story-beat')).toHaveLength(1);
  });

  it('on a live mission with no entries: it closes and fines everyone still playing', async () => {
    await setup();
    const id = await fire('s-photo');
    await fire('s-reveal', addMin(T0, 60));
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([['skipped', -2]]);
  });

  it('on a mission waiting after its deadline: its vote opens', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await tick(addMin(T0, 301));
    await fire('s-reveal', addMin(T0, 310));
    expect((await quest(id)).status).toBe('voting');
  });

  it('on a mission already voting or closed, or never fired: only the announcement happens', async () => {
    await setup();
    await fire('s-reveal');
    expect(await storyQuests('s-photo')).toEqual([]);

    const id = await fire('s-photo', addMin(T0, 1));
    await enter('alice', id, addMin(T0, 2), { taggedUid: 'bob' });
    await advance(id, addMin(T0, 3)); // entries close
    await advance(id, addMin(T0, 4)); // the vote opens
    const before = await quest(id);
    expect(before.status).toBe('voting');
    await fire('s-reveal', addMin(T0, 5));
    expect(await quest(id)).toMatchObject({ status: 'voting', votingEndsAt: before.votingEndsAt });

    await advance(id, addMin(T0, 6));
    const closed = await quest(id);
    expect(closed.status).toBe('closed');
    await fire('s-reveal', addMin(T0, 7));
    expect(await quest(id)).toEqual(closed);
    expect(await feedOf(db(), 'story-beat')).toHaveLength(3);
  });
});

describe('the dealt mission closes as a submission (edge case 22)', () => {
  it('pays each writer, fines the rest, and reveals each entry in the feed with the player it is about', async () => {
    await setup();
    const id = await fire('s-motive');
    const a = await enterRaw('alice', id, { caption: 'They owed money' }, addMin(T0, 1));
    const b = await enterRaw('bob', id, { caption: 'Jealousy' }, addMin(T0, 2));
    await tick(addMin(T0, 31));
    expect((await quest(id)).status).toBe('closed');
    expect(await reasons('alice')).toEqual([['global-entry', 2]]);
    expect(await reasons('bob')).toEqual([['global-entry', 2]]);
    expect(await reasons('carol')).toEqual([['skipped', -2]]);
    for (const [entryId, uid] of [[a, 'alice'], [b, 'bob']] as const) {
      const entry = await submission(entryId);
      const target = (await getData(db(), `assignments/${id}_${uid}`))!.targetUid;
      expect(entry).toMatchObject({ status: 'approved', taggedUid: target });
      expect(await getData(db(), `feed/${entry.feedId}`)).toMatchObject({ caption: entry.caption, taggedUid: target });
    }
  });
});

describe('the end of the game and a reset (edge case 23)', () => {
  it('ending the game closes a long-running mission, live or waiting, with no winner and no fines, and keeps the facts', async () => {
    await setup();
    await fire('s-time');
    const id = await fire('s-photo', addMin(T0, 1));
    await enter('alice', id, addMin(T0, 2), { taggedUid: 'bob' });
    await endGame(db(), as('gm', addMin(T0, 10)), { venues: [] });
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([]);
    expect((await fact('timeOfDeath'))?.value).toBe('23:02');
  });

  it('a waiting one closes the same way', async () => {
    await setup();
    const id = await fire('s-photo');
    await enter('alice', id, addMin(T0, 1), { taggedUid: 'bob' });
    await tick(addMin(T0, 301));
    await endGame(db(), as('gm', addMin(T0, 310)), { venues: [] });
    expect(await quest(id)).toMatchObject({ status: 'closed', winnerUids: [] });
    for (const uid of ['alice', 'bob', 'carol']) expect(await reasons(uid), uid).toEqual([]);
  });

  it('a reset wipes the facts and the assignments', async () => {
    await setup();
    await fire('s-time');
    await fire('s-motive', addMin(T0, 1));
    expect(await allDocs(db(), 'facts')).not.toEqual([]);
    expect(await allDocs(db(), 'assignments')).not.toEqual([]);
    await resetGame(db(), as('gm', addMin(T0, 2)), { confirm: 'RESET' });
    expect(await allDocs(db(), 'facts')).toEqual([]);
    expect(await allDocs(db(), 'assignments')).toEqual([]);
  });
});
