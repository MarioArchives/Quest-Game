// Onboarding (a pack's look.screens.onboarding): approval leaves bookedAt null, and bookIn takes the player's own
// particulars (each optional, checked), sets bookedAt once, and is only for players still in the game.
import { describe, expect, it } from 'vitest';
import { bookIn } from '../src/game/booking.js';
import { requestJoin, reviewJoinRequest } from '../src/game/join.js';
import { checkParticulars, DRINK_MAX, HEIGHT_MAX_CM, HEIGHT_MIN_CM, MARKS_MAX, needsBooking } from '../src/shared/booking.js';
import { getPack, validatePack } from '../src/shared/packs/index.js';
import { addMin, ctx, expectCode, getData, getPlayer, seedAdmin, seedGame, seedPersonalTemplates, seedPlayer, T0, toMillis, useEmulatorDb } from './helpers.js';
import { testPack } from './packs.js';

const db = useEmulatorDb('demo-fq-booking');

const SAM = { heightCm: 183, drink: 'Pint', marks: 'Never without his green jacket' };

/** Sam asked to join and the GM let him in: a player with bookedAt null. */
async function approvedSam() {
  await seedGame(db(), { status: 'lobby' });
  await seedAdmin(db(), 'gm');
  await seedPersonalTemplates(db(), 10);
  await requestJoin(db(), ctx('sam'), { displayName: 'Sam' });
  await reviewJoinRequest(db(), ctx('gm'), { uid: 'sam', approve: true });
}

describe('bookIn', () => {
  it('saves the particulars and sets bookedAt, which lets the player past the onboarding', async () => {
    await approvedSam();
    expect(needsBooking((await getPlayer(db(), 'sam')) as never)).toBe(true);

    expect(await bookIn(db(), ctx('sam', T0), { particulars: SAM })).toEqual({ booked: true });
    const player = await getPlayer(db(), 'sam');
    expect(player.particulars).toEqual(SAM);
    expect(toMillis(player.bookedAt)).toBe(T0.getTime());
    expect(needsBooking(player as never)).toBe(false);
  });

  it('booking in again updates the particulars and keeps the first bookedAt', async () => {
    await approvedSam();
    await bookIn(db(), ctx('sam', T0), { particulars: SAM });
    await bookIn(db(), ctx('sam', addMin(T0, 30)), { particulars: { heightCm: 184, drink: null, marks: '' } });
    const player = await getPlayer(db(), 'sam');
    expect(player.particulars).toEqual({ heightCm: 184, drink: null, marks: null });
    expect(toMillis(player.bookedAt)).toBe(T0.getTime());
  });

  it('every particular is optional: none at all books them in with nothing on file', async () => {
    await approvedSam();
    await bookIn(db(), ctx('sam'), {});
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: null, drink: null, marks: null });
  });

  it('tidies the text onto one line and treats blanks as nothing', async () => {
    await approvedSam();
    await bookIn(db(), ctx('sam'), { particulars: { heightCm: null, drink: '  Gin  ', marks: 'A dragon\n  tattoo ' } });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: null, drink: 'Gin', marks: 'A dragon tattoo' });
    await bookIn(db(), ctx('sam'), { particulars: { drink: '   ', marks: '' } });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: null, drink: null, marks: null });
  });

  it('refuses heights out of range or not whole centimetres, and text that is too long or not text', async () => {
    await approvedSam();
    const bad = [
      { heightCm: HEIGHT_MIN_CM - 1 },
      { heightCm: HEIGHT_MAX_CM + 1 },
      { heightCm: 175.5 },
      { heightCm: '175' },
      { drink: 'x'.repeat(DRINK_MAX + 1) },
      { drink: 7 },
      { marks: 'x'.repeat(MARKS_MAX + 1) },
      { marks: ['scar'] },
    ];
    for (const particulars of bad) await expectCode(bookIn(db(), ctx('sam'), { particulars }), 'invalid-argument');
    await expectCode(bookIn(db(), ctx('sam'), { particulars: 'tall' }), 'invalid-argument');
    await expectCode(bookIn(db(), ctx('sam'), { particulars: [SAM] }), 'invalid-argument');
    // Nothing was written.
    expect((await getPlayer(db(), 'sam')).bookedAt).toBeNull();
  });

  it('takes the limits themselves', async () => {
    await approvedSam();
    const edge = { heightCm: HEIGHT_MAX_CM, drink: 'd'.repeat(DRINK_MAX), marks: 'm'.repeat(MARKS_MAX) };
    await bookIn(db(), ctx('sam'), { particulars: edge });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual(edge);
    await bookIn(db(), ctx('sam'), { particulars: { heightCm: HEIGHT_MIN_CM } });
    expect((await getPlayer(db(), 'sam')).particulars.heightCm).toBe(HEIGHT_MIN_CM);
  });

  it('not before the GM has let them in, and never for someone who is not a player', async () => {
    await seedGame(db(), { status: 'lobby' });
    await seedAdmin(db(), 'gm');
    await requestJoin(db(), ctx('sam'), { displayName: 'Sam' });
    await expectCode(bookIn(db(), ctx('sam'), { particulars: SAM }), 'permission-denied');
    expect(await getData(db(), 'players/sam')).toBeUndefined();
    // A GM who doesn't play has no file to book either.
    await expectCode(bookIn(db(), ctx('gm'), { particulars: SAM }), 'permission-denied');
    await expectCode(bookIn(db(), ctx(null), { particulars: SAM }), 'unauthenticated');
  });

  it('only ever books the caller: a uid in the data changes nothing', async () => {
    await approvedSam();
    await seedPlayer(db(), 'bob');
    await bookIn(db(), ctx('bob'), { uid: 'sam', particulars: SAM } as never);
    expect((await getPlayer(db(), 'bob')).particulars).toEqual(SAM);
    expect((await getPlayer(db(), 'sam')).bookedAt).toBeNull();
    expect((await getPlayer(db(), 'sam')).particulars).toBeUndefined();
  });

  it('refuses a player who has left the game', async () => {
    await approvedSam();
    await db().doc('players/sam').update({ left: 'frozen' });
    await expectCode(bookIn(db(), ctx('sam'), { particulars: SAM }), 'permission-denied');
  });
});

