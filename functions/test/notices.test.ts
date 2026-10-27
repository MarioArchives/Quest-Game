// Case updates in the police chat (plan "Police that sound official, a question bank, …", edge cases 9 and 10): while
// the Telegram line takes notices, a push to a player with a Telegram line becomes a `notice` order for the police
// script instead; everyone else, GM-only pushes and every push while the line can't take them stay pushes.
// Runs on both stores.
import { describe, expect, it } from 'vitest';
import { deliverPush, noticeNumber, noticesOpen, noticeText } from '../src/game/notices.js';
import type { PushMessage, PushPlan, PushSender } from '../src/game/push.js';
import { LINE_OFFLINE_MS } from '../src/shared/phone.js';
import type { LineBeat, PhoneStatus, PlayerPhone } from '../src/shared/types.js';
import { addMin, allDocs, seedAdmin, seedGame, seedPlayer, T0, ts, useEmulatorDb } from './helpers.js';

const db = useEmulatorDb('demo-fq-notices');

const NUMBER: Record<string, string> = { alice: '+447700900001', bob: '+447700900002', carol: '+447700900003', gm: '+447700900009' };
const MESSAGE: PushMessage = { title: 'New group event', body: 'Hats only!', link: '#/' };

/** A fake FCM: records which tokens it was asked to reach; `fail` makes it throw. */
function fakeSender(fail = false): PushSender & { tokens: string[] } {
  const s = {
    tokens: [] as string[],
    async send(batch: Array<{ token: string; message: PushMessage }>) {
      if (fail) throw new Error('FCM down');
      s.tokens.push(...batch.map((b) => b.token));
      return batch.map(() => ({ ok: true }));
    },
  };
  return s;
}

const phone = (uid: string, status: PhoneStatus, sid: string | null): Record<string, unknown> => ({
  number: NUMBER[uid],
  status,
  verifiedAt: status === 'verified' ? ts(addMin(T0, -60)) : null,
  failures: 0,
  reason: null,
  callerId: null,
  test: sid ? { id: `t-${uid}`, code: '123', sid, status: 'completed', result: 'passed', errorCode: null, startedAt: ts(addMin(T0, -61)), heardAt: null } : null,
  updatedAt: ts(addMin(T0, -60)),
});

/**
 * Alice has a verified Telegram line; Bob's line was verified over Twilio (CA…); Carol has none; the GM plays too and
 * has a Telegram line. Each has a push token. The script's heartbeat is fresh and takes notices.
 */
async function setup(over: { notices?: boolean; beat?: Partial<LineBeat> | null } = {}) {
  await seedGame(db(), { settings: { policeNotices: over.notices ?? true } });
  for (const uid of ['alice', 'bob', 'carol', 'gm']) {
    await seedPlayer(db(), uid);
    await db().doc(`pushTokens/tok-${uid}`).set({ uid, token: `token-${uid}`, updatedAt: ts(T0) });
  }
  await seedAdmin(db(), 'gm');
  await db().doc('phones/alice').set(phone('alice', 'verified', 'TG-a1'));
  await db().doc('phones/bob').set(phone('bob', 'verified', 'CA123'));
  await db().doc('phones/gm').set(phone('gm', 'verified', 'TG-g1'));
  if (over.beat !== null) {
    await db().doc('game/line').set({ kind: 'telegram', seenAt: ts(T0), account: { name: 'Test Constabulary', id: 42 }, features: ['notices'], ...over.beat });
  }
}

const notices = async () => (await allDocs(db(), 'lineOrders')).filter((o) => o.kind === 'notice');
const toPlayers: PushPlan = { to: 'players', message: MESSAGE };

