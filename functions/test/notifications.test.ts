// Minimal notifications (plan "Mystery pack: minimal notifications, Bob's story arc, and the facts behind Case
// closed", edge cases 1–9 and 26): a pack can list the only pushes it sends (`pushKinds`). The mystery pack keeps a
// new group or story mission, a story announcement, voting opening, witness requests (new or changed) and gaining a
// standing, plus the GM's join requests, entries to check and switchboard alerts. Packs without the list are untouched.
import { describe, expect, it } from 'vitest';
import { handleJoinRequestCreated, requestJoin } from '../src/game/join.js';
import { setPlayerLeft } from '../src/game/left.js';
import { handleFeedCreated, pushAllowed, pushFor, pushTokenId, type PushMessage, type PushSender } from '../src/game/push.js';
import { handlePlayerWritten } from '../src/game/standing.js';
import { handleSubmissionCreated, handleSubmissionWritten } from '../src/game/submissions.js';
import { checkEntry } from '../src/game/votes.js';
import { defaultSettingsFor, getPack } from '../src/shared/packs/index.js';
import type { GamePack, PushKind } from '../src/shared/packs/types.js';
import type { FeedItem, FeedType, Settings } from '../src/shared/types.js';
import {
  constRng,
  ctx,
  feedOf,
  getData,
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
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-notifications');

const mystery = (): GamePack => getPack('mystery');

const ALL_KINDS: PushKind[] = [
  'global-open', 'checkin-open', 'checking', 'voting-open', 'global-won', 'global-scored', 'standing-gained',
  'standing-lost', 'police-call', 'police-tip', 'police-line', 'announcement', 'stop-revealed', 'status', 'approved',
  'rejected', 'fraud', 'exposed', 'framed', 'adjust', 'story-beat', 'witness', 'witness-left', 'entry-rejected', 'join',
];

/** What the user asked for, plus the GM's three, plus the game's status (the start time moving, the case opening). */
const MYSTERY_KINDS: PushKind[] = ['global-open', 'story-beat', 'voting-open', 'witness', 'standing-gained', 'join', 'checking', 'police-line', 'status'];

function post(type: FeedType, extra: Partial<FeedItem> = {}): FeedItem {
  return { type, text: `text of ${type}`, uid: 'alice', ref: 'r1', createdAt: ts(T0), questTitle: 'Hats only!', ...extra };
}

/** A fake FCM that records what it was asked to send. */
function fakeSender() {
  const sent: Array<{ token: string; message: PushMessage }> = [];
  let calls = 0;
  const sender: PushSender = {
    async send(batch) {
      calls++;
      sent.push(...batch);
      return batch.map(() => ({ ok: true }));
    },
  };
  return { sender, sent, calls: () => calls };
}

async function seedToken(uid: string, token: string) {
  await db().doc(`pushTokens/${pushTokenId(token)}`).set({ uid, token, createdAt: ts(T0), updatedAt: ts(T0) });
}

describe('pushAllowed and the mystery list (edge cases 1, 26)', () => {
  it.each(['lancaster', 'starter'])('%s lists nothing, so it sends every kind, as before', (id) => {
    const pack = getPack(id);
    expect(pack.pushKinds).toBeUndefined();
    for (const kind of ALL_KINDS) expect(pushAllowed(pack, kind), kind).toBe(true);
  });

  it('a pack that lists its kinds sends only those', () => {
    const pack = testPack({ pushKinds: ['global-open', 'witness'] });
    expect(pushAllowed(pack, 'global-open')).toBe(true);
    expect(pushAllowed(pack, 'witness')).toBe(true);
    expect(pushAllowed(pack, 'voting-open')).toBe(false);
    expect(pushAllowed(pack, 'status')).toBe(false);
  });

  it('an empty list sends nothing', () => {
    const pack = testPack({ pushKinds: [] });
    for (const kind of ALL_KINDS) expect(pushAllowed(pack, kind), kind).toBe(false);
  });

  it('the mystery pack sends exactly the agreed kinds', () => {
    expect(new Set(mystery().pushKinds)).toEqual(new Set(MYSTERY_KINDS));
    for (const kind of ALL_KINDS) expect(pushAllowed(mystery(), kind), kind).toBe(MYSTERY_KINDS.includes(kind));
  });
});

describe('feed posts under a pack without a list (edge case 1)', () => {
  it.each(['checkin-open', 'global-won', 'announcement', 'stop-revealed', 'status'] as const)('%s still goes to every player', (type) => {
    expect(pushFor(post(type), null, lancaster())?.to).toBe('players');
  });

  it.each(['rejected', 'fraud', 'exposed', 'framed', 'adjust'] as const)('%s still goes to the player it is about', (type) => {
    expect(pushFor(post(type), 'personal', lancaster())?.to).toEqual(['alice']);
  });

  it('a standing post still pushes whether it was gained, lost, or is an older post with no standing on it', () => {
    for (const standing of ['confidant', 'poi', null, undefined] as const) {
      const plan = pushFor(post('standing', standing === undefined ? {} : { standing }), null, lancaster());
      expect(plan?.to, String(standing)).toEqual(['alice']);
    }
  });
});

describe('the mystery pack: what still buzzes (edge cases 2, 4)', () => {
  it('a status post (the start time moving, the case opening) goes to every player, titled with the game and opening Home (countdown plan edge case 14)', () => {
    const plan = pushFor(post('status', { text: 'Start moved to 19:30, Sat 7 Nov.', uid: null }), null, mystery());
    expect(plan).toEqual({ to: 'players', message: { title: mystery().name, body: 'Start moved to 19:30, Sat 7 Nov.', link: '#/' } });
  });

  it('a pack whose list leaves status out stays quiet about it (countdown plan edge case 14)', () => {
    expect(pushFor(post('status'), null, testPack({ pushKinds: ['global-open'] }))).toBeNull();
  });

  it('a new group or story mission goes to every player, by name', () => {
    const plan = pushFor(post('global-open'), null, mystery());
    expect(plan?.to).toBe('players');
    expect(`${plan?.message.title} ${plan?.message.body}`).toContain('Hats only!');
  });

  it('a story announcement goes to every player with what it says', () => {
    const plan = pushFor(post('story-beat', { text: 'New evidence shows Bob was killed at 11:02 pm.' }), null, mystery());
    expect(plan?.to).toBe('players');
    expect(plan?.message.body).toContain('11:02 pm');
    expect(plan?.message.link).toBe('#/');
  });

  it('voting opening goes to every player', () => {
    expect(pushFor(post('voting-open'), null, mystery())?.to).toBe('players');
  });

  it("the GM's entries to check and switchboard alerts still reach the GMs", () => {
    expect(pushFor(post('checking'), null, mystery())?.to).toBe('gms');
    expect(pushFor(post('police-line', { uid: null }), null, mystery())?.to).toBe('gms');
  });

  it("the GM's join requests still arrive, and a pack that leaves 'join' out sends none", async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await requestJoin(db(), ctx('newbie'), { displayName: 'Newbie' });
    expect((await handleJoinRequestCreated(db(), 'newbie', mystery()))?.to).toBe('gms');
    expect(await handleJoinRequestCreated(db(), 'newbie', testPack({ pushKinds: ['global-open'] }))).toBeNull();
  });
});

