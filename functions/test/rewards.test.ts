// Mystery plan edge cases 1-7: the reward choice (packs with rewardChoice). A witness confirming a personal claim
// earns its owner one reward: clean (points to themselves) or frame (points off another player). Framing is
// anonymous: the target's ledger and the feed never name the framer or point at the claim; only the owner and the
// GM can read rewards/{id}. A GM fraud override voids a pending reward and undoes a used one.
import { describe, expect, it } from 'vitest';
import { resolveReward } from '../src/game/rewards.js';
import { handleSubmissionCreated, reviewSubmission } from '../src/game/submissions.js';
import { advanceGlobalQuest, castVote, enterSideQuest } from '../src/game/votes.js';
import type { GamePack } from '../src/shared/packs/types.js';
import type { Settings } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  feedOf,
  getData,
  getPlayer,
  hand,
  ledgerFor,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalQuest,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  toMillis,
  useEmulatorDb,
} from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-rewards');

const PACK = testPack({ features: { rewardChoice: true } });
const at = (uid: string | null, now: Date, pack: GamePack = PACK) => ctx(uid, now, seededRng(6), undefined, pack);

/** alice claims, bob witnesses, carol (100 points) is a target, dave has left, gm does not play. */
async function setup(settings: Partial<Settings> = {}, carolPoints = 100) {
  await seedGame(db(), { status: 'active', settings });
  await seedPersonalTemplates(db(), 20);
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { quests: hand(['p01', 'p02', 'p03', 'p04', 'p05']) });
  await seedPlayer(db(), 'bob', { quests: hand(['p06', 'p07', 'p08', 'p09', 'p10']).map((q) => ({ ...q, id: `b${q.id}` })) });
  await seedPlayer(db(), 'carol', { points: carolPoints });
  await seedPlayer(db(), 'dave');
  await db().doc('players/dave').update({ left: 'frozen' });
}

/** alice claims `questId` naming bob, and bob confirms it at T0+5. */
async function confirmed(id = 's1', questId = 'q1', pack: GamePack = PACK) {
  await seedSubmission(db(), id, { uid: 'alice', questId, witnessUid: 'bob' });
  await handleSubmissionCreated(db(), id, T0, seededRng(5), pack);
  await reviewSubmission(db(), at('bob', addMin(T0, 5), pack), { submissionId: id, approve: true });
}

const use = (uid: string | null, data: Record<string, unknown>, now = addMin(T0, 10), pack: GamePack = PACK) =>
  resolveReward(db(), at(uid, now, pack), data);

const fraud = (id = 's1', now = addMin(T0, 20)) =>
  reviewSubmission(db(), at('gm', now), { submissionId: id, approve: false, note: 'Staged' });

const rewards = () => allDocs(db(), 'rewards');
const sortedDeltas = (l: Array<Record<string, any>>) => l.map((e) => e.delta).sort((a, b) => a - b);

