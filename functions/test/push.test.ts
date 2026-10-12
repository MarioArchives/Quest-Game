// Push notifications, plan edge cases P1–P13 (P10 is in tests/rules, P11 in src/lib/push.test.ts):
// who hears about each event, device tokens, sending and pruning. FCM is never called; tests inject a
// fake PushSender.
import { describe, expect, it } from 'vitest';
import { handleJoinRequestCreated, requestJoin } from '../src/game/join.js';
import {
  DEAD_TOKEN_CODES,
  handleFeedCreated,
  makeSender,
  PUSH_TOKEN_MAX,
  pushFor,
  pushTokenId,
  removePushToken,
  savePushToken,
  sendPush,
  type PushMessage,
  type PushPlan,
  type PushSender,
} from '../src/game/push.js';
import { handleSubmissionCreated } from '../src/game/submissions.js';
import type { FeedItem, FeedType } from '../src/shared/types.js';
import {
  addMin,
  allDocs,
  ctx,
  expectCode,
  getData,
  hand,
  seedAdmin,
  seedGame,
  seedPersonalTemplates,
  seedPlayer,
  seedSubmission,
  T0,
  ts,
  useEmulatorDb,
} from './helpers.js';

const db = useEmulatorDb('demo-fq-push');

/** A fake FCM: records every message and answers ok, unless a token is given an error code. */
function fakeSender(errors: Record<string, string> = {}) {
  const sent: Array<{ token: string; message: PushMessage }> = [];
  const sender: PushSender = {
    async send(batch) {
      sent.push(...batch);
      return batch.map(({ token }) => (errors[token] ? { ok: false, code: errors[token] } : { ok: true }));
    },
  };
  return { sender, sent, tokens: () => sent.map((s) => s.token).sort() };
}

async function seedToken(uid: string, token: string) {
  await db().doc(`pushTokens/${pushTokenId(token)}`).set({ uid, token, createdAt: ts(T0), updatedAt: ts(T0) });
}

async function tokensLeft(): Promise<string[]> {
  return (await allDocs(db(), 'pushTokens')).map((d) => d.token as string).sort();
}

function post(type: FeedType, extra: Partial<FeedItem> = {}): FeedItem {
  return { type, text: `text of ${type}`, uid: null, ref: null, createdAt: ts(T0), ...extra };
}

const msg: PushMessage = { title: 'Title', body: 'Body', link: '#/' };
const said = (plan: PushPlan | null) => `${plan?.message.title ?? ''} ${plan?.message.body ?? ''}`;

describe('P1. who hears about each feed post', () => {
  it.each(['global-open', 'voting-open', 'global-won', 'announcement', 'status'] as const)('%s goes to every player', (type) => {
    const plan = pushFor(post(type, { uid: type === 'global-won' ? 'alice' : null, questTitle: 'Hats only!' }));
    expect(plan?.to).toBe('players');
    expect(plan?.message.title).toBeTruthy();
    expect(plan?.message.body).toBeTruthy();
  });

  it.each(['global-open', 'voting-open'] as const)('%s names the side quest', (type) => {
    expect(said(pushFor(post(type, { questTitle: 'Hats only!' })))).toContain('Hats only!');
  });

  it('an announcement says what the GM wrote', () => {
    expect(said(pushFor(post('announcement', { text: 'Last orders at the Dukes!' })))).toContain('Last orders at the Dukes!');
  });

  it.each(['approved', 'rejected', 'fraud', 'adjust'] as const)('%s goes only to the player it is about', (type) => {
    const plan = pushFor(post(type, { uid: 'alice', actorUid: 'bob', points: 100 }), 'personal');
    expect(plan?.to).toEqual(['alice']);
    expect(said(plan)).toContain(`text of ${type}`);
  });

  it('an exposure goes to the target, not the guesser', () => {
    const plan = pushFor(post('exposed', { uid: 'bob', actorUid: 'alice' }));
    expect(plan?.to).toEqual(['bob']);
    expect(plan?.exclude).toBe('alice');
  });

  it('a frame goes only to the player framed, with nobody excluded and no framer named (mystery plan)', () => {
    const plan = pushFor(post('framed', { uid: 'bob', text: 'Someone framed Bob', points: -50 }));
    expect(plan?.to).toEqual(['bob']);
    expect(plan?.exclude ?? null).toBeNull();
    expect(plan?.message.title).toBe('You were framed');
    expect(plan?.message.link).toBe('#/account');
    expect(said(plan)).toContain('Someone framed Bob');
  });

  it('a join post, or a player leaving, sends nothing', () => {
    expect(pushFor(post('join', { uid: 'alice' }))).toBeNull();
    expect(pushFor(post('left', { uid: 'alice', actorUid: 'gm' }))).toBeNull();
  });

  it('entries closing for a check goes to the GMs only, naming the side quest, never the GM who closed them', () => {
    const plan = pushFor(post('checking', { questTitle: 'Hats only!', actorUid: 'gm' }));
    expect(plan?.to).toBe('gms');
    expect(plan?.exclude).toBe('gm');
    expect(said(plan)).toContain('Hats only!');
    expect(pushFor(post('checking', { questTitle: 'Hats only!' }))?.exclude ?? null).toBeNull();
  });
});

