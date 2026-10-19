// Onboarding (a pack's look.screens.onboarding): approval leaves bookedAt null, and bookIn takes the player's own
// particulars (each optional, checked), sets bookedAt once, and is only for players still in the game.
import { describe, expect, it } from 'vitest';
import { bookIn } from '../src/game/booking.js';
import { requestJoin, reviewJoinRequest } from '../src/game/join.js';
import { checkParticulars, DRINK_MAX, HEIGHT_MAX_CM, HEIGHT_MIN_CM, MARKS_MAX, needsBooking } from '../src/shared/booking.js';
import { addMin, ctx, expectCode, getData, getPlayer, seedAdmin, seedGame, seedPersonalTemplates, seedPlayer, T0, toMillis, useEmulatorDb } from './helpers.js';

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
