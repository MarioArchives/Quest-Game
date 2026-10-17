// Standings (plan edge cases 20–23): a trusted confidant has points above settings.confidantAbove, a person of
// interest points below settings.poiBelow (null = off). The players/{uid} write trigger (handlePlayerWritten) keeps
// each player's `standing` in step and posts every change; the timer's sweep (runStandings) catches threshold edits.
import { describe, expect, it } from 'vitest';
import { handlePlayerWritten, runStandings } from '../src/game/standing.js';
import type { GamePack } from '../src/shared/packs/types.js';
import { standingOf, standingSettingsProblem } from '../src/shared/standing.js';
import type { Settings } from '../src/shared/types.js';
import { allDocs, constRng, feedOf, getPlayer, seedGame, seedPlayer, T0, useEmulatorDb } from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-standing');

/** No police here: standings alone. */
const PACK: GamePack = testPack();
const LINES: Partial<Settings> = { confidantAbove: 10, poiBelow: -10, quietHours: null };

describe('standingOf', () => {
  const s = { confidantAbove: 10, poiBelow: -10 };

  it.each([
    [11, 'confidant'],
    [100, 'confidant'],
    [10, null],
    [0, null],
    [-10, null],
    [-11, 'poi'],
    [-500, 'poi'],
  ])('%i points → %s', (points, expected) => {
    expect(standingOf(points, s)).toBe(expected);
  });

  it('a threshold set to null is off', () => {
    expect(standingOf(1000, { confidantAbove: null, poiBelow: -10 })).toBeNull();
    expect(standingOf(-1000, { confidantAbove: 10, poiBelow: null })).toBeNull();
    expect(standingOf(-1000, { confidantAbove: null, poiBelow: null })).toBeNull();
  });

  it('works with a line at 0 and with the same number for both', () => {
    expect(standingOf(-1, { confidantAbove: 0, poiBelow: 0 })).toBe('poi');
    expect(standingOf(0, { confidantAbove: 0, poiBelow: 0 })).toBeNull();
    expect(standingOf(1, { confidantAbove: 0, poiBelow: 0 })).toBe('confidant');
  });

  it('when the lines cross (confidant below person of interest), person of interest wins', () => {
    expect(standingOf(0, { confidantAbove: -5, poiBelow: 5 })).toBe('poi');
  });
});

describe('standingSettingsProblem', () => {
  it('is fine when either is off, or the confidant line is at or above the other', () => {
    expect(standingSettingsProblem({ confidantAbove: null, poiBelow: null })).toBeNull();
    expect(standingSettingsProblem({ confidantAbove: 10, poiBelow: null })).toBeNull();
    expect(standingSettingsProblem({ confidantAbove: null, poiBelow: -10 })).toBeNull();
    expect(standingSettingsProblem({ confidantAbove: 10, poiBelow: -10 })).toBeNull();
    expect(standingSettingsProblem({ confidantAbove: 0, poiBelow: 0 })).toBeNull();
  });

  it('flags a confidant line below the person-of-interest line', () => {
    expect(standingSettingsProblem({ confidantAbove: -5, poiBelow: 5 })).toMatch(/confidant|interest/i);
  });
});

async function setup(settings: Partial<Settings> = LINES, status: 'active' | 'paused' | 'lobby' | 'ended' = 'active') {
  await seedGame(db(), { status, settings });
  for (const uid of ['alice', 'bob', 'carol']) await seedPlayer(db(), uid);
}

const setPoints = (uid: string, points: number, extra: Record<string, unknown> = {}) => db().doc(`players/${uid}`).update({ points, ...extra });
const sync = (uid: string, pack: GamePack = PACK) => handlePlayerWritten(db(), uid, T0, constRng(0), pack);
const standing = async (uid: string) => (await getPlayer(db(), uid)).standing ?? null;
const posts = () => feedOf(db(), 'standing');