describe('the mystery pack: what goes quiet (edge case 3)', () => {
  it.each([
    'checkin-open', 'global-won', 'global-scored', 'approved', 'rejected', 'fraud', 'exposed', 'framed', 'adjust',
    'police-call', 'police-tip', 'announcement', 'stop-revealed',
  ] as const)('%s sends nothing', (type) => {
    expect(pushFor(post(type, { actorUid: 'bob' }), 'personal', mystery())).toBeNull();
  });

  it("an entry thrown out at the GM's check tells nobody (the same check under Lancaster still tells its owner)", async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await seedGlobalQuest(db(), 'gq', { status: 'checking' });
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'gq', witnessUid: null, status: 'sealed' });
    await seedSubmission(db(), 'e2', { uid: 'alice', kind: 'global', questId: 'gq', witnessUid: null, status: 'sealed' });
    const quiet = await checkEntry(db(), ctx('gm', T0, constRng(0), undefined, mystery()), { submissionId: 'e1', accept: false });
    expect(quiet.push).toBeNull();
    const loud = await checkEntry(db(), ctx('gm', T0, constRng(0), undefined, lancaster()), { submissionId: 'e2', accept: false });
    expect(loud.push?.to).toEqual(['alice']);
  });

  it('a witness leaving asks nobody to pick another (Lancaster still asks)', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    const templates = await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { quests: hand(templates.slice(0, 5)) });
    await seedPlayer(db(), 'carol', { quests: hand(templates.slice(5, 10)) });
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'carol' });
    const quiet = await setPlayerLeft(db(), ctx('gm', T0, constRng(0), undefined, mystery()), { uid: 'carol', left: 'frozen' });
    expect(quiet.push).toBeNull();
    await setPlayerLeft(db(), ctx('gm', T0, constRng(0), undefined, mystery()), { uid: 'carol', left: null });
    const loud = await setPlayerLeft(db(), ctx('gm', T0, constRng(0), undefined, lancaster()), { uid: 'carol', left: 'frozen' });
    expect(loud.push?.to).toEqual(['alice']);
  });
});

