// Edge case 37 (resetGame) and Revision 3 V17 (reactionCount on feed posts; comments are gone).
import { describe, expect, it } from 'vitest';
import { recountReactions } from '../src/game/reactions.js';
import { resetGame } from '../src/game/reset.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import {
  allDocs,
  ctx,
  expectCode,
  getData,
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

const db = useEmulatorDb('demo-fq-reset-comments');

const WIPED = [
  'players',
  'joinRequests',
  'submissions',
  'guesses',
  'guessCooldowns',
  'wraps',
  'locations',
  'pointsLedger',
  'feed',
  'globalQuests',
  // Packs with rewardChoice and characters (mystery plan).
  'rewards',
  'motives',
  // Packs with checkins.
  'checkins',
];

async function fullGame() {
  await seedGame(db(), { status: 'ended', settings: { rerollLimit: 7 }, state: { announcement: 'Bar closes at 11' } });
  await seedAdmin(db(), 'gm');
  await seedPersonalTemplates(db(), 6);
  await seedGlobalTemplate(db(), 'g01');
  await seedPlayer(db(), 'alice', { quests: [{ id: 'q1', templateId: 'p01' }] });
  await db().doc('joinRequests/alice').set({ uid: 'alice', status: 'approved' });
  await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', status: 'approved' });
  await db().doc('globalQuests/gq1/votes/alice').set({ submissionId: 's1', createdAt: ts(T0) });
  await db().doc('guesses/g1').set({ guesserUid: 'alice', targetUid: 'bob', templateId: 'p02', correct: false, createdAt: ts(T0) });
  await db().doc('guessCooldowns/alice_bob').set({ lastAt: ts(T0) });
  await db().doc('wraps/alice').set({ uid: 'alice' });
  await db().doc('locations/alice').set({ lat: 54, lng: -2.8, accuracy: 5, updatedAt: ts(T0) });
  await db().doc('pointsLedger/l1').set({ uid: 'alice', delta: 100, reason: 'quest', ref: 's1', by: 'gm', createdAt: ts(T0) });
  await db().doc('feed/f1').set({ type: 'join', text: 'Alice joined', uid: 'alice', ref: null, createdAt: ts(T0) });
  await db().doc('feed/f1/reactions/alice').set({ emoji: '🔥', createdAt: ts(T0) });
  await seedGlobalQuest(db(), 'gq1', { status: 'closed' });
  await db().doc('rewards/s1').set({ uid: 'alice', submissionId: 's1', status: 'pending', createdAt: ts(T0) });
  await db().doc('motives/alice').set({ text: 'Revenge', updatedAt: ts(T0) });
  await db().doc('checkins/c1').set({ periodicId: 'rc', name: 'Roll call', prompt: 'Show us your drink', status: 'closed', number: 1, penalty: 5, missedUids: [] });
  await db().doc('periodics/rc').set({ name: 'Roll call', prompts: ['x'], intervalMin: 60, windowMin: 15, penalty: 5, count: 4, sent: 2, status: 'running', nextAt: ts(T0), createdAt: ts(T0) });
  await db().doc('checkins/c1/answers/alice').set({ uid: 'alice', caption: 'Mild', createdAt: ts(T0) });
  await db().doc('stops/st1').set({ name: 'The Golden Lion', lat: 54.05, lng: -2.8, order: 1, revealed: true, startsAt: ts(T0), endsAt: null, createdAt: ts(T0) });
  await db().doc('game/final').set({ standings: [], endedAt: ts(T0) });
}

describe('resetGame', () => {
  it('wipes every game collection (with subcollections) but keeps templates, settings and admins', async () => {
    await fullGame();
    await resetGame(db(), ctx('gm'), { confirm: 'RESET' });

    for (const c of WIPED) expect(await allDocs(db(), c), c).toHaveLength(0);
    expect((await db().collectionGroup('quests').get()).size).toBe(0);
    expect((await db().collectionGroup('reactions').get()).size).toBe(0);
    expect((await db().collectionGroup('votes').get()).size).toBe(0);
    expect(await getData(db(), 'game/final')).toBeUndefined();

    expect(await allDocs(db(), 'questTemplates')).toHaveLength(7);
    // The route is set-up, like the templates: a new round keeps it.
    expect(await allDocs(db(), 'stops')).toHaveLength(1);
    // So are the periodic missions, with their counts back at 0.
    expect(await getData(db(), 'periodics/rc')).toMatchObject({ sent: 0, nextAt: null, status: 'running' });
    expect(await getData(db(), 'game/settings')).toEqual({ ...DEFAULT_SETTINGS, rerollLimit: 7 });
    expect(await getData(db(), 'admins/gm')).toBeDefined();
    expect(await getData(db(), 'game/state')).toEqual({
      status: 'lobby',
      startedAt: null,
      endedAt: null,
      nextGlobalQuestAt: null,
      announcement: null,
    });
  });

  it('requires the explicit confirmation and deletes nothing without it', async () => {
    await fullGame();
    await expectCode(resetGame(db(), ctx('gm'), {}), 'invalid-argument');
    await expectCode(resetGame(db(), ctx('gm'), { confirm: true }), 'invalid-argument');
    expect(await allDocs(db(), 'players')).toHaveLength(1);
    expect((await getData(db(), 'game/state'))?.status).toBe('ended');
  });

  it('refuses non-GMs', async () => {
    await fullGame();
    await expectCode(resetGame(db(), ctx('alice'), { confirm: 'RESET' }), 'permission-denied');
    await expectCode(resetGame(db(), ctx(null), { confirm: 'RESET' }), 'unauthenticated');
    expect(await allDocs(db(), 'players')).toHaveLength(1);
  });
});

describe('recountReactions (V17)', () => {
  async function post() {
    await seedGame(db());
    await db().doc('feed/f1').set({ type: 'approved', text: 'Alice completed a quest', uid: 'alice', ref: 's1', reactionCount: 0, createdAt: ts(T0) });
  }
  const react = (uid: string, emoji = '🔥') => db().doc(`feed/f1/reactions/${uid}`).set({ emoji, createdAt: ts(T0) });

  it('matches the number of reactions after they are added', async () => {
    await post();
    await react('bob');
    await react('carol', '😂');
    await react('dave', '👏');
    expect(await recountReactions(db(), 'f1')).toBe(3);
    expect((await getData(db(), 'feed/f1'))?.reactionCount).toBe(3);
  });

  it('a changed emoji is still one reaction', async () => {
    await post();
    await react('bob');
    await react('bob', '😍');
    expect(await recountReactions(db(), 'f1')).toBe(1);
  });

  it('matches after a reaction is removed, and never goes below zero', async () => {
    await post();
    await react('bob');
    await recountReactions(db(), 'f1');
    await db().doc('feed/f1/reactions/bob').delete();
    expect(await recountReactions(db(), 'f1')).toBe(0);
    expect((await getData(db(), 'feed/f1'))?.reactionCount).toBe(0);
  });

  it('is unaffected by a duplicate trigger delivery', async () => {
    await post();
    await react('bob');
    await recountReactions(db(), 'f1');
    await recountReactions(db(), 'f1');
    expect((await getData(db(), 'feed/f1'))?.reactionCount).toBe(1);
  });

  it('does nothing (and does not recreate the post) when the post is gone', async () => {
    await seedGame(db());
    await expect(recountReactions(db(), 'deleted')).resolves.toBe(0);
    expect(await getData(db(), 'feed/deleted')).toBeUndefined();
  });
});