describe('noticeText, noticesOpen and noticeNumber', () => {
  it("a notice says what the push would have: 'title: body'", () => {
    expect(noticeText(MESSAGE)).toBe('New group event: Hats only!');
    expect(noticeText({ title: 'Voting is open', body: '', link: '#/' })).toBe('Voting is open');
  });

  it('the chat takes notices with the setting on and a fresh heartbeat that offers them', () => {
    const beat = { kind: 'telegram', seenAt: ts(T0), account: null, features: ['notices'] } as unknown as LineBeat;
    const now = T0.getTime();
    expect(noticesOpen({ policeNotices: true }, beat, now)).toBe(true);
    expect(noticesOpen({ policeNotices: false }, beat, now)).toBe(false);
    expect(noticesOpen({ policeNotices: true }, null, now)).toBe(false);
    expect(noticesOpen({ policeNotices: true }, { ...beat, features: [] }, now)).toBe(false);
    expect(noticesOpen({ policeNotices: true }, { ...beat, features: undefined }, now)).toBe(false);
    expect(noticesOpen({ policeNotices: true }, beat, now + LINE_OFFLINE_MS + 1)).toBe(false);
  });

  it('only a verified line tested over Telegram gets them', () => {
    const p = (status: PhoneStatus, sid: string | null) => phone('alice', status, sid) as unknown as PlayerPhone;
    expect(noticeNumber(p('verified', 'TG-a1'))).toBe(NUMBER.alice);
    expect(noticeNumber(p('verified', 'CA123'))).toBeNull();
    expect(noticeNumber(p('verified', null))).toBeNull();
    expect(noticeNumber(p('failed', 'TG-a1'))).toBeNull();
    expect(noticeNumber(p('paused', 'TG-a1'))).toBeNull();
    expect(noticeNumber(null)).toBeNull();
  });
});

describe('deliverPush', () => {
  it('players with a Telegram line get a case update instead of the push; the rest get the push', async () => {
    await setup();
    const sender = fakeSender();
    const out = await deliverPush(db(), sender, toPlayers, T0);
    expect(out.notices).toBe(2);
    expect(sender.tokens.sort()).toEqual(['token-bob', 'token-carol']);
    const orders = await notices();
    expect(orders.map((o) => o.to).sort()).toEqual([NUMBER.alice, NUMBER.gm].sort());
    for (const o of orders) expect(o).toMatchObject({ kind: 'notice', text: 'New group event: Hats only!', status: 'new' });
  });

  it('a push for the GMs only stays a push', async () => {
    await setup();
    const sender = fakeSender();
    const out = await deliverPush(db(), sender, { to: 'gms', message: MESSAGE }, T0);
    expect(out.notices).toBe(0);
    expect(sender.tokens).toEqual(['token-gm']);
    expect(await notices()).toEqual([]);
  });

  it('a push to named players works the same, and the actor it leaves out gets nothing', async () => {
    await setup();
    const sender = fakeSender();
    await deliverPush(db(), sender, { to: ['alice', 'carol'], message: MESSAGE }, T0);
    expect((await notices()).map((o) => o.to)).toEqual([NUMBER.alice]);
    expect(sender.tokens).toEqual(['token-carol']);
    await db().recursiveDelete(db().collection('lineOrders'));
    const s2 = fakeSender();
    await deliverPush(db(), s2, { ...toPlayers, exclude: 'alice' }, T0);
    expect((await notices()).map((o) => o.to)).toEqual([NUMBER.gm]);
    expect(s2.tokens).not.toContain('token-alice');
  });

  it.each([
    ['the setting is off', { notices: false }],
    ['the script is silent', { beat: null }],
    ['the heartbeat is stale', { beat: { seenAt: ts(addMin(T0, -5)) } }],
    ["the script doesn't offer notices", { beat: { features: [] } }],
  ])('everyone gets the push when %s', async (_label, over) => {
    await setup(over as never);
    const sender = fakeSender();
    const out = await deliverPush(db(), sender, toPlayers, T0);
    expect(out.notices).toBe(0);
    expect(sender.tokens.sort()).toEqual(['token-alice', 'token-bob', 'token-carol', 'token-gm']);
    expect(await notices()).toEqual([]);
  });

  it('never throws: a broken FCM still leaves the case updates queued', async () => {
    await setup();
    const out = await deliverPush(db(), fakeSender(true), toPlayers, T0);
    expect(out.notices).toBe(2);
    expect(await notices()).toHaveLength(2);
  });

  it('a player who has left hears nothing', async () => {
    await setup();
    await db().doc('players/alice').update({ left: 'out' });
    await deliverPush(db(), fakeSender(), toPlayers, T0);
    expect((await notices()).map((o) => o.to)).toEqual([NUMBER.gm]);
  });
});
