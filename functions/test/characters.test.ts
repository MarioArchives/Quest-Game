// Mystery plan edge case 14: characters and motives (packs with characters). The GM sets who a player is playing
// (players/{uid}.character, public) and their secret motive (motives/{uid}, readable by that player and the GM).
import { describe, expect, it } from 'vitest';
import { setCharacter } from '../src/game/characters.js';
import type { GamePack } from '../src/shared/packs/types.js';
import { allDocs, ctx, expectCode, getData, getPlayer, seedAdmin, seedGame, seedPlayer, T0, toMillis, useEmulatorDb } from './helpers.js';
import { lancaster, testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-characters');

const PACK = testPack({ features: { characters: true } });

async function setup() {
  await seedGame(db(), { status: 'active' });
  await seedAdmin(db(), 'gm');
  await seedPlayer(db(), 'alice', { points: 40 });
  await seedPlayer(db(), 'bob');
}

const set = (by: string | null, data: Record<string, unknown>, pack: GamePack = PACK) =>
  setCharacter(db(), ctx(by, T0, undefined, undefined, pack), data);

const VIOLET = { uid: 'alice', name: 'Lady Violet Ashcombe', role: 'Niece of the deceased', motive: 'She is cut out of the will.' };

describe('M14. the GM sets a character and a motive', () => {
  it('puts the character on the player doc and the motive in motives/{uid}, and posts nothing', async () => {
    await setup();
    expect(await set('gm', VIOLET)).toEqual({ ok: true });
    const alice = await getPlayer(db(), 'alice');
    expect(alice.character).toEqual({ name: 'Lady Violet Ashcombe', role: 'Niece of the deceased' });
    expect(alice.points).toBe(40);
    expect(alice).not.toHaveProperty('motive');
    const motive = await getData(db(), 'motives/alice');
    expect(motive).toMatchObject({ text: 'She is cut out of the will.' });
    expect(toMillis(motive!.updatedAt)).toBe(T0.getTime());
    expect(await allDocs(db(), 'feed')).toEqual([]);
  });

  it('trims the text, and the role and motive may be left out', async () => {
    await setup();
    await set('gm', { uid: 'bob', name: '  Colonel Mustard  ' });
    expect((await getPlayer(db(), 'bob')).character).toEqual({ name: 'Colonel Mustard', role: '' });
    expect((await getData(db(), 'motives/bob'))?.text).toBe('');
  });

  it('setting it again replaces both', async () => {
    await setup();
    await set('gm', VIOLET);
    await set('gm', { uid: 'alice', name: 'Dr Grey', role: 'Family doctor', motive: 'Hush money.' });
    expect((await getPlayer(db(), 'alice')).character).toEqual({ name: 'Dr Grey', role: 'Family doctor' });
    expect((await getData(db(), 'motives/alice'))?.text).toBe('Hush money.');
  });

  it('a GM who plays can set their own', async () => {
    await setup();
    await seedPlayer(db(), 'gm');
    await set('gm', { uid: 'gm', name: 'The Butler', role: 'Staff', motive: 'Unpaid wages.' });
    expect((await getPlayer(db(), 'gm')).character).toEqual({ name: 'The Butler', role: 'Staff' });
  });

  it.each([
    ['an empty name', { ...VIOLET, name: '   ' }],
    ['no name', { uid: 'alice' }],
    ['a name over 40 characters', { ...VIOLET, name: 'x'.repeat(41) }],
    ['a role over 60 characters', { ...VIOLET, role: 'x'.repeat(61) }],
    ['a motive over 500 characters', { ...VIOLET, motive: 'x'.repeat(501) }],
    ['a name that is not text', { ...VIOLET, name: 7 }],
    ['a malformed uid', { ...VIOLET, uid: 7 }],
  ])('refuses %s', async (_label, data) => {
    await setup();
    await expectCode(set('gm', data), 'invalid-argument');
    expect((await getPlayer(db(), 'alice')).character ?? null).toBeNull();
    expect(await getData(db(), 'motives/alice')).toBeUndefined();
  });

  it('refuses a uid that is not a player', async () => {
    await setup();
    await expectCode(set('gm', { ...VIOLET, uid: 'nobody' }), 'not-found');
    expect(await getData(db(), 'motives/nobody')).toBeUndefined();
  });

  it('refuses players (even for themselves) and signed-out callers', async () => {
    await setup();
    await expectCode(set('alice', VIOLET), 'permission-denied');
    await expectCode(set('bob', VIOLET), 'permission-denied');
    await expectCode(set(null, VIOLET), 'unauthenticated');
    expect((await getPlayer(db(), 'alice')).character ?? null).toBeNull();
  });

  it('refuses when the pack has no characters', async () => {
    await setup();
    await expectCode(set('gm', VIOLET, lancaster()), 'failed-precondition');
    expect((await getPlayer(db(), 'alice')).character ?? null).toBeNull();
  });
});
