// The log book's top entry pays its player (plan "+5 for the log book's top entry", edge cases 1–15): the points
// move with the top, only a player's own entries can hold it, and nothing moves outside play. Runs on both stores.
import { describe, expect, it } from 'vitest';
import { handleReactionWritten, recomputeTop } from '../src/game/reactions.js';
import { resetGame } from '../src/game/reset.js';
import { canHoldTop, TOP_FEED_TYPES, VOTABLE_FEED_TYPES } from '../src/shared/feedVotes.js';
import { defaultSettingsFor, getPack } from '../src/shared/packs/index.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { GameState, Settings } from '../src/shared/types.js';
import { addMin, ctx, getData, getPlayer, ledgerFor, seedAdmin, seedGame, seedPlayer, T0, ts, useEmulatorDb } from './helpers.js';

const db = useEmulatorDb('demo-fq-top-entry');
const mystery = getPack('mystery');
const at = (min: number) => addMin(T0, min);
const PLAYERS = ['alice', 'bob', 'carol', 'dave', 'erin'];

async function setup(opts: { status?: GameState['status']; settings?: Partial<Settings> } = {}) {
  await seedGame(db(), { status: opts.status ?? 'active', settings: { topEntryPoints: 5, ...opts.settings } as Partial<Settings> });
  for (const uid of PLAYERS) await seedPlayer(db(), uid, { points: 20 });
}

/** An entry by `uid` (an approved mission unless `type` says otherwise). */
async function entry(id: string, uid: string, extra: Record<string, unknown> = {}, minute = 0) {
  await db().doc(`feed/${id}`).set({ type: 'approved', text: id, uid, ref: null, reactionCount: 0, createdAt: ts(at(minute)), ...extra });
}

/** Writes a vote doc and runs the trigger as the server would. */
async function vote(id: string, voter: string, v: 1 | -1 | null, now = at(10)) {
  const ref = db().doc(`feed/${id}/reactions/${voter}`);
  if (v === null) await ref.delete();
  else await ref.set({ vote: v, createdAt: ts(now) });
  await handleReactionWritten(db(), id, now, mystery);
}

const points = async (uid: string) => (await getPlayer(db(), uid)).points as number;
const top = () => getData(db(), 'game/top');
const lines = async (uid: string, reason: string) => (await ledgerFor(db(), uid)).filter((l) => l.reason === reason);
/** Every top-entry and top-entry-lost line, summed: what is paid out right now. */
async function paidOut(): Promise<number> {
  let sum = 0;
  for (const uid of PLAYERS) for (const l of await ledgerFor(db(), uid)) if (l.reason === 'top-entry' || l.reason === 'top-entry-lost') sum += l.delta;
  return sum;
}

describe('who can hold the top (edge case 7)', () => {
  it('only a player’s own entries: a confirmed mission, a periodic answer, a winning group entry', () => {
    expect([...TOP_FEED_TYPES].sort()).toEqual(['approved', 'checkin-answer', 'global-won']);
    for (const type of TOP_FEED_TYPES) expect(canHoldTop({ type: type as never, uid: 'alice' }), type).toBe(true);
    for (const type of ['framed', 'exposed', 'police-tip'] as const) expect(canHoldTop({ type, uid: 'alice' }), type).toBe(false);
    expect(canHoldTop({ type: 'approved', uid: null })).toBe(false);
  });

  it('frames, exposures and tip-offs still take votes', () => {
    expect(VOTABLE_FEED_TYPES).toEqual(expect.arrayContaining(['framed', 'exposed', 'police-tip']));
  });

  it('a frame, an exposure or a tip-off with the best score is passed over for a player’s own entry', async () => {
    await setup();
    await entry('f', 'bob', { type: 'framed' });
    await entry('x', 'dave', { type: 'exposed' });
    await entry('t', 'erin', { type: 'police-tip' });
    await entry('a', 'alice');
    for (const id of ['f', 'x', 't']) for (const voter of ['carol', 'alice']) await vote(id, voter, 1);
    await vote('a', 'carol', 1);
    expect(await top()).toMatchObject({ feedId: 'a', award: { uid: 'alice', feedId: 'a', points: 5 } });
    expect(await points('alice')).toBe(25);
    for (const uid of ['bob', 'dave', 'erin']) expect(await points(uid), uid).toBe(20);
  });

  it('with none of those, the top stays empty and nobody is paid', async () => {
    await setup();
    await entry('f', 'bob', { type: 'framed' });
    await vote('f', 'carol', 1);
    expect((await top())?.feedId ?? null).toBeNull();
    expect(await paidOut()).toBe(0);
  });

  it.each(['checkin-answer', 'global-won'])('a %s entry can hold it and pays its player', async (type) => {
    await setup();
    await entry('a', 'alice', { type });
    await vote('a', 'carol', 1);
    expect(await points('alice')).toBe(25);
  });
});

