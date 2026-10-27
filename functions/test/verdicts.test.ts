// Agreeing with the room (verdict points): half an hour after an entry is posted its verdict is settled from its
// votes, the side with more (with enough votes), and everyone on that side is paid. Settled once; nothing moves outside
// play, for a player who left, or in a pack without votes. Runs on both stores.
import { describe, expect, it } from 'vitest';
import { handleReactionWritten } from '../src/game/reactions.js';
import { runVerdicts } from '../src/game/verdicts.js';
import { agreedWith, verdictOf } from '../src/shared/feedVotes.js';
import { getPack } from '../src/shared/packs/index.js';
import type { GameState, Settings } from '../src/shared/types.js';
import { addMin, getData, getPlayer, ledgerFor, seedGame, seedPlayer, T0, ts, useEmulatorDb } from './helpers.js';

const db = useEmulatorDb('demo-fq-verdicts');
const mystery = getPack('mystery');
const at = (min: number) => addMin(T0, min);
const PLAYERS = ['alice', 'bob', 'carol', 'dave', 'erin'];

async function setup(opts: { status?: GameState['status']; settings?: Partial<Settings> } = {}) {
  await seedGame(db(), { status: opts.status ?? 'active', settings: { verdictPoints: 1, verdictWindowMin: 30, verdictMinVotes: 3, ...opts.settings } as Partial<Settings> });
  for (const uid of PLAYERS) await seedPlayer(db(), uid, { points: 20 });
}

/** An entry by `uid` posted at `minute` (an approved mission unless `extra` says otherwise). */
async function entry(id: string, uid: string, minute = 0, extra: Record<string, unknown> = {}) {
  await db().doc(`feed/${id}`).set({ type: 'approved', text: id, uid, ref: null, reactionCount: 0, createdAt: ts(at(minute)), ...extra });
}

/** Votes on `id` (uid → 1 heart, -1 eye), each a reaction doc with the trigger run as the server would. */
async function votes(id: string, cast: Record<string, 1 | -1>) {
  for (const [voter, v] of Object.entries(cast)) {
    await db().doc(`feed/${id}/reactions/${voter}`).set({ vote: v, createdAt: ts(at(5)) });
    await handleReactionWritten(db(), id, at(5), mystery);
  }
}

const points = async (uid: string) => (await getPlayer(db(), uid)).points as number;
const verdictLines = async (uid: string) => (await ledgerFor(db(), uid)).filter((l) => l.reason === 'verdict');
const verdict = async (id: string) => (await getData(db(), `feed/${id}`))?.verdict;

describe('the verdict from the votes', () => {
  it('is the side with more votes, once there are enough of them', () => {
    expect(verdictOf({ a: 1, b: 1, c: -1 }, 3)).toBe(1);
    expect(verdictOf({ a: -1, b: -1, c: 1 }, 3)).toBe(-1);
    expect(verdictOf({ a: 1, b: -1, c: 1, d: -1 }, 3)).toBe(0);
    expect(verdictOf({ a: 1, b: 1 }, 3)).toBe(0);
    expect(verdictOf({}, 0)).toBe(0);
    expect(verdictOf(undefined, 1)).toBe(0);
  });

  it('names the voters on its side, in uid order, and nobody without one', () => {
    expect(agreedWith({ carol: 1, alice: 1, bob: -1 }, 1)).toEqual(['alice', 'carol']);
    expect(agreedWith({ carol: 1, alice: 1, bob: -1 }, -1)).toEqual(['bob']);
    expect(agreedWith({ alice: 1, bob: -1 }, 0)).toEqual([]);
  });
});

