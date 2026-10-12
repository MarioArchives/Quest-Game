// Engine plan edge cases 6 (server text in the pack's words), 8 (quiet hours in the pack's time zone),
// 9-11 (features switched off) and 12 (awards follow the features and the pack's titles).
import { beforeEach, describe, expect, it } from 'vitest';
import { computeAwards, endGame, type PlayerStats } from '../src/game/endGame.js';
import { fireGlobalQuest, isQuietHours, runTick } from '../src/game/globals.js';
import { guessQuest } from '../src/game/guesses.js';
import { adjustPoints } from '../src/game/points.js';
import { pushFor } from '../src/game/push.js';
import { handleSubmissionCreated, reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, checkEntry, enterSideQuest } from '../src/game/votes.js';
import type { GamePack } from '../src/shared/packs/types.js';
import type { FeedItem, FeedType, Settings, Venue } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  feedOf,
  getData,
  hand,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedGlobalTemplate,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  ts,
  useEmulatorDb,
} from './helpers.js';
import { darePack, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-features');

const noGuesses = () => testPack({ features: { guesses: false } });
const noSideQuests = () => testPack({ features: { sideQuests: false } });
const noMap = () => testPack({ features: { map: false } });
const on = (uid: string | null, now: Date, pack: GamePack) => ctx(uid, now, seededRng(4), undefined, pack);

async function players(settings: Partial<Settings> = {}) {
  await seedGame(db(), { status: 'active', settings });
  await seedPersonalTemplates(db(), 20);
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { displayName: 'Alice', points: 100, quests: hand(['p01', 'p02', 'p03', 'p04', 'p05']) });
  await seedPlayer(db(), 'bob', {
    displayName: 'Bob',
    points: 100,
    quests: hand(['p06', 'p07', 'p08', 'p09', 'p10']).map((q) => ({ ...q, id: `b${q.id}` })),
  });
  await seedPlayer(db(), 'carol', { displayName: 'Carol' });
}

describe('E9. guesses off', () => {
  it('guessQuest is refused and writes nothing', async () => {
    await players();
    await expectCode(
      guessQuest(db(), on('alice', T0, noGuesses()), { targetUid: 'bob', templateId: 'p06' }),
      'failed-precondition',
    );
    expect(await allDocs(db(), 'guesses')).toEqual([]);
    expect(await allDocs(db(), 'pointsLedger')).toEqual([]);
    expect(await allDocs(db(), 'feed')).toEqual([]);
  });

  it('control: the same guess works with guesses on', async () => {
    await players();
    expect(await guessQuest(db(), on('alice', T0, testPack()), { targetUid: 'bob', templateId: 'p06' })).toEqual({ correct: true });
  });
});