describe('M1. a confirmed personal claim earns one reward', () => {
  it('creates one pending reward for the claimant, keyed by the claim', async () => {
    await setup();
    await confirmed();
    const all = await rewards();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 's1', uid: 'alice', submissionId: 's1', status: 'pending' });
    expect(toMillis(all[0].createdAt)).toBe(addMin(T0, 5).getTime());
    // Approval itself is unchanged: +100 for the quest.
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it('each confirmed claim earns its own reward', async () => {
    await setup();
    await confirmed('s1', 'q1');
    await confirmed('s2', 'q2');
    expect((await rewards()).map((r) => r.id).sort()).toEqual(['s1', 's2']);
  });

  it('approving twice still leaves one reward', async () => {
    await setup();
    await confirmed();
    await reviewSubmission(db(), at('bob', addMin(T0, 6)), { submissionId: 's1', approve: true }).catch(() => undefined);
    expect(await rewards()).toHaveLength(1);
  });

  it('creates none when the pack has no reward choice', async () => {
    await setup();
    await confirmed('s1', 'q1', lancaster());
    expect(await rewards()).toEqual([]);
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
  });

  it('creates none for a rejected claim', async () => {
    await setup();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    await handleSubmissionCreated(db(), 's1', T0, seededRng(5), PACK);
    await reviewSubmission(db(), at('bob', addMin(T0, 5)), { submissionId: 's1', approve: false });
    expect(await rewards()).toEqual([]);
  });

  it('never creates one for a side-quest entry, even a winning one', async () => {
    await setup();
    await seedGlobalQuest(db(), 'gq1', { status: 'live', endsAt: addMin(T0, 30) });
    const enter = (uid: string) =>
      enterSideQuest(db(), at(uid, T0), {
        globalQuestId: 'gq1',
        imagePath: `submissions/${uid}/e.jpg`,
        thumbPath: `submissions/${uid}/e_thumb.jpg`,
        caption: 'entry',
      });
    const a = (await enter('alice')).submissionId;
    await enter('bob');
    const advance = () => advanceGlobalQuest(db(), at('gm', addMin(T0, 5)), { globalQuestId: 'gq1' });
    await advance(); // live → checking
    await advance(); // checking → voting
    await castVote(db(), at('carol', addMin(T0, 6)), { globalQuestId: 'gq1', submissionId: a });
    await advanceGlobalQuest(db(), at('gm', addMin(T0, 7)), { globalQuestId: 'gq1' }); // voting → closed
    expect((await getData(db(), 'globalQuests/gq1'))?.winnerUids).toEqual(['alice']);
    expect(await rewards()).toEqual([]);
  });
});

describe('M2. clean: points to yourself', () => {
  it('pays cleanPoints to the owner, marks the reward and posts nothing', async () => {
    await setup();
    await confirmed();
    const before = (await allDocs(db(), 'feed')).length;
    expect(await use('alice', { rewardId: 's1', choice: 'clean' })).toEqual({ status: 'cleaned', points: 50 });

    expect((await getPlayer(db(), 'alice')).points).toBe(150);
    const line = (await ledgerFor(db(), 'alice')).find((l) => l.reason === 'cleared');
    expect(line).toMatchObject({ delta: 50, reason: 'cleared', ref: 's1' });
    const r = await getData(db(), 'rewards/s1');
    expect(r).toMatchObject({ status: 'cleaned', applied: 50 });
    expect(r?.targetUid ?? null).toBeNull();
    expect(toMillis(r!.resolvedAt)).toBe(addMin(T0, 10).getTime());
    expect((await allDocs(db(), 'feed')).length).toBe(before);
    // Nobody else's points move.
    expect((await getPlayer(db(), 'carol')).points).toBe(100);
  });

  it('uses the cleanPoints setting', async () => {
    await setup({ cleanPoints: 30 });
    await confirmed();
    expect(await use('alice', { rewardId: 's1', choice: 'clean' })).toEqual({ status: 'cleaned', points: 30 });
    expect((await getPlayer(db(), 'alice')).points).toBe(130);
  });
});

