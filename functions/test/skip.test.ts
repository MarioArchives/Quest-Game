// Mystery plan edge cases 9-12: the penalty for skipping a side quest (settings.sideQuestSkipPenalty, 0 = off).
// When a side quest closes (its vote is tallied, or the GM opens the vote with no entries left), every player who
// could have entered and has no entry in the vote loses the penalty (ledger 'skipped', by 'system', ref the side
// quest). Exempt: players who have left, players who joined after it opened, and GMs who don't play.
// setup(): alice, bob and carol play; dave has left; erin joined after gq1 opened; gm does not play.
import { describe, expect, it } from 'vitest';
import { runTick } from '../src/game/globals.js';
import { advanceGlobalQuest, castVote, checkEntry, enterSideQuest } from '../src/game/votes.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  getData,
  getPlayer,
  ledgerFor,
  seedAdmin,
  seededRng,
  seedGame,
  seedGlobalQuest,
  seedPlayer,
  T0,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-skip');

async function setup(settings: Partial<Settings> = { sideQuestSkipPenalty: 25 }, points: Record<string, number> = {}) {
  await seedGame(db(), { status: 'active', settings });
  await seedAdmin(db(), 'gm');
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid, { points: points[uid] ?? 0 });
  await seedPlayer(db(), 'dave');
  await db().doc('players/dave').update({ left: 'frozen' });
  // gq1 opened at T0-10; erin joined at T0-5.
  await seedPlayer(db(), 'erin', { joinedAt: addMin(T0, -5) });
  await seedGlobalQuest(db(), 'gq1', { status: 'live', startsAt: addMin(T0, -10), endsAt: addMin(T0, 30), bonusPoints: 100 });
}

const enter = (uid: string) =>
  enterSideQuest(db(), ctx(uid, T0), {
    globalQuestId: 'gq1',
    imagePath: `submissions/${uid}/e.jpg`,
    thumbPath: `submissions/${uid}/e_thumb.jpg`,
    caption: `${uid}'s entry`,
  });

const advance = (now = addMin(T0, 5), by = 'gm') => advanceGlobalQuest(db(), ctx(by, now), { globalQuestId: 'gq1' });
const vote = (uid: string, submissionId: string) => castVote(db(), ctx(uid, addMin(T0, 6)), { globalQuestId: 'gq1', submissionId });

const skipped = async (uid: string) => (await ledgerFor(db(), uid)).filter((l) => l.reason === 'skipped');
const allSkipped = async () => (await allDocs(db(), 'pointsLedger')).filter((l) => l.reason === 'skipped');

/** alice and bob enter; the GM closes entries and opens the vote. Returns their entry ids. */
async function aliceAndBobInVoting() {
  const a = (await enter('alice')).submissionId;
  const b = (await enter('bob')).submissionId;
  await advance(); // live → checking
  await advance(); // checking → voting
  return { a, b };
}