describe('E10. side quests off', () => {
  async function dueSideQuest() {
    await players();
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, -1)) });
    await seedGlobalTemplate(db(), 'g01');
  }

  it('the tick never opens one, even when one is due', async () => {
    await dueSideQuest();
    expect((await runTick(db(), T0, seededRng(), noSideQuests())).opened).toBeNull();
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
  });

  it('control: the tick opens the due one with side quests on', async () => {
    await dueSideQuest();
    expect((await runTick(db(), T0, seededRng(), testPack())).opened).not.toBeNull();
  });

  it('firing one is refused', async () => {
    await dueSideQuest();
    await expectCode(fireGlobalQuest(db(), on('gm', T0, noSideQuests()), { mode: 'random' }), 'failed-precondition');
    expect(await allDocs(db(), 'globalQuests')).toEqual([]);
  });

  it('entering, moving on, checking and voting are refused at every stage (and work with side quests on)', async () => {
    await players();
    await seedGlobalQuest(db(), 'gq1', { status: 'live' });
    const off = noSideQuests();
    const lancaster = testPack();

    await expectCode(enterSideQuest(db(), on('alice', T0, off), { globalQuestId: 'gq1', caption: 'Alice' }), 'failed-precondition');
    expect(await allDocs(db(), 'submissions')).toEqual([]);
    const a = await enterSideQuest(db(), on('alice', T0, lancaster), { globalQuestId: 'gq1', caption: 'Alice' });
    await enterSideQuest(db(), on('bob', T0, lancaster), { globalQuestId: 'gq1', caption: 'Bob' });

    await expectCode(advanceGlobalQuest(db(), on('gm', addMin(T0, 5), off), { globalQuestId: 'gq1' }), 'failed-precondition');
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('live');
    await advanceGlobalQuest(db(), on('gm', addMin(T0, 5), lancaster), { globalQuestId: 'gq1' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('checking');

    await expectCode(checkEntry(db(), on('gm', addMin(T0, 6), off), { submissionId: a.submissionId, accept: true }), 'failed-precondition');
    await checkEntry(db(), on('gm', addMin(T0, 6), lancaster), { submissionId: a.submissionId, accept: true });
    await advanceGlobalQuest(db(), on('gm', addMin(T0, 7), lancaster), { globalQuestId: 'gq1' });
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('voting');

    await expectCode(
      castVote(db(), on('carol', addMin(T0, 8), off), { globalQuestId: 'gq1', submissionId: a.submissionId }),
      'failed-precondition',
    );
    expect(await allDocs(db(), 'globalQuests/gq1/votes')).toEqual([]);
    await castVote(db(), on('carol', addMin(T0, 8), lancaster), { globalQuestId: 'gq1', submissionId: a.submissionId });
  });
});