describe('runVerdicts', () => {
  it('pays everyone who agreed with the verdict half an hour after the entry, and records it on the entry', async () => {
    await setup();
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: -1 });
    expect(await runVerdicts(db(), at(31), mystery)).toEqual({ settled: ['e'] });
    expect(await points('bob')).toBe(21);
    expect(await points('carol')).toBe(21);
    expect(await points('dave')).toBe(20);
    expect(await points('alice')).toBe(20);
    expect((await verdictLines('bob')).map((l) => [l.delta, l.ref])).toEqual([[1, 'e']]);
    expect(await verdict('e')).toMatchObject({ result: 1, up: 2, down: 1, agreed: ['bob', 'carol'] });
  });

  it('a doubtful verdict pays the eyes', async () => {
    await setup();
    await entry('e', 'alice', 0);
    await votes('e', { bob: -1, carol: -1, dave: 1 });
    await runVerdicts(db(), at(31), mystery);
    expect([await points('bob'), await points('carol'), await points('dave')]).toEqual([21, 21, 20]);
    expect(await verdict('e')).toMatchObject({ result: -1, agreed: ['bob', 'carol'] });
  });

  it('waits out the window: an entry posted 20 minutes ago has no verdict yet', async () => {
    await setup();
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: 1 });
    expect(await runVerdicts(db(), at(20), mystery)).toEqual({ settled: [] });
    expect(await verdict('e')).toBeUndefined();
    expect(await points('bob')).toBe(20);
  });

  it('settles once: running again, or a vote after the verdict, pays nothing more', async () => {
    await setup();
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: -1 });
    await runVerdicts(db(), at(31), mystery);
    await votes('e', { erin: 1 });
    expect(await runVerdicts(db(), at(40), mystery)).toEqual({ settled: [] });
    expect(await points('erin')).toBe(20);
    expect(await verdictLines('bob')).toHaveLength(1);
  });

  it('a tie, or too few votes, is no verdict: nobody is paid, and it is settled all the same', async () => {
    await setup();
    await entry('tie', 'alice', 0);
    await votes('tie', { bob: 1, carol: 1, dave: -1, erin: -1 });
    await entry('few', 'bob', 0);
    await votes('few', { carol: 1, dave: 1 });
    expect((await runVerdicts(db(), at(31), mystery)).settled.sort()).toEqual(['few', 'tie']);
    for (const uid of PLAYERS) expect(await verdictLines(uid), uid).toEqual([]);
    expect(await verdict('tie')).toMatchObject({ result: 0, up: 2, down: 2, agreed: [] });
    expect(await verdict('few')).toMatchObject({ result: 0, agreed: [] });
  });

  it('a player who has left is not paid', async () => {
    await setup();
    await db().doc('players/carol').update({ left: 'frozen' });
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: 1 });
    await runVerdicts(db(), at(31), mystery);
    expect(await points('carol')).toBe(20);
    expect(await verdict('e')).toMatchObject({ result: 1, agreed: ['bob', 'dave'] });
  });

  it('leaves posts that take no votes, and overruled entries, alone', async () => {
    await setup();
    await entry('join', 'alice', 0, { type: 'join' });
    await entry('over', 'alice', 0, { flagged: true });
    await votes('over', { bob: 1, carol: 1, dave: 1 });
    expect(await runVerdicts(db(), at(31), mystery)).toEqual({ settled: [] });
    expect(await verdict('join')).toBeUndefined();
    expect(await points('bob')).toBe(20);
  });

  it.each([['lobby'], ['ended']] as const)('does nothing while the game is %s', async (status) => {
    await setup({ status });
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: 1 });
    expect(await runVerdicts(db(), at(31), mystery)).toEqual({ settled: [] });
    expect(await verdict('e')).toBeUndefined();
  });

  it('settles while paused', async () => {
    await setup({ status: 'paused' });
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: 1 });
    expect(await runVerdicts(db(), at(31), mystery)).toEqual({ settled: ['e'] });
  });

  it('does nothing with verdict points off, or in a pack without votes', async () => {
    await setup({ settings: { verdictPoints: 0 } });
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1, dave: 1 });
    expect(await runVerdicts(db(), at(31), mystery)).toEqual({ settled: [] });
    await setup();
    expect(await runVerdicts(db(), at(31), getPack('lancaster'))).toEqual({ settled: [] });
    expect(await verdict('e')).toBeUndefined();
  });

  it('follows the GM’s window and the votes it needs', async () => {
    await setup({ settings: { verdictWindowMin: 60, verdictMinVotes: 2 } });
    await entry('e', 'alice', 0);
    await votes('e', { bob: 1, carol: 1 });
    expect(await runVerdicts(db(), at(45), mystery)).toEqual({ settled: [] });
    expect(await runVerdicts(db(), at(61), mystery)).toEqual({ settled: ['e'] });
    expect(await verdict('e')).toMatchObject({ result: 1, agreed: ['bob', 'carol'] });
  });
});