describe('standings (edge cases 5, 6)', () => {
  it('becoming a trusted confidant or a person of interest pushes to that player only, saying which', () => {
    const confidant = pushFor(post('standing', { standing: 'confidant' }), null, mystery());
    expect(confidant?.to).toEqual(['alice']);
    expect(`${confidant?.message.title} ${confidant?.message.body}`).toMatch(/trusted confidant/i);
    const poi = pushFor(post('standing', { standing: 'poi' }), null, mystery());
    expect(poi?.to).toEqual(['alice']);
    expect(`${poi?.message.title} ${poi?.message.body}`).toMatch(/person of interest/i);
  });

  it('losing a standing, or an older post with none on it, sends nothing', () => {
    expect(pushFor(post('standing', { standing: null }), null, mystery())).toBeNull();
    expect(pushFor(post('standing'), null, mystery())).toBeNull();
  });

  /** The mystery pack's own lines (±10, police check-ins on), no quiet hours. */
  async function standingsGame() {
    const settings: Settings = { ...defaultSettingsFor(mystery()), quietHours: null };
    await seedGame(db(), { settings });
    await seedAdmin(db(), 'gm');
    for (const uid of ['alice', 'bob']) await seedPlayer(db(), uid);
  }
  const sync = (uid: string) => handlePlayerWritten(db(), uid, T0, constRng(0), mystery());
  const plansFor = async (posts: FeedItem[]) => posts.map((p) => pushFor(p, null, mystery())).filter(Boolean);

  it('the trigger records the new standing on its post; a jump from one to the other posts and pushes once', async () => {
    await standingsGame();
    await db().doc('players/alice').update({ points: 15 });
    await sync('alice');
    const first = await feedOf(db(), 'standing');
    expect(first.map((p) => p.standing)).toEqual(['confidant']);
    await db().doc('players/alice').update({ points: -15 });
    await sync('alice');
    const second = await feedOf(db(), 'standing');
    expect(second.map((p) => p.standing)).toEqual(['confidant', 'poi']);
    expect(await plansFor(second as unknown as FeedItem[])).toHaveLength(2);
    await db().doc('players/alice').update({ points: 0 });
    await sync('alice');
    const third = await feedOf(db(), 'standing');
    expect(third.map((p) => p.standing)).toEqual(['confidant', 'poi', null]);
    expect(await plansFor(third as unknown as FeedItem[])).toHaveLength(2);
  });

  it('the trigger running again on its own write posts nothing more, so nothing more is pushed', async () => {
    await standingsGame();
    await db().doc('players/alice').update({ points: 15 });
    await sync('alice');
    await sync('alice');
    await sync('alice');
    expect(await feedOf(db(), 'standing')).toHaveLength(1);
  });

  it("a new person of interest with police on hears only about the standing, not the watch call it opens", async () => {
    await standingsGame();
    await db().doc('players/alice').update({ points: -15 });
    await sync('alice');
    expect(await feedOf(db(), 'police-call')).toHaveLength(1);
    const all = [...(await feedOf(db(), 'standing')), ...(await feedOf(db(), 'police-call'))] as unknown as FeedItem[];
    const plans = await plansFor(all);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.to).toEqual(['alice']);
    expect(`${plans[0]?.message.title} ${plans[0]?.message.body}`).toMatch(/person of interest/i);
  });
});