describe('the +5 moves with the top (edge cases 1–6)', () => {
  it('1. the first entry to take the top pays its player, recorded on game/top', async () => {
    await setup();
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    expect(await points('alice')).toBe(25);
    expect(await lines('alice', 'top-entry')).toEqual([expect.objectContaining({ uid: 'alice', delta: 5, ref: 'a' })]);
    expect(await top()).toMatchObject({ feedId: 'a', award: { uid: 'alice', feedId: 'a', points: 5 } });
  });

  it('2. another player’s entry takes the top: the old holder gives back exactly what they got, the new one gains it', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    await vote('b', 'bob', 1, at(11));
    await vote('b', 'dave', 1, at(12));
    expect(await points('alice')).toBe(20);
    expect(await points('carol')).toBe(25);
    expect(await lines('alice', 'top-entry-lost')).toEqual([expect.objectContaining({ delta: -5, ref: 'a' })]);
    expect(await top()).toMatchObject({ feedId: 'b', award: { uid: 'carol', feedId: 'b', points: 5 } });
    expect(await paidOut()).toBe(5);
  });

  it('3. the same player’s other entry taking the top moves no points; the award follows the entry', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('a2', 'alice', {}, 1);
    await vote('a', 'bob', 1, at(10));
    await vote('a2', 'bob', 1, at(11));
    await vote('a2', 'carol', 1, at(12));
    expect((await top())!.feedId).toBe('a2');
    expect(await points('alice')).toBe(25);
    expect(await lines('alice', 'top-entry')).toHaveLength(1);
    expect(await lines('alice', 'top-entry-lost')).toHaveLength(0);
    expect((await top())!.award).toEqual({ uid: 'alice', feedId: 'a2', points: 5 });
  });

  it('4. the holder’s score changing while it keeps the top moves nothing', async () => {
    await setup();
    await entry('a', 'alice');
    await vote('a', 'bob', 1, at(10));
    await vote('a', 'carol', 1, at(11));
    await vote('a', 'dave', -1, at(12));
    expect(await points('alice')).toBe(25);
    expect(await lines('alice', 'top-entry')).toHaveLength(1);
  });

  it('5. the top emptying takes the +5 back and clears the award', async () => {
    await setup();
    await entry('a', 'alice');
    await vote('a', 'bob', 1, at(10));
    await vote('a', 'bob', null, at(11));
    expect(await points('alice')).toBe(20);
    expect(await top()).toMatchObject({ feedId: null, award: null });
  });

  it('6. a fraud flag on the top entry takes it back, and the next entry’s player gains it', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    await vote('a', 'dave', 1, at(10));
    await vote('b', 'bob', 1, at(11));
    expect((await top())!.feedId).toBe('a');
    await db().doc('feed/a').update({ flagged: true });
    await recomputeTop(db(), at(20), mystery);
    expect(await points('alice')).toBe(20);
    expect(await points('carol')).toBe(25);
    expect(await top()).toMatchObject({ feedId: 'b', award: { uid: 'carol', feedId: 'b', points: 5 } });
  });
});

