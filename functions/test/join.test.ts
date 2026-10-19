// Edge cases 14 (requestJoin), 15 (reviewJoinRequest) and Revision 4 G1–G5 (GMs never need approval).
import { describe, expect, it } from 'vitest';
import { handleAdminCreated, requestJoin, reviewJoinRequest } from '../src/game/join.js';
import {
  allDocs,
  ctx,
  expectCode,
  getData,
  getPlayer,
  getQuests,
  seededRng,
  seedAdmin,
  seedGame,
  seedGlobalTemplate,
  seedPersonalTemplates,
  seedPlayer,
  T0,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-join');

describe('requestJoin', () => {
  it('rejects signed-out callers', async () => {
    await seedGame(db(), { status: 'lobby' });
    await expectCode(requestJoin(db(), ctx(null), { displayName: 'Sam' }), 'unauthenticated');
  });

  it('creates a pending request with a trimmed name', async () => {
    await seedGame(db(), { status: 'lobby' });
    const res = await requestJoin(db(), ctx('sam'), { displayName: '  Sam  ', photoURL: 'https://example.com/sam.jpg' });
    expect(res).toEqual({ status: 'pending' });
    const req = await getData(db(), 'joinRequests/sam');
    expect(req).toMatchObject({
      uid: 'sam',
      displayName: 'Sam',
      photoURL: 'https://example.com/sam.jpg',
      email: 'sam@example.com',
      status: 'pending',
    });
    expect(await getData(db(), 'players/sam')).toBeUndefined();
  });

  it('accepts a request while the game is active', async () => {
    await seedGame(db(), { status: 'active' });
    expect(await requestJoin(db(), ctx('sam'), { displayName: 'Sam' })).toEqual({ status: 'pending' });
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '    '],
    ['25 characters', 'x'.repeat(25)],
    ['not a string', 42],
    ['missing', undefined],
  ])('rejects a display name that is %s', async (_label, displayName) => {
    await seedGame(db(), { status: 'lobby' });
    await expectCode(requestJoin(db(), ctx('sam'), { displayName }), 'invalid-argument');
    expect(await getData(db(), 'joinRequests/sam')).toBeUndefined();
  });

  it('accepts a 24-character display name', async () => {
    await seedGame(db(), { status: 'lobby' });
    await requestJoin(db(), ctx('sam'), { displayName: 'y'.repeat(24) });
    expect((await getData(db(), 'joinRequests/sam'))?.displayName).toBe('y'.repeat(24));
  });

  it('rejects requests once the game has ended', async () => {
    await seedGame(db(), { status: 'ended' });
    await expectCode(requestJoin(db(), ctx('sam'), { displayName: 'Sam' }), 'failed-precondition');
  });

  it('tells an existing player they are already in, without creating a request', async () => {
    await seedGame(db(), { status: 'active' });
    await seedPlayer(db(), 'sam');
    expect(await requestJoin(db(), ctx('sam'), { displayName: 'Sam' })).toEqual({ status: 'already-player' });
    expect(await getData(db(), 'joinRequests/sam')).toBeUndefined();
  });

  it('re-requesting while pending updates the name and photo (idempotent)', async () => {
    await seedGame(db(), { status: 'lobby' });
    await requestJoin(db(), ctx('sam'), { displayName: 'Sam', photoURL: 'https://example.com/a.jpg' });
    await requestJoin(db(), ctx('sam'), { displayName: 'Sammy', photoURL: 'https://example.com/b.jpg' });
    const reqs = await allDocs(db(), 'joinRequests');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ displayName: 'Sammy', photoURL: 'https://example.com/b.jpg', status: 'pending' });
  });

  it('refuses a user whose request was rejected', async () => {
    await seedGame(db(), { status: 'lobby' });
    await db().doc('joinRequests/sam').set({ uid: 'sam', displayName: 'Sam', photoURL: null, email: null, status: 'rejected' });
    await expectCode(requestJoin(db(), ctx('sam'), { displayName: 'Sam' }), 'permission-denied');
    expect((await getData(db(), 'joinRequests/sam'))?.status).toBe('rejected');
  });
});

