// Edge cases 34 (endGame), 35 (wraps), 36 (awards) and Revision 3 V16 (open votes are tallied first;
// the top photo is the most-reacted post).
import { describe, expect, it } from 'vitest';
import { computeAwards, endGame, type PlayerStats } from '../src/game/endGame.js';
import { getPack } from '../src/shared/packs/index.js';
import type { CaseFile } from '../src/shared/packs/mystery/caseClosed.js';
import type { Venue } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  getData,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  toMillis,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-endgame');

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

const keys = (awards: Record<string, { key: string }>) =>
  Object.fromEntries(Object.entries(awards).map(([uid, a]) => [uid, a.key]));

describe('computeAwards', () => {
  it('assigns one award per player in priority order', () => {
    const awards = computeAwards([
      stats('alice', { points: 300, hits: 3, guessesMade: 4, exposedCount: 1, approvedPhotos: 3, lastSubmissionAt: 1000, sideQuestsWon: 1, venuesCount: 2, rerollsUsed: 1 }),
      stats('bob', { points: 200, hits: 1, guessesMade: 1, exposedCount: 0, approvedPhotos: 4, lastSubmissionAt: 2000, venuesCount: 3, rerollsUsed: 5 }),
      stats('carol', { points: 100, exposedCount: 2, approvedPhotos: 2, lastSubmissionAt: 3000, venuesCount: 1 }),
      stats('dave', { points: 0, exposedCount: 1 }),
    ]);
    expect(keys(awards)).toEqual({ alice: 'sharpshooter', bob: 'untouchable', carol: 'paparazzo', dave: 'good-sport' });
    for (const a of Object.values(awards)) {
      expect(a.title).toEqual(expect.any(String));
      expect(a.description).toEqual(expect.any(String));
    }
  });

  it('gives the next award to the best player who does not have one yet', () => {
    // Alice tops every metric, so each later award falls to the runner-up.
    const awards = computeAwards([
      stats('alice', { points: 500, hits: 5, exposedCount: 0, approvedPhotos: 9, lastSubmissionAt: 9000 }),
      stats('bob', { points: 100, hits: 1, exposedCount: 0, approvedPhotos: 1, lastSubmissionAt: 1000 }),
      stats('carol', { points: 50, exposedCount: 3, approvedPhotos: 2, lastSubmissionAt: 2000 }),
    ]);
    expect(keys(awards)).toEqual({ alice: 'sharpshooter', bob: 'untouchable', carol: 'paparazzo' });
  });

  it('awards night-owl to the latest submitter and then the extras in order', () => {
    const awards = computeAwards([
      stats('a', { hits: 1 }),
      stats('b', { exposedCount: 0 }),
      stats('c', { approvedPhotos: 5, lastSubmissionAt: 100 }),
      stats('d', { approvedPhotos: 1, lastSubmissionAt: 900 }),
      stats('e', { approvedPhotos: 1, lastSubmissionAt: 500, sideQuestsWon: 1 }),
      stats('f', { venuesCount: 2 }),
      stats('g', { guessesMade: 3 }),
      stats('h', { rerollsUsed: 4 }),
      stats('i'),
    ]);
    expect(keys(awards)).toEqual({
      a: 'sharpshooter',
      b: 'untouchable',
      c: 'paparazzo',
      d: 'night-owl',
      e: 'side-hustler',
      f: 'globetrotter',
      g: 'detective',
      h: 'gambler',
      i: 'good-sport',
    });
  });

  it('never gives a count-based award for a count of zero', () => {
    const awards = computeAwards([stats('alice', { points: 100 }), stats('bob', { points: 50 })]);
    expect(Object.values(awards).map((a) => a.key)).toEqual(['good-sport', 'good-sport']);
  });

  it('breaks ties by higher points, then by lower uid', () => {
    expect(keys(computeAwards([stats('x', { points: 50, hits: 2 }), stats('y', { points: 80, hits: 2 })])).y).toBe('sharpshooter');
    expect(keys(computeAwards([stats('m', { points: 50, hits: 2 }), stats('k', { points: 50, hits: 2 })])).k).toBe('sharpshooter');
    // Untouchable tie among players never exposed.
    expect(keys(computeAwards([stats('p', { exposedCount: 0, points: 10 }), stats('q', { exposedCount: 0, points: 20 })])).q).toBe('untouchable');
  });

  it('is deterministic regardless of input order', () => {
    const input = [
      stats('a', { points: 10, hits: 1 }),
      stats('b', { points: 10, hits: 1 }),
      stats('c', { points: 10, exposedCount: 0 }),
      stats('d', { points: 10, exposedCount: 0 }),
    ];
    expect(keys(computeAwards(input))).toEqual(keys(computeAwards([...input].reverse())));
  });

  it('handles an empty game', () => {
    expect(computeAwards([])).toEqual({});
  });
});