describe('M9. the vote closes: whoever did not enter pays', () => {
  it('when the GM ends the vote: carol, who never entered, loses the penalty; the entrants do not', async () => {
    await setup();
    await aliceAndBobInVoting();
    expect(await advance(addMin(T0, 10))).toEqual({ status: 'closed' });

    expect((await getPlayer(db(), 'carol')).points).toBe(-25);
    expect(await skipped('carol')).toEqual([expect.objectContaining({ delta: -25, reason: 'skipped', ref: 'gq1', by: 'system' })]);
    expect(await skipped('alice')).toEqual([]);
    expect(await skipped('bob')).toEqual([]);
  });

  it('when everyone eligible has voted, the same', async () => {
    await setup();
    const { a, b } = await aliceAndBobInVoting();
    await vote('alice', b);
    await vote('bob', a);
    await vote('carol', a);
    await vote('erin', a);
    expect((await getData(db(), 'globalQuests/gq1'))?.status).toBe('closed');
    expect(await skipped('carol')).toHaveLength(1);
    expect(await skipped('alice')).toEqual([]);
    expect(await skipped('bob')).toEqual([]);
    // The winner still gets the bonus.
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it('when the tick closes the vote at votingEndsAt', async () => {
    await setup();
    await aliceAndBobInVoting();
    const closed = await runTick(db(), addMin(T0, 60), seededRng());
    expect(closed.closed).toEqual(['gq1']);
    expect(await skipped('carol')).toHaveLength(1);
    expect(await skipped('alice')).toEqual([]);
  });
});

describe('M10. who is exempt', () => {
  it('players who have left, players who joined after it opened, and a GM who does not play', async () => {
    await setup();
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect(await skipped('dave')).toEqual([]);
    expect((await getPlayer(db(), 'dave')).points).toBe(0);
    expect(await skipped('erin')).toEqual([]);
    expect((await getPlayer(db(), 'erin')).points).toBe(0);
    expect(await skipped('gm')).toEqual([]);
    expect((await allSkipped()).map((l) => l.uid)).toEqual(['carol']);
  });

  it('a player kicked out (left: out) is exempt too', async () => {
    await setup();
    await db().doc('players/carol').update({ left: 'out' });
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect(await allSkipped()).toEqual([]);
  });

  it('a GM who plays and did not enter pays like anyone else', async () => {
    await setup();
    await seedPlayer(db(), 'gm');
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect((await allSkipped()).map((l) => l.uid).sort()).toEqual(['carol', 'gm']);
  });
});

describe('M11. no entries, and entries thrown out', () => {
  it('opening the vote with no entries closes it and penalises everyone who could have entered', async () => {
    await setup();
    await advance(); // live → checking
    expect(await advance()).toEqual({ status: 'closed' });
    expect((await allSkipped()).map((l) => l.uid).sort()).toEqual(['alice', 'bob', 'carol']);
    for (const uid of ['alice', 'bob', 'carol']) expect((await getPlayer(db(), uid)).points).toBe(-25);
  });

  it('an entry thrown out at checking counts as skipped', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    const b = (await enter('bob')).submissionId;
    await advance(); // live → checking
    await checkEntry(db(), ctx('gm', addMin(T0, 5)), { submissionId: a, accept: true });
    await checkEntry(db(), ctx('gm', addMin(T0, 5)), { submissionId: b, accept: false });
    await advance(); // checking → voting
    await advance(addMin(T0, 10)); // voting → closed
    expect((await allSkipped()).map((l) => l.uid).sort()).toEqual(['bob', 'carol']);
  });

  it('every entry thrown out: the vote opens with none, and everyone who could have entered pays', async () => {
    await setup();
    const a = (await enter('alice')).submissionId;
    await advance();
    await checkEntry(db(), ctx('gm', addMin(T0, 5)), { submissionId: a, accept: false });
    expect(await advance()).toEqual({ status: 'closed' });
    expect((await allSkipped()).map((l) => l.uid).sort()).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('M12. off by default, and only once', () => {
  it('a penalty of 0 writes no ledger entries and moves no points', async () => {
    await setup({ sideQuestSkipPenalty: 0 });
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect(await allSkipped()).toEqual([]);
    expect((await getPlayer(db(), 'carol')).points).toBe(0);
  });

  it('the engine default is 0', async () => {
    await setup({});
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect(await allSkipped()).toEqual([]);
  });

  it('applies once per side quest, however often the tick runs afterwards', async () => {
    await setup();
    await aliceAndBobInVoting();
    await runTick(db(), addMin(T0, 60), seededRng());
    await runTick(db(), addMin(T0, 75), seededRng());
    await runTick(db(), addMin(T0, 90), seededRng());
    expect(await skipped('carol')).toHaveLength(1);
    expect((await getPlayer(db(), 'carol')).points).toBe(-25);
  });

  it('with the floor on, the penalty stops at zero', async () => {
    await setup({ sideQuestSkipPenalty: 25, pointsFloorZero: true }, { carol: 10 });
    await aliceAndBobInVoting();
    await advance(addMin(T0, 10));
    expect((await getPlayer(db(), 'carol')).points).toBe(0);
    expect(await skipped('carol')).toEqual([expect.objectContaining({ delta: -10 })]);
  });
});