describe('reviewJoinRequest', () => {
  async function pending(uid = 'sam') {
    await requestJoin(db(), ctx(uid), { displayName: uid.toUpperCase(), photoURL: `https://example.com/${uid}.jpg` });
  }

  it('only lets a GM review', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedPersonalTemplates(db(), 10);
    await seedPlayer(db(), 'alice');
    await pending();
    await expectCode(reviewJoinRequest(db(), ctx('alice'), { uid: 'sam', approve: true }), 'permission-denied');
    await expectCode(reviewJoinRequest(db(), ctx(null), { uid: 'sam', approve: true }), 'unauthenticated');
    expect(await getData(db(), 'players/sam')).toBeUndefined();
  });

  it('returns not-found for an unknown request', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await expectCode(reviewJoinRequest(db(), ctx('gm'), { uid: 'nobody', approve: true }), 'not-found');
  });

  it('refuses approvals once the game has ended', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 10);
    await pending();
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true }), 'failed-precondition');
  });

  it('approval creates the player and deals exactly starterQuestCount distinct active personal quests', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 12, { retired: ['p01', 'p02', 'p03'] });
    await seedGlobalTemplate(db(), 'g01');
    await seedGlobalTemplate(db(), 'g02');
    await pending();

    const res = await reviewJoinRequest(db(), ctx('gm', undefined, seededRng(7)), { uid: 'sam', approve: true });
    expect(res).toEqual({ status: 'approved' });

    const player = await getPlayer(db(), 'sam');
    expect(player).toMatchObject({
      displayName: 'SAM',
      photoURL: 'https://example.com/sam.jpg',
      points: 0,
      rerollsUsed: 0,
      questsCompleted: 0,
      // Not through the pack's onboarding yet.
      bookedAt: null,
    });
    expect(player.joinedAt).toBeDefined();

    const quests = await getQuests(db(), 'sam');
    expect(quests).toHaveLength(5);
    const templateIds = quests.map((q) => q.templateId);
    expect(new Set(templateIds).size).toBe(5);
    for (const q of quests) {
      expect(q.status).toBe('active');
      expect(['p01', 'p02', 'p03', 'g01', 'g02']).not.toContain(q.templateId);
      expect(q.title).toBe(`Personal quest ${q.templateId}`);
      expect(q.description).toBe(`Do the thing ${q.templateId}`);
    }

    expect((await getData(db(), 'joinRequests/sam'))?.status).toBe('approved');
    const feed = await allDocs(db(), 'feed');
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: 'join', uid: 'sam' });
    expect(feed[0].text).toContain('SAM');
  });

  it('respects a custom starterQuestCount', async () => {
    await seedGame(db(), { status: 'lobby', settings: { starterQuestCount: 3 } });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 10);
    await pending();
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
    expect(await getQuests(db(), 'sam')).toHaveLength(3);
  });

  it('approving twice does not deal a second hand', async () => {
    await seedGame(db(), { status: 'active' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 20);
    await pending();
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
    expect(await getQuests(db(), 'sam')).toHaveLength(5);
    expect(await allDocs(db(), 'feed')).toHaveLength(1);
  });

  it('rejection creates no player', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 10);
    await pending();
    expect(await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: false })).toEqual({ status: 'rejected' });
    expect(await getData(db(), 'players/sam')).toBeUndefined();
    expect(await getData(db(), 'joinRequests/sam')).toMatchObject({ status: 'rejected', reviewedBy: 'gm' });
    expect(await allDocs(db(), 'feed')).toHaveLength(0);
  });

  it('a GM can approve a request they previously rejected', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 10);
    await pending();
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: false });
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
    expect(await getPlayer(db(), 'sam')).toMatchObject({ points: 0 });
    expect(await getQuests(db(), 'sam')).toHaveLength(5);
  });

  it('deals every available template, without duplicates, when the pool is smaller than a hand', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 3);
    await pending();
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
    const ids = (await getQuests(db(), 'sam')).map((q) => q.templateId).sort();
    expect(ids).toEqual(['p01', 'p02', 'p03']);
  });

  it('lets the GM approve themself (GM may also play)', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 10);
    await pending('gm');
    await reviewJoinRequest(db(), ctx('gm'), { uid: 'gm', approve: true });
    expect(await getQuests(db(), 'gm')).toHaveLength(5);
  });
});