describe('E11. map off', () => {
  const VENUES: Venue[] = [{ id: 'v1', name: 'The Castle', lat: 54.049526, lng: -2.804843, address: null }];

  async function photoAtVenue() {
    await seedGame(db(), { status: 'active' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 6);
    await seedPlayer(db(), 'alice', { displayName: 'Alice', points: 100, quests: [{ id: 'q1', templateId: 'p01', status: 'done' }] });
    await seedSubmission(db(), 's1', {
      uid: 'alice',
      questId: 'q1',
      status: 'approved',
      createdAt: addMin(T0, -30),
      evidence: true,
      location: { lat: 54.049526, lng: -2.804843 },
      extra: { questTitle: 'Personal quest p01', pointsAwarded: 100 },
    });
  }

  it('endGame finishes without venues and gives no venue award', async () => {
    await photoAtVenue();
    expect(await endGame(db(), on('gm', T0, noMap()), { venues: VENUES })).toEqual({ players: 1 });
    const w = (await getData(db(), 'wraps/alice'))!;
    expect(w.venues).toEqual([]);
    expect(w.award.key).not.toBe('globetrotter');
  });

  it('control: with the map on the same photo counts its venue', async () => {
    await photoAtVenue();
    await endGame(db(), on('gm', T0, testPack()), { venues: VENUES });
    expect((await getData(db(), 'wraps/alice'))!.venues).toEqual([{ id: 'v1', name: 'The Castle' }]);
  });
});

describe('E12. awards follow the features', () => {
  function stats(uid: string, over: Partial<PlayerStats> = {}): PlayerStats {
    return {
      uid,
      points: 0,
      hits: 0,
      guessesMade: 0,
      exposedCount: 1,
      approvedPhotos: 0,
      lastSubmissionAt: null,
      sideQuestsWon: 0,
      venuesCount: 0,
      rerollsUsed: 0,
      ...over,
    };
  }
  const keys = (awards: Record<string, { key: string }>) => Object.fromEntries(Object.entries(awards).map(([uid, a]) => [uid, a.key]));
  const ALL_ON = { guesses: true, sideQuests: true, map: true };

  it('with guesses off nobody is Sharpshooter, Untouchable or Detective', () => {
    const awards = computeAwards(
      [stats('a', { hits: 3, guessesMade: 5, exposedCount: 0 }), stats('b', { exposedCount: 0 }), stats('c', { exposedCount: 0, guessesMade: 2 })],
      { features: { ...ALL_ON, guesses: false } },
    );
    expect(keys(awards)).toEqual({ a: 'good-sport', b: 'good-sport', c: 'good-sport' });
  });

  it('with side quests off nobody is Side Hustler', () => {
    const awards = computeAwards([stats('e', { sideQuestsWon: 2 })], { features: { ...ALL_ON, sideQuests: false } });
    expect(keys(awards)).toEqual({ e: 'good-sport' });
  });

  it('with the map off nobody is Globetrotter', () => {
    const awards = computeAwards([stats('f', { venuesCount: 4 })], { features: { ...ALL_ON, map: false } });
    expect(keys(awards)).toEqual({ f: 'good-sport' });
  });

  it('the others are still given, in the same order', () => {
    const awards = computeAwards(
      [stats('a', { hits: 2 }), stats('c', { approvedPhotos: 3, lastSubmissionAt: 100 }), stats('d', { approvedPhotos: 1, lastSubmissionAt: 900 }), stats('h', { rerollsUsed: 2 })],
      { features: { guesses: false, sideQuests: false, map: false } },
    );
    expect(keys(awards)).toEqual({ a: 'good-sport', c: 'paparazzo', d: 'night-owl', h: 'gambler' });
  });

  it("the pack's titles replace the engine's", () => {
    const awards = computeAwards([stats('c', { approvedPhotos: 3 }), stats('z')], {
      features: ALL_ON,
      copy: { paparazzo: { title: 'Shutterbug', description: 'Most photos' }, 'good-sport': { title: 'Legend', description: 'Came along' } },
    });
    expect(awards.c).toEqual({ key: 'paparazzo', title: 'Shutterbug', description: 'Most photos' });
    expect(awards.z).toEqual({ key: 'good-sport', title: 'Legend', description: 'Came along' });
  });

  it('with no options, nothing changes (all features, engine titles)', () => {
    expect(keys(computeAwards([stats('a', { hits: 1 }), stats('b', { exposedCount: 0 })]))).toEqual({ a: 'sharpshooter', b: 'untouchable' });
  });
});

describe("E6. the server speaks the pack's words", () => {
  let dare: GamePack;
  beforeEach(() => {
    dare = darePack();
  });

  async function claim(id: string, uid: string, questId: string) {
    await seedSubmission(db(), id, { uid, questId, createdAt: T0 });
    return handleSubmissionCreated(db(), id, T0, seededRng(5), dare);
  }
  const review = (id: string, approve: boolean, by: string) =>
    reviewSubmission(db(), on(by, addMin(T0, 5), dare), { submissionId: id, approve });

  it('an approval post names a secret dare, not a quest', async () => {
    await players({ revealOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'bob');
    const [post] = await feedOf(db(), 'approved');
    expect(post!.text).toContain('Alice');
    expect(post!.text).toContain('secret dare');
    expect(post!.text).not.toMatch(/quest/i);
  });

  it('when a GM who is not playing approves, the post names the host', async () => {
    await players({ revealOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', true, 'gm');
    const [post] = await feedOf(db(), 'approved');
    expect(post!.text).toMatch(/\bhost\b/i);
    expect(post!.text).not.toMatch(/\bGM\b/);
  });

  it('a rejection post names the bid, not the claim', async () => {
    await players({ revealOnComplete: false });
    await claim('s1', 'alice', 'q1');
    await review('s1', false, 'bob');
    const [post] = await feedOf(db(), 'rejected');
    expect(post!.text).toContain('bid');
    expect(post!.text).not.toMatch(/claim/i);
  });

  it('the witness push asks for a judge', async () => {
    await players();
    const plan = await claim('s1', 'alice', 'q1');
    expect(plan?.message.title).toBe('Judge needed');
    expect(plan?.message.body).toMatch(/\bjudge\b/);
    expect(`${plan?.message.title} ${plan?.message.body}`).not.toMatch(/witness/i);
  });

  it('an exposure post names the secret dare', async () => {
    await players();
    await guessQuest(db(), on('alice', T0, dare), { targetUid: 'bob', templateId: 'p06' });
    const [post] = await feedOf(db(), 'exposed');
    expect(post!.text).toContain('secret dare');
  });

  it('a points adjustment is by the host', async () => {
    await players();
    await adjustPoints(db(), on('gm', T0, dare), { uid: 'alice', delta: 10, reason: 'Great hat' });
    const [post] = await feedOf(db(), 'adjust');
    expect(post!.text).toMatch(/^The host adjusted/);
  });

  it('a new side quest is a new showdown', async () => {
    await players();
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(T0, -1)) });
    await db().doc('questTemplates/g01').set({ title: 'Best hat', description: 'Show us', scope: 'global', windowMin: null, active: true });
    await runTick(db(), T0, seededRng(), dare);
    const [post] = await feedOf(db(), 'global-open');
    expect(post!.text).toBe('New showdown: Best hat');
  });

  const post = (type: FeedType, extra: Partial<FeedItem> = {}): FeedItem =>
    ({ type, text: `text of ${type}`, uid: 'alice', ref: null, createdAt: ts(T0), questTitle: 'Best hat', ...extra }) as FeedItem;
  const said = (type: FeedType) => {
    const plan = pushFor(post(type), null, dare);
    return `${plan?.message.title ?? ''} | ${plan?.message.body ?? ''}`;
  };

  it('push titles use the terms and the game name', () => {
    expect(pushFor(post('global-open'), null, dare)?.message).toMatchObject({ title: 'New showdown', body: 'New showdown: Best hat' });
    expect(pushFor(post('approved'), 'personal', dare)?.message.title).toBe('Bid approved');
    expect(pushFor(post('rejected'), 'personal', dare)?.message.title).toBe('Bid rejected');
    expect(pushFor(post('exposed'), null, dare)?.message.title).toBe('Your dare was exposed');
    expect(pushFor(post('global-won'), null, dare)?.message.title).toBe('Showdown won');
    expect(pushFor(post('status', { uid: null }), null, dare)?.message.title).toBe('Dare Night');
  });

  it.each(['global-open', 'checking', 'voting-open', 'global-won', 'exposed', 'fraud', 'adjust'] as const)(
    'no push for %s says quest',
    (type) => {
      expect(said(type)).not.toMatch(/quest/i);
    },
  );
});

describe("E8. quiet hours follow the pack's time zone", () => {
  // 12:00 UTC on 10 Oct 2026: 13:00 in London (awake), 08:00 in New York (quiet with 01:00-10:00).
  const NOON_UTC = new Date('2026-10-10T12:00:00Z');
  const QUIET = { start: '01:00', end: '10:00' };

  it('the same moment is quiet in New York but not in London', () => {
    expect(isQuietHours(NOON_UTC, QUIET, 'Europe/London')).toBe(false);
    expect(isQuietHours(NOON_UTC, QUIET, 'America/New_York')).toBe(true);
  });

  async function due() {
    await players({ quietHours: QUIET });
    await db().doc('game/state').update({ nextGlobalQuestAt: ts(addMin(NOON_UTC, -1)) });
    await seedGlobalTemplate(db(), 'g01');
  }

  it('the tick holds a due side quest in New York quiet hours', async () => {
    await due();
    expect((await runTick(db(), NOON_UTC, seededRng(), testPack({ timeZone: 'America/New_York' }))).opened).toBeNull();
  });

  it('and opens it at the same moment in London', async () => {
    await due();
    expect((await runTick(db(), NOON_UTC, seededRng(), testPack())).opened).not.toBeNull();
  });
});