describe('P2. side-quest entries', () => {
  it('an "entered the side quest" post sends nothing; a personal approval does', () => {
    expect(pushFor(post('approved', { uid: 'alice', submissionId: 's1', points: null }), 'global')).toBeNull();
    expect(pushFor(post('approved', { uid: 'alice', submissionId: 's2', points: 100 }), 'personal')?.to).toEqual(['alice']);
  });

  async function setup() {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    await seedToken('alice', 'tok-a');
    await seedToken('bob', 'tok-b');
  }

  it('handleFeedCreated looks the submission up, so an entry post reaches nobody', async () => {
    await setup();
    await seedSubmission(db(), 'entry1', { uid: 'alice', kind: 'global', questId: 'gq1', witnessUid: null, status: 'sealed' });
    await db().doc('feed/f1').set(post('approved', { uid: 'alice', submissionId: 'entry1', points: null }));
    const { sender, sent } = fakeSender();
    expect(await handleFeedCreated(db(), sender, 'f1')).toEqual({ sent: 0, pruned: 0 });
    expect(sent).toEqual([]);
  });

  it('handleFeedCreated sends a personal approval to the claimant only', async () => {
    await setup();
    await seedSubmission(db(), 'claim1', { uid: 'alice', questId: 'q1', witnessUid: 'bob', status: 'approved' });
    await db().doc('feed/f2').set(post('approved', { uid: 'alice', actorUid: 'bob', submissionId: 'claim1', points: 100 }));
    const { sender, tokens } = fakeSender();
    expect(await handleFeedCreated(db(), sender, 'f2')).toEqual({ sent: 1, pruned: 0 });
    expect(tokens()).toEqual(['tok-a']);
  });

  it('a feed post that no longer exists sends nothing', async () => {
    await setup();
    const { sender, sent } = fakeSender();
    expect(await handleFeedCreated(db(), sender, 'gone')).toEqual({ sent: 0, pruned: 0 });
    expect(sent).toEqual([]);
  });
});

describe('P3. whoever caused it is left out', () => {
  it('pushFor excludes the actor', () => {
    expect(pushFor(post('adjust', { uid: 'gm', actorUid: 'gm' }))?.exclude).toBe('gm');
  });

  it('a GM adjusting their own points gets no push', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'gm');
    await seedToken('gm', 'tok-gm');
    const { sender, sent } = fakeSender();
    expect(await sendPush(db(), sender, pushFor(post('adjust', { uid: 'gm', actorUid: 'gm' }))!)).toEqual({ sent: 0, pruned: 0 });
    expect(sent).toEqual([]);
  });

  it('a broadcast skips only the excluded player', async () => {
    await seedGame(db());
    for (const uid of ['alice', 'bob', 'carol']) {
      await seedPlayer(db(), uid);
      await seedToken(uid, `tok-${uid}`);
    }
    const { sender, tokens } = fakeSender();
    expect(await sendPush(db(), sender, { to: 'players', exclude: 'bob', message: msg })).toEqual({ sent: 2, pruned: 0 });
    expect(tokens()).toEqual(['tok-alice', 'tok-carol']);
  });
});