const VENUES: Venue[] = [
  { id: 'v1', name: 'Lancaster Castle', lat: 54.049526, lng: -2.804843, address: null },
  { id: 'v2', name: 'Lancaster Priory', lat: 54.050591, lng: -2.805768, address: null },
  { id: 'v3', name: 'Busk Stops', lat: null, lng: null, address: null },
];

async function scenario() {
  await seedGame(db(), { status: 'active', state: { startedAt: ts(addMin(T0, -120)) } });
  await seedAdmin(db(), 'gm');
  await seedPersonalTemplates(db(), 12);
  const joinedAt = addMin(T0, -120);
  await seedPlayer(db(), 'alice', {
    displayName: 'Alice',
    points: 175,
    rerollsUsed: 2,
    joinedAt,
    quests: [
      { id: 'q1', templateId: 'p01', status: 'done' },
      { id: 'q2', templateId: 'p02', status: 'active' },
      { id: 'q3', templateId: 'p03', status: 'exposed' },
      { id: 'q4', templateId: 'p04', status: 'replaced' },
      { id: 'q5', templateId: 'p05', status: 'submitted' },
      { id: 'q6', templateId: 'p06', status: 'active' },
    ],
  });
  await seedPlayer(db(), 'bob', { displayName: 'Bob', points: 175, joinedAt, quests: [{ id: 'b1', templateId: 'p07' }] });
  await seedPlayer(db(), 'carol', {
    displayName: 'Carol',
    points: 0,
    joinedAt,
    quests: [
      { id: 'c1', templateId: 'p08' },
      { id: 'c2', templateId: 'p11', status: 'exposed' },
    ],
  });

  // Ledger, deliberately written out of time order.
  const ledger = [
    { uid: 'alice', delta: 25, reason: 'guess-correct', at: -10 },
    { uid: 'alice', delta: 100, reason: 'quest', at: -100 },
    { uid: 'alice', delta: 100, reason: 'global-win', at: -30 },
    { uid: 'alice', delta: -50, reason: 'exposed', at: -50 },
    { uid: 'bob', delta: 25, reason: 'guess-correct', at: -50 },
    { uid: 'bob', delta: 150, reason: 'adjust', at: -20 },
  ];
  for (const [i, l] of ledger.entries()) {
    await db().doc(`pointsLedger/l${i}`).set({ uid: l.uid, delta: l.delta, reason: l.reason, ref: null, by: 'system', createdAt: ts(addMin(T0, l.at)) });
  }

  // gq1: already won by alice. gq2: still voting at the end, tied 1–1 between alice and bob.
  // gq3: still live with no entries. gq4: entries still being checked (bob's is in).
  await seedGlobalQuest(db(), 'gq1', { status: 'closed', winnerUids: ['alice'], endsAt: addMin(T0, -40) });
  await seedGlobalQuest(db(), 'gq2', { status: 'voting', endsAt: addMin(T0, -5), votingEndsAt: addMin(T0, 15) });
  await seedGlobalQuest(db(), 'gq3', { status: 'live', endsAt: addMin(T0, 10) });
  await seedGlobalQuest(db(), 'gq4', { status: 'checking', endsAt: addMin(T0, -3) });
  await seedSubmission(db(), 'ec', { uid: 'bob', kind: 'global', questId: 'gq4', witnessUid: null, status: 'sealed', evidence: true, createdAt: addMin(T0, -4) });
  await seedSubmission(db(), 'ea', { uid: 'alice', kind: 'global', questId: 'gq2', witnessUid: null, status: 'approved', evidence: true, createdAt: addMin(T0, -8) });
  await seedSubmission(db(), 'eb', { uid: 'bob', kind: 'global', questId: 'gq2', witnessUid: null, status: 'approved', evidence: true, createdAt: addMin(T0, -7) });
  await db().doc('globalQuests/gq2/votes/alice').set({ submissionId: 'eb', createdAt: ts(addMin(T0, -2)) });
  await db().doc('globalQuests/gq2/votes/bob').set({ submissionId: 'ea', createdAt: ts(addMin(T0, -1)) });

  await seedSubmission(db(), 's1', {
    uid: 'alice', questId: 'q1', status: 'approved', createdAt: addMin(T0, -100), evidence: true,
    location: { lat: 54.049526, lng: -2.804843 }, extra: { questTitle: 'Personal quest p01', pointsAwarded: 100 },
  });
  await seedSubmission(db(), 's2', {
    uid: 'alice', questId: 'gq1', kind: 'global', witnessUid: null, status: 'approved', createdAt: addMin(T0, -30), evidence: true,
    location: { lat: 54.050591, lng: -2.805768 }, extra: { pointsAwarded: 100 },
  });
  // Their feed posts, with reactions: the side-quest entry is the more loved one.
  await db().doc('feed/f-s1').set({ type: 'approved', text: 'Alice completed a quest', uid: 'alice', ref: 's1', submissionId: 's1', reactionCount: 2, createdAt: ts(addMin(T0, -100)) });
  await db().doc('feed/f-s2').set({ type: 'approved', text: 'Alice entered a side quest', uid: 'alice', ref: 's2', submissionId: 's2', reactionCount: 5, createdAt: ts(addMin(T0, -30)) });
  await seedSubmission(db(), 's3', { uid: 'alice', questId: 'q5', status: 'pending', createdAt: addMin(T0, -5), location: { lat: 54.049526, lng: -2.804843 } });
  await seedSubmission(db(), 's4', { uid: 'bob', questId: 'b1', status: 'rejected', createdAt: addMin(T0, -40), location: { lat: 51.5, lng: -0.12 } });

  const guesses = [
    { guesserUid: 'bob', targetUid: 'alice', templateId: 'p03', correct: true, at: -50 },
    { guesserUid: 'alice', targetUid: 'bob', templateId: 'p10', correct: false, at: -45 },
    { guesserUid: 'alice', targetUid: 'carol', templateId: 'p11', correct: true, at: -10 },
  ];
  for (const [i, g] of guesses.entries()) {
    const { at, ...rest } = g;
    await db().doc(`guesses/g${i}`).set({ ...rest, createdAt: ts(addMin(T0, at)) });
  }

  await db().doc('locations/alice').set({ lat: 54.05, lng: -2.8, accuracy: 10, updatedAt: ts(T0) });
  await db().doc('locations/bob').set({ lat: 54.05, lng: -2.8, accuracy: 10, updatedAt: ts(T0) });
}