describe('settings and the zero floor (edge cases 8, 9, 14)', () => {
  it('8. topEntryPoints 0 pays nothing', async () => {
    await setup({ settings: { topEntryPoints: 0 } });
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    expect((await top())!.feedId).toBe('a');
    expect((await top())!.award ?? null).toBeNull();
    expect(await points('alice')).toBe(20);
  });

  it('8. an award paid before the GM set it to 0 is still taken back when the top moves', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    expect(await points('alice')).toBe(25);
    await db().doc('game/settings').update({ topEntryPoints: 0 });
    await vote('b', 'bob', 1, at(11));
    await vote('b', 'dave', 1, at(12));
    expect(await points('alice')).toBe(20);
    expect(await points('carol')).toBe(20);
    expect((await top())!.award ?? null).toBeNull();
  });

  it('9. with the zero floor, the takeback stops at 0', async () => {
    await setup({ settings: { pointsFloorZero: true } });
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    expect(await points('alice')).toBe(25);
    await db().doc('players/alice').update({ points: 2 });
    await vote('b', 'bob', 1, at(11));
    await vote('b', 'dave', 1, at(12));
    expect(await points('alice')).toBe(0);
    expect(await lines('alice', 'top-entry-lost')).toEqual([expect.objectContaining({ delta: -2 })]);
  });

  it('14. the engine default is 0 and the mystery pack’s is 5', () => {
    expect(DEFAULT_SETTINGS.topEntryPoints).toBe(0);
    expect(defaultSettingsFor(getPack('lancaster')).topEntryPoints).toBe(0);
    expect(defaultSettingsFor(getPack('starter')).topEntryPoints).toBe(0);
    expect(defaultSettingsFor(mystery).topEntryPoints).toBe(5);
  });
});

describe('outside play, and players who left (edge cases 10, 11)', () => {
  it.each(['ended', 'lobby'] as const)('10. while the game is %s, a new top pays nothing', async (status) => {
    await setup({ status });
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    expect((await top())!.feedId).toBe('a');
    expect(await points('alice')).toBe(20);
  });

  it('10. once the case is closed, the top moving leaves the points and the award as they were', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    await db().doc('game/state').update({ status: 'ended' });
    await vote('b', 'bob', 1, at(11));
    await vote('b', 'dave', 1, at(12));
    expect(await points('alice')).toBe(25);
    expect(await points('carol')).toBe(20);
    expect((await top())!.award).toEqual({ uid: 'alice', feedId: 'a', points: 5 });
  });

  it('a paused game still pays', async () => {
    await setup({ status: 'paused' });
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    expect(await points('alice')).toBe(25);
  });

  it('11. a player who left is not paid for holding the top', async () => {
    await setup();
    await db().doc('players/alice').update({ left: 'frozen' });
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    expect((await top())!.feedId).toBe('a');
    expect(await points('alice')).toBe(20);
    expect((await top())!.award ?? null).toBeNull();
  });

  it('11. when the top leaves a player who has since left, their frozen score keeps it', async () => {
    await setup();
    await entry('a', 'alice');
    await entry('b', 'carol', {}, 1);
    await vote('a', 'bob', 1, at(10));
    await db().doc('players/alice').update({ left: 'out' });
    await vote('b', 'bob', 1, at(11));
    await vote('b', 'dave', 1, at(12));
    expect(await points('alice')).toBe(25);
    expect(await points('carol')).toBe(25);
  });
});

describe('idempotent, and the reset (edge cases 12, 15)', () => {
  it('12. running it again pays nothing more', async () => {
    await setup();
    await entry('a', 'alice');
    await vote('a', 'bob', 1, at(10));
    await recomputeTop(db(), at(20), mystery);
    await handleReactionWritten(db(), 'a', at(21), mystery);
    expect(await points('alice')).toBe(25);
    expect(await lines('alice', 'top-entry')).toHaveLength(1);
  });

  it('12. two triggers at once pay once', async () => {
    await setup();
    await entry('a', 'alice');
    await db().doc('feed/a/reactions/bob').set({ vote: 1, createdAt: ts(at(10)) });
    await db().doc('feed/a/reactions/carol').set({ vote: 1, createdAt: ts(at(10)) });
    await Promise.all([handleReactionWritten(db(), 'a', at(10), mystery), handleReactionWritten(db(), 'a', at(10), mystery)]);
    expect(await points('alice')).toBe(25);
    expect(await lines('alice', 'top-entry')).toHaveLength(1);
  });

  it('15. a reset leaves no top and no award', async () => {
    await setup();
    await seedAdmin(db(), 'gm');
    await entry('a', 'alice');
    await vote('a', 'bob', 1);
    await resetGame(db(), ctx('gm', T0, undefined, undefined, mystery), { confirm: 'RESET' });
    expect(await top()).toBeUndefined();
  });
});