describe('P4. witness requests', () => {
  async function setup() {
    await seedGame(db());
    await seedPersonalTemplates(db(), 10);
    await seedPlayer(db(), 'alice', { displayName: 'Alice', quests: hand(['p01', 'p02', 'p03', 'p04', 'p05']) });
    await seedPlayer(db(), 'bob', { displayName: 'Bob' });
  }

  it('a valid claim tells only the named witness, by name, without the secret quest', async () => {
    await setup();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    const plan = await handleSubmissionCreated(db(), 's1', T0);
    expect(plan?.to).toEqual(['bob']);
    expect(said(plan)).toContain('Alice');
    expect(said(plan)).not.toContain('Personal quest p01');
    expect(said(plan)).not.toContain('Do the thing p01');
    expect(plan?.message.link).toBe('#/account');
  });

  it('nothing is sent when the trigger runs again', async () => {
    await setup();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid: 'bob' });
    expect(await handleSubmissionCreated(db(), 's1', T0)).not.toBeNull();
    expect(await handleSubmissionCreated(db(), 's1', T0)).toBeNull();
  });

  it.each([
    ['a witness who is not playing', 'ghost'],
    ['the claimant as their own witness', 'alice'],
  ])('a claim naming %s tells nobody', async (_label, witnessUid) => {
    await setup();
    await seedSubmission(db(), 's1', { uid: 'alice', questId: 'q1', witnessUid });
    expect(await handleSubmissionCreated(db(), 's1', T0)).toBeNull();
    expect((await getData(db(), 'submissions/s1'))?.status).toBe('rejected');
  });
});

describe('P5. join requests', () => {
  async function setup() {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
  }

  it('a new request tells the GMs, linking to the GM console', async () => {
    await setup();
    await requestJoin(db(), ctx('newbie'), { displayName: 'Newbie' });
    const plan = await handleJoinRequestCreated(db(), 'newbie');
    expect(plan?.to).toBe('gms');
    expect(said(plan)).toContain('Newbie');
    expect(plan?.message.link).toBe('#/gm');
  });

  it("a GM's own request (approved at once) tells nobody", async () => {
    await setup();
    await seedAdmin(db(), 'gm');
    expect(await requestJoin(db(), ctx('gm'), { displayName: 'GM' })).toEqual({ status: 'approved' });
    expect(await handleJoinRequestCreated(db(), 'gm')).toBeNull();
  });

  it('a request that no longer exists tells nobody', async () => {
    await setup();
    expect(await handleJoinRequestCreated(db(), 'nobody')).toBeNull();
  });

  it('asking again keeps the original request doc (an update, which the onCreate trigger ignores)', async () => {
    await setup();
    await requestJoin(db(), ctx('newbie', T0), { displayName: 'Newbie' });
    await requestJoin(db(), ctx('newbie', addMin(T0, 5)), { displayName: 'Newbie Again' });
    const req = await getData(db(), 'joinRequests/newbie');
    expect(req?.createdAt.toMillis()).toBe(T0.getTime());
  });

  it('every GM device gets it, and players who are not GMs do not', async () => {
    await setup();
    await seedAdmin(db(), 'gm');
    await seedAdmin(db(), 'gm2');
    await seedPlayer(db(), 'alice');
    await seedToken('gm', 'tok-gm');
    await seedToken('gm2', 'tok-gm2');
    await seedToken('alice', 'tok-alice');
    const { sender, tokens } = fakeSender();
    expect(await sendPush(db(), sender, { to: 'gms', message: msg })).toEqual({ sent: 2, pruned: 0 });
    expect(tokens()).toEqual(['tok-gm', 'tok-gm2']);
  });
});