describe('M3. frame: points off another player, anonymously', () => {
  it("takes framePoints off the target only; the ledger and the feed never name the framer or the claim", async () => {
    await setup();
    await confirmed();
    expect(await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' })).toEqual({ status: 'framed', points: -50 });

    expect((await getPlayer(db(), 'carol')).points).toBe(50);
    const carol = await ledgerFor(db(), 'carol');
    expect(carol).toEqual([expect.objectContaining({ delta: -50, reason: 'framed', by: 'system', ref: null })]);
    expect(JSON.stringify(carol)).not.toMatch(/alice|s1/);

    // The framer gains nothing and has no frame line.
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
    expect((await ledgerFor(db(), 'alice')).map((l) => l.reason)).toEqual(['quest']);

    const r = await getData(db(), 'rewards/s1');
    expect(r).toMatchObject({ status: 'framed', targetUid: 'carol', applied: -50 });
    expect(toMillis(r!.resolvedAt)).toBe(addMin(T0, 10).getTime());

    const posts = await feedOf(db(), 'framed');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ uid: 'carol', points: -50 });
    expect(posts[0].actorUid ?? null).toBeNull();
    expect(posts[0].submissionId ?? null).toBeNull();
    expect(posts[0].ref ?? null).toBeNull();
    expect(posts[0].text).toContain('Carol');
    expect(posts[0].text).not.toContain('Alice');
    expect(JSON.stringify(posts[0])).not.toMatch(/alice|s1/);
  });

  it('uses the framePoints setting', async () => {
    await setup({ framePoints: 70 });
    await confirmed();
    expect(await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' })).toEqual({ status: 'framed', points: -70 });
    expect((await getPlayer(db(), 'carol')).points).toBe(30);
  });

  it('a GM who plays can be framed like anyone else', async () => {
    await setup();
    await seedPlayer(db(), 'gm', { points: 10 });
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'gm' });
    expect((await getPlayer(db(), 'gm')).points).toBe(-40);
  });
});

describe('M4. who can be framed', () => {
  it.each([
    ['yourself', { targetUid: 'alice' }, 'invalid-argument'],
    ['nobody (no targetUid)', {}, 'invalid-argument'],
    ['a malformed targetUid', { targetUid: 42 }, 'invalid-argument'],
    ['someone who is not a player', { targetUid: 'nobody' }, 'not-found'],
    ['a GM who does not play', { targetUid: 'gm' }, 'not-found'],
    ['a player who has left', { targetUid: 'dave' }, 'failed-precondition'],
  ])('refuses framing %s, and the reward stays pending', async (_label, extra, code) => {
    await setup();
    await confirmed();
    await expectCode(use('alice', { rewardId: 's1', choice: 'frame', ...extra }), code);
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('pending');
    expect((await getPlayer(db(), 'alice')).points).toBe(100);
    expect((await getPlayer(db(), 'carol')).points).toBe(100);
    expect(await feedOf(db(), 'framed')).toEqual([]);
  });
});

describe('M5. using a reward', () => {
  it('works once: a second use of either kind is refused and changes nothing', async () => {
    await setup();
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'clean' });
    await expectCode(use('alice', { rewardId: 's1', choice: 'clean' }), 'failed-precondition');
    await expectCode(use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' }), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).points).toBe(150);
    expect((await getPlayer(db(), 'carol')).points).toBe(100);
  });

  it("only its owner can use it: not another player, not the GM", async () => {
    await setup();
    await confirmed();
    await expectCode(use('bob', { rewardId: 's1', choice: 'clean' }), 'permission-denied');
    await expectCode(use('carol', { rewardId: 's1', choice: 'frame', targetUid: 'bob' }), 'permission-denied');
    await expectCode(use('gm', { rewardId: 's1', choice: 'frame', targetUid: 'carol' }), 'permission-denied');
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('pending');
  });

  it.each([
    ['an unknown reward', { rewardId: 'nope', choice: 'clean' }, 'not-found'],
    ['a malformed reward id', { rewardId: 7, choice: 'clean' }, 'invalid-argument'],
    ['an unknown choice', { rewardId: 's1', choice: 'steal' }, 'invalid-argument'],
    ['no choice', { rewardId: 's1' }, 'invalid-argument'],
  ])('refuses %s', async (_label, data, code) => {
    await setup();
    await confirmed();
    await expectCode(use('alice', data), code);
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('pending');
  });

  it('is refused when the pack has no reward choice', async () => {
    await setup();
    await confirmed();
    await expectCode(use('alice', { rewardId: 's1', choice: 'clean' }, addMin(T0, 10), lancaster()), 'failed-precondition');
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('pending');
  });

  it('is refused for signed-out callers and non-players', async () => {
    await setup();
    await confirmed();
    await expectCode(use(null, { rewardId: 's1', choice: 'clean' }), 'unauthenticated');
    await expectCode(use('stranger', { rewardId: 's1', choice: 'clean' }), 'permission-denied');
  });

  it('is refused once the game has ended, and allowed while paused', async () => {
    await setup();
    await confirmed('s1', 'q1');
    await confirmed('s2', 'q2');
    await db().doc('game/state').update({ status: 'paused' });
    expect((await use('alice', { rewardId: 's1', choice: 'clean' })).status).toBe('cleaned');
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(use('alice', { rewardId: 's2', choice: 'clean' }), 'failed-precondition');
    expect((await getData(db(), 'rewards/s2'))?.status).toBe('pending');
  });
});