describe('needsBooking', () => {
  it('only an approved player with bookedAt null who is still in the game', () => {
    expect(needsBooking({ bookedAt: null })).toBe(true);
    expect(needsBooking({ bookedAt: null, left: null })).toBe(true);
    expect(needsBooking({ bookedAt: { seconds: 1 } })).toBe(false);
    // From before onboarding existed: no field at all, already playing.
    expect(needsBooking({})).toBe(false);
    expect(needsBooking({ bookedAt: null, left: 'frozen' })).toBe(false);
    expect(needsBooking({ bookedAt: null, left: 'out' })).toBe(false);
  });

  it('checkParticulars returns clean particulars or the problem in words', () => {
    expect(checkParticulars(undefined)).toEqual({ particulars: { heightCm: null, drink: null, marks: null } });
    expect(checkParticulars({ heightCm: 170, drink: 'Wine' })).toEqual({ particulars: { heightCm: 170, drink: 'Wine', marks: null } });
    expect(checkParticulars({ heightCm: 90 })).toEqual({ problem: expect.stringMatching(/from 120 to 230/) });
  });
});

// Plan "Police that sound official, a question bank, …", edge case 8: the booking desk asks for a relation to the
// victim (the pack's list) instead of a drink.
describe('a relation to the victim', () => {
  const RELATIONS = [
    { id: 'lover', label: 'Lover', phrase: "Bob's lover" },
    { id: 'best-friend', label: 'Best friend', phrase: "Bob's best friend" },
  ];
  const REL = testPack({ booking: { relations: RELATIONS } });
  const book = (particulars: unknown, now = T0) => bookIn(db(), ctx('sam', now, undefined, undefined, REL), { particulars });

  it("keeps one of the pack's relations, and clears it again", async () => {
    await approvedSam();
    await book({ heightCm: 183, relation: 'best-friend', marks: 'A green jacket' });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: 183, relation: 'best-friend', drink: null, marks: 'A green jacket' });
    await book({ heightCm: 183, relation: null, marks: 'A green jacket' }, addMin(T0, 5));
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: 183, relation: null, drink: null, marks: 'A green jacket' });
  });

  it('a pack with a relation list still takes a drink from an older app', async () => {
    await approvedSam();
    await book({ heightCm: null, drink: 'Gin', marks: null });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual({ heightCm: null, relation: null, drink: 'Gin', marks: null });
  });

  it("refuses a relation that isn't on the list, or isn't text", async () => {
    await approvedSam();
    await expectCode(book({ relation: 'nemesis' }), 'invalid-argument');
    await expectCode(book({ relation: 7 }), 'invalid-argument');
    expect((await getPlayer(db(), 'sam')).bookedAt).toBeNull();
  });

  it('a pack without a relation list refuses one, and keeps its particulars as before', async () => {
    await approvedSam();
    await expectCode(bookIn(db(), ctx('sam'), { particulars: { relation: 'lover' } }), 'invalid-argument');
    await bookIn(db(), ctx('sam'), { particulars: SAM });
    expect((await getPlayer(db(), 'sam')).particulars).toEqual(SAM);
  });

  it('checkParticulars, on its own', () => {
    expect(checkParticulars({ relation: 'lover' }, { relations: RELATIONS })).toEqual({ particulars: { heightCm: null, relation: 'lover', drink: null, marks: null } });
    expect(checkParticulars({ relation: '' }, { relations: RELATIONS })).toEqual({ particulars: { heightCm: null, relation: null, drink: null, marks: null } });
    expect(checkParticulars({ relation: 'nemesis' }, { relations: RELATIONS })).toEqual({ problem: expect.stringMatching(/relation/i) });
    expect(checkParticulars({ relation: 'lover' })).toEqual({ problem: expect.stringMatching(/relation/i) });
    expect(checkParticulars(null, { relations: RELATIONS })).toEqual({ particulars: { heightCm: null, relation: null, drink: null, marks: null } });
  });
});