describe('P6. devices', () => {
  it('a player with no devices: nothing is sent and nothing fails', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    const { sender, sent } = fakeSender();
    expect(await sendPush(db(), sender, { to: ['alice'], message: msg })).toEqual({ sent: 0, pruned: 0 });
    expect(sent).toEqual([]);
  });

  it('every device of a player gets it, with the same message', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedToken('alice', 'tok-phone');
    await seedToken('alice', 'tok-tablet');
    const { sender, sent, tokens } = fakeSender();
    expect(await sendPush(db(), sender, { to: ['alice'], message: msg })).toEqual({ sent: 2, pruned: 0 });
    expect(tokens()).toEqual(['tok-phone', 'tok-tablet']);
    expect(sent.map((s) => s.message)).toEqual([msg, msg]);
  });

  it('a broadcast to players skips a GM who is not playing', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await seedToken('gm', 'tok-gm');
    await seedToken('alice', 'tok-alice');
    const { sender, tokens } = fakeSender();
    await sendPush(db(), sender, { to: 'players', message: msg });
    expect(tokens()).toEqual(['tok-alice']);
  });
});

describe('P7. dead tokens', () => {
  it('knows both FCM codes for a dead token', () => {
    expect(DEAD_TOKEN_CODES).toEqual(
      expect.arrayContaining(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']),
    );
  });

  it.each(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])(
    'a token FCM answers with %s is deleted; other failures keep theirs',
    async (code) => {
      await seedGame(db());
      await seedPlayer(db(), 'alice');
      for (const t of ['tok-dead', 'tok-flaky', 'tok-ok']) await seedToken('alice', t);
      const { sender } = fakeSender({ 'tok-dead': code, 'tok-flaky': 'messaging/internal-error' });
      expect(await sendPush(db(), sender, { to: ['alice'], message: msg })).toEqual({ sent: 1, pruned: 1 });
      expect(await tokensLeft()).toEqual(['tok-flaky', 'tok-ok']);
    },
  );

  it('a sender that throws never breaks the caller, and keeps the tokens', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedToken('alice', 'tok-a');
    const broken: PushSender = {
      send: async () => {
        throw new Error('FCM is down');
      },
    };
    await expect(sendPush(db(), broken, { to: ['alice'], message: msg })).resolves.toEqual({ sent: 0, pruned: 0 });
    expect(await tokensLeft()).toEqual(['tok-a']);
  });
});

describe('P8. saving a device', () => {
  it('a player saves their device token', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await expect(savePushToken(db(), ctx('alice'), { token: 'tok-a' })).resolves.toEqual({ ok: true });
    expect(await getData(db(), `pushTokens/${pushTokenId('tok-a')}`)).toMatchObject({ uid: 'alice', token: 'tok-a' });
  });

  it('a GM who is not playing can save one too', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await savePushToken(db(), ctx('gm'), { token: 'tok-gm' });
    expect(await getData(db(), `pushTokens/${pushTokenId('tok-gm')}`)).toMatchObject({ uid: 'gm' });
  });

  it('someone waiting to join, or signed out, is refused', async () => {
    await seedGame(db());
    await seedPersonalTemplates(db(), 20);
    await requestJoin(db(), ctx('pending'), { displayName: 'Pen' });
    await expectCode(savePushToken(db(), ctx('pending'), { token: 'tok-p' }), 'permission-denied');
    await expectCode(savePushToken(db(), ctx(null), { token: 'tok-x' }), 'unauthenticated');
    expect(await tokensLeft()).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(4097)],
    ['not a string', 42],
    ['missing', undefined],
  ])('refuses a token that is %s', async (_label, token) => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await expectCode(savePushToken(db(), ctx('alice'), { token }), 'invalid-argument');
  });

  it('accepts a token of exactly 4096 characters', async () => {
    expect(PUSH_TOKEN_MAX).toBe(4096);
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await savePushToken(db(), ctx('alice'), { token: 'x'.repeat(4096) });
    expect(await tokensLeft()).toHaveLength(1);
  });

  it('saving the same token again keeps one doc, and its first-seen time', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await savePushToken(db(), ctx('alice', T0), { token: 'tok-a' });
    await savePushToken(db(), ctx('alice', addMin(T0, 60)), { token: 'tok-a' });
    expect(await tokensLeft()).toEqual(['tok-a']);
    const saved = await getData(db(), `pushTokens/${pushTokenId('tok-a')}`);
    expect(saved?.createdAt.toMillis()).toBe(T0.getTime());
    expect(saved?.updatedAt.toMillis()).toBe(addMin(T0, 60).getTime());
  });

  it('the same token saved by another player (a shared phone) moves to them', async () => {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    await savePushToken(db(), ctx('alice'), { token: 'tok-shared' });
    await savePushToken(db(), ctx('bob'), { token: 'tok-shared' });
    const docs = await allDocs(db(), 'pushTokens');
    expect(docs.map((d) => d.uid)).toEqual(['bob']);
  });

  it('token ids are stable, distinct and safe as a document id', () => {
    expect(pushTokenId('a/b:c')).toBe(pushTokenId('a/b:c'));
    expect(pushTokenId('a/b:c')).toMatch(/^[0-9a-f]{64}$/);
    expect(pushTokenId('tok-1')).not.toBe(pushTokenId('tok-2'));
  });
});