describe('GMs join without approval (Revision 4)', () => {
  async function gmWithTemplates(status: 'lobby' | 'active' | 'ended' = 'active') {
    await seedGame(db(), { status });
    await seedAdmin(db(), 'gm');
    await seedPersonalTemplates(db(), 12);
  }

  it('G1: a GM asking to join becomes a player straight away, with a hand and a join post', async () => {
    await gmWithTemplates();
    expect(await requestJoin(db(), ctx('gm', undefined, seededRng(1)), { displayName: ' Gina ', photoURL: null })).toEqual({ status: 'approved' });
    expect(await getPlayer(db(), 'gm')).toMatchObject({ displayName: 'Gina', points: 0, rerollsUsed: 0, questsCompleted: 0 });
    const quests = await getQuests(db(), 'gm');
    expect(quests).toHaveLength(5);
    expect(new Set(quests.map((q) => q.templateId)).size).toBe(5);
    expect(await getData(db(), 'joinRequests/gm')).toMatchObject({ status: 'approved', reviewedBy: 'gm' });
    const feed = await allDocs(db(), 'feed');
    expect(feed.filter((f) => f.type === 'join')).toEqual([expect.objectContaining({ uid: 'gm' })]);
  });

  it('G1: works in the lobby too', async () => {
    await gmWithTemplates('lobby');
    expect(await requestJoin(db(), ctx('gm'), { displayName: 'Gina' })).toEqual({ status: 'approved' });
  });

  it('G2: a GM whose earlier request was rejected is still let straight in', async () => {
    await gmWithTemplates();
    await db().doc('joinRequests/gm').set({ uid: 'gm', displayName: 'Gina', photoURL: null, email: null, status: 'rejected' });
    expect(await requestJoin(db(), ctx('gm'), { displayName: 'Gina' })).toEqual({ status: 'approved' });
    expect(await getQuests(db(), 'gm')).toHaveLength(5);
  });

  it('G3: a GM who already plays gets already-player; name rules and the ended game still apply', async () => {
    await gmWithTemplates();
    await requestJoin(db(), ctx('gm'), { displayName: 'Gina' });
    expect(await requestJoin(db(), ctx('gm'), { displayName: 'Gina' })).toEqual({ status: 'already-player' });
    expect(await getQuests(db(), 'gm')).toHaveLength(5);

    await seedAdmin(db(), 'gm2');
    await expectCode(requestJoin(db(), ctx('gm2'), { displayName: '' }), 'invalid-argument');
    await db().doc('game/state').update({ status: 'ended' });
    await expectCode(requestJoin(db(), ctx('gm2'), { displayName: 'Rosa' }), 'failed-precondition');
  });

  it('G4: everyone else still waits for a GM', async () => {
    await gmWithTemplates();
    expect(await requestJoin(db(), ctx('sam'), { displayName: 'Sam' })).toEqual({ status: 'pending' });
    expect(await getData(db(), 'players/sam')).toBeUndefined();
  });

  describe('G5: handleAdminCreated (someone is made GM later)', () => {
    it('approves their pending request: player, hand and join post', async () => {
      await gmWithTemplates();
      await requestJoin(db(), ctx('sam'), { displayName: 'Sam' });
      await seedAdmin(db(), 'sam');
      await handleAdminCreated(db(), 'sam', T0, seededRng(2));
      expect(await getPlayer(db(), 'sam')).toMatchObject({ displayName: 'Sam', points: 0 });
      expect(await getQuests(db(), 'sam')).toHaveLength(5);
      expect((await getData(db(), 'joinRequests/sam'))?.status).toBe('approved');
      expect((await allDocs(db(), 'feed')).filter((f) => f.type === 'join' && f.uid === 'sam')).toHaveLength(1);
    });

    it('also approves a request that had been rejected', async () => {
      await gmWithTemplates();
      await db().doc('joinRequests/sam').set({ uid: 'sam', displayName: 'Sam', photoURL: null, email: null, status: 'rejected' });
      await seedAdmin(db(), 'sam');
      await handleAdminCreated(db(), 'sam', T0, seededRng(3));
      expect(await getQuests(db(), 'sam')).toHaveLength(5);
    });

    it('does nothing without a request, or for someone who already plays, and never deals twice', async () => {
      await gmWithTemplates();
      await seedAdmin(db(), 'rosa');
      await handleAdminCreated(db(), 'rosa', T0);
      expect(await getData(db(), 'players/rosa')).toBeUndefined();

      await requestJoin(db(), ctx('sam'), { displayName: 'Sam' });
      await seedAdmin(db(), 'sam');
      await handleAdminCreated(db(), 'sam', T0, seededRng(4));
      await handleAdminCreated(db(), 'sam', T0, seededRng(5)); // duplicate delivery
      expect(await getQuests(db(), 'sam')).toHaveLength(5);
      expect((await allDocs(db(), 'feed')).filter((f) => f.type === 'join' && f.uid === 'sam')).toHaveLength(1);
    });

    it('does nothing once the game has ended', async () => {
      await gmWithTemplates();
      await requestJoin(db(), ctx('sam'), { displayName: 'Sam' });
      await db().doc('game/state').update({ status: 'ended' });
      await seedAdmin(db(), 'sam');
      await handleAdminCreated(db(), 'sam', T0);
      expect(await getData(db(), 'players/sam')).toBeUndefined();
      expect((await getData(db(), 'joinRequests/sam'))?.status).toBe('pending');
    });
  });
});