describe('M6. the points floor', () => {
  it('with the floor on, framing a player below the amount takes them only to zero', async () => {
    await setup({ pointsFloorZero: true }, 20);
    await confirmed();
    expect(await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' })).toEqual({ status: 'framed', points: -20 });
    expect((await getPlayer(db(), 'carol')).points).toBe(0);
    expect(await ledgerFor(db(), 'carol')).toEqual([expect.objectContaining({ delta: -20, reason: 'framed' })]);
    expect((await getData(db(), 'rewards/s1'))?.applied).toBe(-20);
    expect((await feedOf(db(), 'framed'))[0].points).toBe(-20);
  });

  it('with the floor off, a frame can take a player below zero', async () => {
    await setup({}, 20);
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' });
    expect((await getPlayer(db(), 'carol')).points).toBe(-30);
  });
});

describe('M7. a GM fraud override undoes the reward', () => {
  it('voids a pending reward, which then cannot be used; the usual reversal and fine still happen', async () => {
    await setup();
    await confirmed();
    await fraud();
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('void');
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
    expect(sortedDeltas(await ledgerFor(db(), 'alice'))).toEqual([-100, -50, 100]);
    await expectCode(use('alice', { rewardId: 's1', choice: 'clean' }, addMin(T0, 30)), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
  });

  it('takes back a used clean as a reversal', async () => {
    await setup();
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'clean' });
    await fraud();
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('void');
    // +100 quest, +50 clean, then −100 and −50 reversed, −50 fine.
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
    const ledger = await ledgerFor(db(), 'alice');
    expect(sortedDeltas(ledger)).toEqual([-100, -50, -50, 50, 100]);
    expect(sortedDeltas(ledger.filter((l) => l.reason === 'reversal'))).toEqual([-100, -50]);
    expect(ledger.filter((l) => l.reason === 'fraud')).toEqual([expect.objectContaining({ delta: -50, by: 'gm' })]);
  });

  it("refunds a used frame to the target as a GM adjustment that doesn't name the framer", async () => {
    await setup();
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' });
    await fraud();
    expect((await getData(db(), 'rewards/s1'))?.status).toBe('void');
    expect((await getPlayer(db(), 'carol')).points).toBe(100);
    const carol = await ledgerFor(db(), 'carol');
    expect(sortedDeltas(carol)).toEqual([-50, 50]);
    expect(carol.find((l) => l.delta === 50)).toMatchObject({ reason: 'adjust', by: 'gm', ref: null });
    expect(JSON.stringify(carol)).not.toMatch(/alice|s1/);
    // alice pays only the usual: the award back and the fine.
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
  });

  it('refunds only what a floored frame actually took', async () => {
    await setup({ pointsFloorZero: true }, 20);
    await confirmed();
    await use('alice', { rewardId: 's1', choice: 'frame', targetUid: 'carol' });
    await fraud();
    expect((await getPlayer(db(), 'carol')).points).toBe(20);
  });

  it('a fraud override with no reward (the pack has none) works as before', async () => {
    await setup();
    await confirmed('s1', 'q1', lancaster());
    await fraud();
    expect((await getPlayer(db(), 'alice')).points).toBe(-50);
    expect(await rewards()).toEqual([]);
  });
});