describe('P9. removing a device', () => {
  async function setup() {
    await seedGame(db());
    await seedPlayer(db(), 'alice');
    await seedPlayer(db(), 'bob');
    await seedToken('alice', 'tok-a');
  }

  it("removes the caller's own token", async () => {
    await setup();
    await expect(removePushToken(db(), ctx('alice'), { token: 'tok-a' })).resolves.toEqual({ ok: true });
    expect(await tokensLeft()).toEqual([]);
  });

  it("leaves someone else's token alone", async () => {
    await setup();
    await expect(removePushToken(db(), ctx('bob'), { token: 'tok-a' })).resolves.toEqual({ ok: true });
    expect(await tokensLeft()).toEqual(['tok-a']);
  });

  it('an unknown token is a no-op', async () => {
    await setup();
    await expect(removePushToken(db(), ctx('alice'), { token: 'never-saved' })).resolves.toEqual({ ok: true });
    expect(await tokensLeft()).toEqual(['tok-a']);
  });

  it('signed-out callers are refused', async () => {
    await setup();
    await expectCode(removePushToken(db(), ctx(null), { token: 'tok-a' }), 'unauthenticated');
  });
});

describe('P12. tap-through links', () => {
  it.each([
    ['global-open', '#/'],
    ['voting-open', '#/'],
    ['global-won', '#/'],
    ['announcement', '#/'],
    ['status', '#/'],
    ['approved', '#/account'],
    ['rejected', '#/account'],
    ['fraud', '#/account'],
    ['exposed', '#/account'],
    ['adjust', '#/account'],
    ['checking', '#/gm'],
  ] as const)('%s opens %s', (type, link) => {
    const plan = pushFor(post(type, { uid: 'alice', actorUid: 'bob', questTitle: 'Hats only!', points: 100 }), 'personal');
    expect(plan?.message.link).toBe(link);
  });

  // The service worker resolves links against its scope, so hash routes keep the GitHub Pages base path.
  it('every link is a hash route, never an absolute path or URL', () => {
    for (const type of ['global-open', 'approved', 'exposed', 'adjust'] as const) {
      expect(pushFor(post(type, { uid: 'alice', actorUid: 'bob', questTitle: 'T' }), 'personal')?.message.link).toMatch(/^#\/[a-z]*$/);
    }
  });
});

describe('P13. the emulators never call FCM', () => {
  it('the emulator sender logs each push and reports success', async () => {
    const lines: string[] = [];
    const sender = makeSender({ emulator: true, log: (line) => lines.push(line) });
    const results = await sender.send([
      { token: 'tok-a', message: { title: 'New side quest', body: 'Hats only!', link: '#/' } },
      { token: 'tok-b', message: { title: 'New side quest', body: 'Hats only!', link: '#/' } },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(lines.join('\n')).toContain('Hats only!');
  });
});