describe('witness requests (edge cases 7, 8)', () => {
  async function claimGame() {
    await seedGame(db());
    const templates = await seedPersonalTemplates(db(), 20);
    await seedPlayer(db(), 'alice', { displayName: 'Alice', quests: hand(templates.slice(0, 5)) });
    await seedPlayer(db(), 'bob', { displayName: 'Bob' });
    await seedPlayer(db(), 'carol', { displayName: 'Carol' });
  }
  const created = (id: string, pack: GamePack = mystery()) => handleSubmissionCreated(db(), id, T0, constRng(0), pack);
  const written = (id: string, pack: GamePack = mystery()) => handleSubmissionWritten(db(), id, T0, constRng(0), pack);
  const sub = async (id: string) => (await getData(db(), `submissions/${id}`))!;

  it('a new claim tells its witness once, and remembers who was told', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    expect((await created('s1'))?.to).toEqual(['bob']);
    expect((await sub('s1')).witnessNotifiedUid).toBe('bob');
    expect(await created('s1')).toBeNull();
  });

  it('on creation both triggers fire: the write trigger before or after the create trigger never tells anyone again', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    expect(await written('s1')).toBeNull(); // not processed yet: the create trigger tells the witness
    expect((await created('s1'))?.to).toEqual(['bob']);
    expect(await written('s1')).toBeNull(); // fired by the create trigger's own write
  });

  it('asking someone else tells the new witness only, once', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    await created('s1');
    await db().doc('submissions/s1').update({ witnessUid: 'carol' });
    const plan = await written('s1');
    expect(plan?.to).toEqual(['carol']);
    expect(`${plan?.message.title} ${plan?.message.body}`).toContain('Alice');
    expect((await sub('s1')).witnessNotifiedUid).toBe('carol');
    expect(await written('s1')).toBeNull(); // its own write
  });

  it('another change to the claim, with the same witness, tells nobody', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    await created('s1');
    await db().doc('submissions/s1').update({ caption: 'a new caption' });
    expect(await written('s1')).toBeNull();
  });

  it('a claim that is no longer pending tells nobody, even if its witness changed', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    await created('s1');
    await db().doc('submissions/s1').update({ status: 'approved', witnessUid: 'carol' });
    expect(await written('s1')).toBeNull();
  });

  it('a claim from before (processed, nobody recorded as told) is not re-announced; who was told is filled in', async () => {
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob', extra: { processedAt: ts(T0) } });
    expect(await written('s1')).toBeNull();
    expect((await sub('s1')).witnessNotifiedUid).toBe('bob');
  });

  it('a side-quest entry (no witness) is never a witness request', async () => {
    await claimGame();
    await seedSubmission(db(), 'e1', { uid: 'alice', kind: 'global', questId: 'gq', witnessUid: null, status: 'sealed', extra: { processedAt: ts(T0) } });
    expect(await written('e1')).toBeNull();
  });

  it("a pack that leaves 'witness' out tells nobody, new or changed", async () => {
    const quiet = testPack({ pushKinds: ['global-open'] });
    await claimGame();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    expect(await created('s1', quiet)).toBeNull();
    await db().doc('submissions/s1').update({ witnessUid: 'carol' });
    expect(await written('s1', quiet)).toBeNull();
  });
});

describe('a push that is not allowed never goes out (edge case 9)', () => {
  it('handleFeedCreated reads no tokens and calls no sender for a quiet kind; an allowed one still sends', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedToken('alice', 'tok-a');
    await db().doc('feed/quiet').set(post('framed', { text: 'Someone framed Alice' }));
    await db().doc('feed/loud').set(post('global-open'));
    const { sender, calls } = fakeSender();
    expect(await handleFeedCreated(db(), sender, 'quiet', mystery())).toEqual({ sent: 0, pruned: 0 });
    expect(calls()).toBe(0);
    expect(await handleFeedCreated(db(), sender, 'loud', mystery())).toEqual({ sent: 1, pruned: 0 });
    expect(calls()).toBe(1);
  });
});