describe('endGame', () => {
  it('ends the game, closes globals, deletes locations and freezes standings with shared ranks', async () => {
    await scenario();
    expect(await endGame(db(), ctx('gm'), { venues: VENUES })).toEqual({ players: 3 });

    const state = await getData(db(), 'game/state');
    expect(state?.status).toBe('ended');
    expect(toMillis(state!.endedAt)).toBe(T0.getTime());

    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('closed');
    expect(await getData(db(), 'globalQuests/gq3')).toMatchObject({ status: 'closed', winnerUids: [] });
    expect(await getData(db(), 'globalQuests/gq4')).toMatchObject({ status: 'closed', winnerUids: [] });
    expect(await allDocs(db(), 'locations')).toHaveLength(0);

    const final = await getData(db(), 'game/final');
    const standings = final!.standings as Array<Record<string, unknown>>;
    expect(standings).toHaveLength(3);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
    expect(standings.slice(0, 2).map((s) => s.uid).sort()).toEqual(['alice', 'bob']);
    expect(standings[2]).toMatchObject({ uid: 'carol', displayName: 'Carol', points: 0, rank: 3 });
    expect((await allDocs(db(), 'feed')).filter((f) => f.type === 'status')).toHaveLength(1);
  });

  it('tallies a side quest still in voting before freezing the standings (a tie pays both)', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    const gq2 = await getData(db(), 'globalQuests/gq2');
    expect(gq2?.status).toBe('closed');
    expect([...gq2!.winnerUids].sort()).toEqual(['alice', 'bob']);
    expect(gq2?.tally).toEqual({ ea: 1, eb: 1 });
    const standings = (await getData(db(), 'game/final'))!.standings as Array<Record<string, any>>;
    expect(standings.find((x) => x.uid === 'alice')?.points).toBe(275);
    expect(standings.find((x) => x.uid === 'bob')?.points).toBe(275);
  });

  it("writes each player's wrap from the stored game data", async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    const w = (await getData(db(), 'wraps/alice'))!;

    expect(w).toMatchObject({ uid: 'alice', displayName: 'Alice', rank: 1, points: 275, playerCount: 3, rerollsUsed: 2 });
    expect(w.pointsSeries).toEqual([
      { t: addMin(T0, -120).getTime(), points: 0 },
      { t: addMin(T0, -100).getTime(), points: 100 },
      { t: addMin(T0, -50).getTime(), points: 50 },
      { t: addMin(T0, -30).getTime(), points: 150 },
      { t: addMin(T0, -10).getTime(), points: 175 },
      { t: T0.getTime(), points: 275 },
    ]);
    expect(w.completed).toEqual([
      expect.objectContaining({ submissionId: 's1', title: 'Personal quest p01', thumbPath: 'submissions/alice/s1_thumb.jpg' }),
    ]);
    expect([...w.sideQuestsWon].sort((a: any, b: any) => a.globalQuestId.localeCompare(b.globalQuestId))).toEqual([
      { globalQuestId: 'gq1', title: 'Global gq1' },
      { globalQuestId: 'gq2', title: 'Global gq2' },
    ]);
    expect(w.hand.map((h: { templateId: string; status: string }) => `${h.templateId}:${h.status}`).sort()).toEqual([
      'p01:done', 'p02:active', 'p03:exposed', 'p05:submitted', 'p06:active',
    ]);
    expect(w.hand[0]).toEqual(expect.objectContaining({ title: expect.any(String), description: expect.any(String) }));
    expect(w.guessStats).toEqual({ made: 2, hits: 1, pointsTaken: 50 });
    expect(w.exposedBy).toEqual([{ uid: 'bob', displayName: 'Bob', title: 'Personal quest p03' }]);
    expect(w.topPhoto).toMatchObject({ submissionId: 's2', reactionCount: 5, thumbPath: 'submissions/alice/s2_thumb.jpg' });
    expect(w.venues).toEqual([
      { id: 'v1', name: 'Lancaster Castle' },
      { id: 'v2', name: 'Lancaster Priory' },
    ]);
    expect(w.award).toEqual(expect.objectContaining({ key: expect.any(String), title: expect.any(String) }));
  });

  it('gives a player with no activity a valid wrap with empty lists', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    const w = (await getData(db(), 'wraps/carol'))!;
    expect(w).toMatchObject({ rank: 3, points: 0, rerollsUsed: 0 });
    expect(w.pointsSeries).toEqual([{ t: addMin(T0, -120).getTime(), points: 0 }]);
    expect(w.completed).toEqual([]);
    expect(w.sideQuestsWon).toEqual([]);
    expect(w.guessStats).toEqual({ made: 0, hits: 0, pointsTaken: 0 });
    expect(w.exposedBy).toEqual([{ uid: 'alice', displayName: 'Alice', title: 'Personal quest p11' }]);
    expect(w.topPhoto).toBeNull();
    expect(w.venues).toEqual([]);
    expect(w.hand).toHaveLength(2);
    expect(w.award.key).toEqual(expect.any(String));
  });

  it("records each player's reroll allowance (base limit plus GM extras) in their wrap (plan edge 12)", async () => {
    await scenario();
    await db().doc('players/bob').update({ extraRerolls: 3 });
    await endGame(db(), ctx('gm'), { venues: VENUES });
    expect((await getData(db(), 'wraps/alice'))!.rerollAllowance).toBe(10);
    expect((await getData(db(), 'wraps/bob'))!.rerollAllowance).toBe(13);
  });

  it('gives every player exactly one award, unique apart from good-sport', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    const wraps = await allDocs(db(), 'wraps');
    expect(wraps).toHaveLength(3);
    const awardKeys = wraps.map((w) => w.award.key).filter((k) => k !== 'good-sport');
    expect(new Set(awardKeys).size).toBe(awardKeys.length);
  });

  it('ignores venues without coordinates and positions further than 75 m away', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: [VENUES[2]] });
    expect((await getData(db(), 'wraps/alice'))!.venues).toEqual([]);
  });

  it('works from a paused game', async () => {
    await scenario();
    await db().doc('game/state').update({ status: 'paused' });
    await endGame(db(), ctx('gm'), { venues: VENUES });
    expect((await getData(db(), 'game/state'))?.status).toBe('ended');
  });

  it('refuses to end twice', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    await expectCode(endGame(db(), ctx('gm'), { venues: VENUES }), 'failed-precondition');
  });

  it('refuses non-GMs', async () => {
    await scenario();
    await expectCode(endGame(db(), ctx('alice'), { venues: VENUES }), 'permission-denied');
    await expectCode(endGame(db(), ctx(null), { venues: VENUES }), 'unauthenticated');
    expect((await getData(db(), 'game/state'))?.status).toBe('active');
  });
});