describe('the player trigger (edge cases 21–22)', () => {
  it('sets the standing and posts once when someone becomes a person of interest', async () => {
    await setup();
    await setPoints('alice', -15);
    await sync('alice');
    expect(await standing('alice')).toBe('poi');
    const p = await posts();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ uid: 'alice' });
    expect(p[0]!.text).toMatch(/Alice is now a person of interest/);
  });

  it('runs again (as the trigger does on its own write) without posting or writing again', async () => {
    await setup();
    await setPoints('alice', -15);
    await sync('alice');
    await sync('alice');
    await sync('alice');
    expect(await posts()).toHaveLength(1);
  });

  it('posts when someone becomes a trusted confidant, and when they stop being one', async () => {
    await setup();
    await setPoints('bob', 15);
    await sync('bob');
    expect(await standing('bob')).toBe('confidant');
    await setPoints('bob', 5);
    await sync('bob');
    expect(await standing('bob')).toBeNull();
    const texts = (await posts()).map((p) => p.text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/Bob is now a trusted confidant/);
    expect(texts[1]).toMatch(/Bob is no longer a trusted confidant/);
  });

  it('posts when someone stops being a person of interest', async () => {
    await setup();
    await setPoints('alice', -15, { standing: 'poi' });
    await setPoints('alice', -5);
    await sync('alice');
    expect(await standing('alice')).toBeNull();
    expect((await posts()).map((p) => p.text)).toEqual([expect.stringMatching(/Alice is no longer a person of interest/)]);
  });

  it('a jump straight from person of interest to confidant posts only the new standing', async () => {
    await setup();
    await setPoints('alice', 20, { standing: 'poi' });
    await sync('alice');
    expect(await standing('alice')).toBe('confidant');
    expect((await posts()).map((p) => p.text)).toEqual([expect.stringMatching(/Alice is now a trusted confidant/)]);
  });

  it('writes nothing when the standing has not changed', async () => {
    await setup();
    await setPoints('alice', 5);
    await sync('alice');
    expect(await standing('alice')).toBeNull();
    expect(await posts()).toEqual([]);
  });

  it('a player who has left loses their standing quietly', async () => {
    await setup();
    await setPoints('alice', -15, { standing: 'poi', left: 'frozen' });
    await sync('alice');
    expect(await standing('alice')).toBeNull();
    expect(await posts()).toEqual([]);
  });

  it('nothing changes once the game has ended', async () => {
    await setup(LINES, 'ended');
    await setPoints('alice', -15);
    await sync('alice');
    expect(await standing('alice')).toBeNull();
    expect(await posts()).toEqual([]);
  });

  it('ignores a player doc that is gone', async () => {
    await setup();
    await sync('ghost');
    expect(await posts()).toEqual([]);
    expect((await allDocs(db(), 'players')).map((p) => p.id).sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('with both lines off, nobody has a standing', async () => {
    await setup({ confidantAbove: null, poiBelow: null });
    await setPoints('alice', -500);
    await sync('alice');
    expect(await standing('alice')).toBeNull();
    expect(await posts()).toEqual([]);
  });

  it("uses the pack's words for the standings", async () => {
    await setup();
    const pack = testPack({
      terms: { ...lancaster().terms, poi: { one: 'black sheep', many: 'black sheep' }, confidant: { one: 'golden child', many: 'golden children' } },
    });
    await setPoints('alice', -15);
    await setPoints('bob', 15);
    await sync('alice', pack);
    await sync('bob', pack);
    const texts = (await posts()).map((p) => p.text);
    expect(texts).toEqual(expect.arrayContaining([expect.stringMatching(/Alice is now a black sheep/), expect.stringMatching(/Bob is now a golden child/)]));
  });
});

describe('the sweep (edge case 23)', () => {
  it('after the GM moves the lines, the next sweep re-checks everyone, once', async () => {
    await setup({ confidantAbove: null, poiBelow: null });
    await setPoints('alice', -5);
    await setPoints('bob', 5);
    await db().doc('game/settings').update({ confidantAbove: 1, poiBelow: -1 });
    const res = await runStandings(db(), T0, PACK);
    expect(res.changed.sort()).toEqual(['alice', 'bob']);
    expect(await standing('alice')).toBe('poi');
    expect(await standing('bob')).toBe('confidant');
    expect(await standing('carol')).toBeNull();
    expect(await posts()).toHaveLength(2);

    expect((await runStandings(db(), T0, PACK)).changed).toEqual([]);
    expect(await posts()).toHaveLength(2);
  });

  it('does nothing once the game has ended', async () => {
    await setup(LINES, 'ended');
    await setPoints('alice', -15);
    expect((await runStandings(db(), T0, PACK)).changed).toEqual([]);
    expect(await standing('alice')).toBeNull();
  });
});