describe("the mystery pack's booking desk", () => {
  it('offers exactly these relations to Bob, in this order', () => {
    expect(getPack('mystery').booking?.relations?.map((r) => r.label)).toEqual(['Lover', 'Ex', 'Sidepiece', 'Best friend', 'Boss', 'Parent', 'Sibling', "It's complicated"]);
    for (const r of getPack('mystery').booking!.relations!) {
      expect(r.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(r.phrase).toMatch(/Bob/);
    }
  });

  it('validatePack refuses a bad relation list', () => {
    const bad = (relations: unknown) => validatePack(testPack({ booking: { relations: relations as never } })).join('\n');
    expect(bad([{ id: 'a', label: 'A', phrase: 'a' }])).toMatch(/relation/i);
    expect(bad([{ id: 'a', label: 'A', phrase: 'a' }, { id: 'a', label: 'B', phrase: 'b' }])).toMatch(/relation|duplicate/i);
    expect(bad([{ id: 'Bad Id', label: 'A', phrase: 'a' }, { id: 'b', label: 'B', phrase: 'b' }])).toMatch(/relation|id/i);
    expect(bad([{ id: 'a', label: ' ', phrase: 'a' }, { id: 'b', label: 'B', phrase: 'b' }])).toMatch(/relation|label/i);
    expect(bad([{ id: 'a', label: 'A', phrase: 'x'.repeat(41) }, { id: 'b', label: 'B', phrase: 'b' }])).toMatch(/relation|phrase/i);
  });
});