describe("endGame and a pack's closing hook", () => {
  it('a pack without the hook writes game/final as before, with no closing', async () => {
    await scenario();
    await endGame(db(), ctx('gm'), { venues: VENUES });
    expect(await getData(db(), 'game/final')).not.toHaveProperty('closing');
  });

  it("stores what the mystery hook works out from the whole night, private collections included, as game/final.closing", async () => {
    const mystery = getPack('mystery');
    await seedGame(db(), { status: 'active', state: { startedAt: ts(addMin(T0, -300)) } });
    await seedAdmin(db(), 'gm');
    const joinedAt = addMin(T0, -300);
    await seedPlayer(db(), 'alice', { displayName: 'Alice', points: 10, joinedAt });
    await seedPlayer(db(), 'bob', { displayName: 'Bob', points: -10, joinedAt });
    await seedPlayer(db(), 'carol', { displayName: 'Carol', points: 0, joinedAt });

    // The incriminating photos, voted yes/no: two tag bob (3 + 1 damning votes), one tags carol (2).
    await db().doc('globalQuests/inc').set({
      title: 'Incriminating evidence', description: '', bonusPoints: 2, source: 'story', templateId: null, storyId: 's-incriminating',
      startsAt: ts(addMin(T0, -200)), endsAt: ts(addMin(T0, -20)), status: 'closed', votingEndsAt: null,
      winnerUids: ['bob'], winningSubmissionIds: ['i1'], tally: { i1: 2, i2: 0, i3: 1 }, yesNo: { i1: { yes: 3, no: 1 }, i2: { yes: 1, no: 1 }, i3: { yes: 2, no: 1 } },
    });
    await seedSubmission(db(), 'i1', { uid: 'alice', kind: 'global', questId: 'inc', witnessUid: null, status: 'approved', createdAt: addMin(T0, -100), extra: { taggedUid: 'bob' } });
    await seedSubmission(db(), 'i2', { uid: 'carol', kind: 'global', questId: 'inc', witnessUid: null, status: 'approved', createdAt: addMin(T0, -90), extra: { taggedUid: 'bob' } });
    await seedSubmission(db(), 'i3', { uid: 'bob', kind: 'global', questId: 'inc', witnessUid: null, status: 'approved', createdAt: addMin(T0, -80), extra: { taggedUid: 'carol' } });
    // Only the server reads these: carol wrote bob's motive, alice framed bob twice.
    await db().doc('motives/bob').set({ text: 'He spoiled Line of Duty.', updatedAt: ts(addMin(T0, -150)), byUid: 'carol' });
    await db().doc('rewards/r1').set({ uid: 'alice', submissionId: 'r1', status: 'framed', targetUid: 'bob', createdAt: ts(addMin(T0, -60)) });
    await db().doc('rewards/r2').set({ uid: 'alice', submissionId: 'r2', status: 'framed', targetUid: 'bob', createdAt: ts(addMin(T0, -50)) });
    await db().doc('policeCalls/c1').set({ uid: 'bob', kind: 'tip', byUid: 'alice', status: 'missed', startsAt: ts(addMin(T0, -40)) });
    // A roll call (carol missed it), and the time of death as the story fixed it, on London's clock.
    await db().doc('checkins/k1').set({ periodicId: 'roll-call', name: 'Roll call', prompt: '', number: 1, startsAt: ts(addMin(T0, -120)), endsAt: ts(addMin(T0, -105)), status: 'closed', penalty: 5, missedUids: ['carol'] });
    await db().doc('checkins/k1/answers/alice').set({ uid: 'alice', imagePath: null, thumbPath: null, caption: 'here', createdAt: ts(addMin(T0, -118)), feedId: 'f9' });
    await db().doc('checkins/k1/answers/bob').set({ uid: 'bob', imagePath: null, thumbPath: null, caption: 'here', createdAt: ts(addMin(T0, -110)), feedId: 'f8' });
    await db().doc('facts/timeOfDeath').set({ key: 'timeOfDeath', label: 'Time of death', value: '14:40', entries: [], storyId: 's-time-of-death', at: ts(addMin(T0, -100)) });
    await db().doc('pointsLedger/l1').set({ uid: 'alice', delta: 10, reason: 'cleared', ref: null, by: 'system', createdAt: ts(addMin(T0, -55)) });
    await db().doc('pointsLedger/l2').set({ uid: 'bob', delta: -5, reason: 'framed', ref: null, by: 'system', createdAt: ts(addMin(T0, -60)) });
    await db().doc('pointsLedger/l3').set({ uid: 'bob', delta: -5, reason: 'framed', ref: null, by: 'system', createdAt: ts(addMin(T0, -50)) });

    await endGame(db(), ctx('gm', T0, undefined, undefined, mystery), { venues: [] });
    const file = (await getData(db(), 'game/final'))!.closing as CaseFile;

    expect(file.verdict).toEqual({ opened: true, tally: { bob: 4, carol: 2 }, photos: { bob: 2, carol: 1 }, uids: ['bob'], motiveBy: { bob: 'carol' } });
    const won = Object.fromEntries(file.awards.map((a) => [a.id, a.uids]));
    expect(won).toMatchObject({ murderer: ['bob'], innocent: ['carol'], pen: ['carol'], puppet: ['alice'], fallguy: ['bob'], snitch: ['alice'] });
    expect(file.awards.find((a) => a.id === 'puppet')?.n).toEqual({ alice: { frames: 2 } });
    expect(file.timeline.map((l) => [l.uid, l.delta])).toEqual([['bob', -5], ['alice', 10], ['bob', -5]]);
    // 14:40 BST is 13:40 UTC, 20 minutes before the close: bob answered the roll call last before it.
    expect(file.deathAt).toBe(addMin(T0, -20).getTime());
    expect(won.lastseen).toEqual(['bob']);
    expect(JSON.stringify(file)).not.toContain('targetUid');
  });
});

