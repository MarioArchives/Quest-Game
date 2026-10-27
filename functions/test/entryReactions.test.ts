// Reactions to a side-quest entry (plan "Voting takeover: polaroid swipe, the cork board, and yes/no voting", edge
// cases 11–12): an eye and a heart, kept apart from the log book's votes. Each player writes their own
// submissions/{id}/entryReactions/{uid}; the onEntryReactionWritten trigger keeps who gave which on the entry.
// Runs on both stores.
import { describe, expect, it } from 'vitest';
import { recountEntryReactions } from '../src/game/entryReactions.js';
import { resetGame } from '../src/game/reset.js';
import { ENTRY_REACTIONS, canReact } from '../src/shared/entryReactions.js';
import { ctx, getData, seedAdmin, seedGame, seedPlayer, seedSubmission, T0, ts, useEmulatorDb } from './helpers.js';

const db = useEmulatorDb('demo-fq-entry-reactions');

/** alice's approved entry to a side quest. */
async function entry(id = 'ea', uid = 'alice', extra: Record<string, unknown> = {}) {
  await seedSubmission(db(), id, { uid, kind: 'global', questId: 'gq1', witnessUid: null, status: 'approved', evidence: true, extra });
}

/** Writes (or, with null, deletes) a player's reaction doc and runs the trigger as the server would. */
async function react(sid: string, uid: string, r: { eye?: boolean; heart?: boolean } | null) {
  const ref = db().doc(`submissions/${sid}/entryReactions/${uid}`);
  if (r === null) await ref.delete();
  else await ref.set({ eye: r.eye ?? false, heart: r.heart ?? false, updatedAt: ts(T0) });
  await recountEntryReactions(db(), sid);
}

const counts = async (sid: string) => (await getData(db(), `submissions/${sid}`))!.entryReactions;

describe('the reactions kept on the entry', () => {
  it('lists who gave an eye and who gave a heart, sorted', async () => {
    await entry();
    await react('ea', 'carol', { eye: true });
    await react('ea', 'bob', { eye: true, heart: true });
    await react('ea', 'dave', { heart: true });
    expect(await counts('ea')).toEqual({ eye: ['bob', 'carol'], heart: ['bob', 'dave'] });
  });

  it('turning one off, or taking the doc away, takes the player off that list', async () => {
    await entry();
    await react('ea', 'bob', { eye: true, heart: true });
    await react('ea', 'carol', { heart: true });
    await react('ea', 'bob', { eye: false, heart: true });
    expect(await counts('ea')).toEqual({ eye: [], heart: ['bob', 'carol'] });
    await react('ea', 'carol', null);
    expect(await counts('ea')).toEqual({ eye: [], heart: ['bob'] });
    await react('ea', 'bob', null);
    expect(await counts('ea')).toEqual({ eye: [], heart: [] });
  });

  it("never counts the entrant's own, even written straight to the store", async () => {
    await entry();
    await react('ea', 'alice', { eye: true, heart: true });
    await react('ea', 'bob', { heart: true });
    expect(await counts('ea')).toEqual({ eye: [], heart: ['bob'] });
  });

  it('running it again changes nothing, and the rest of the entry is left alone', async () => {
    await entry('ea', 'alice', { pointsAwarded: 4, caption: 'the dart' });
    await react('ea', 'bob', { eye: true });
    await recountEntryReactions(db(), 'ea');
    await recountEntryReactions(db(), 'ea');
    expect(await getData(db(), 'submissions/ea')).toMatchObject({
      uid: 'alice',
      status: 'approved',
      pointsAwarded: 4,
      caption: 'the dart',
      entryReactions: { eye: ['bob'], heart: [] },
    });
  });

  it('a submission that has gone is left alone, without throwing', async () => {
    await expect(recountEntryReactions(db(), 'gone')).resolves.toBeUndefined();
    expect(await getData(db(), 'submissions/gone')).toBeUndefined();
  });

  it('a reset wipes them with the entries', async () => {
    await seedGame(db());
    await seedAdmin(db(), 'gm');
    await seedPlayer(db(), 'alice');
    await entry();
    await react('ea', 'bob', { heart: true });
    await resetGame(db(), ctx('gm'), { confirm: 'RESET' });
    expect((await db().collection('submissions/ea/entryReactions').get()).docs).toEqual([]);
    expect(await getData(db(), 'submissions/ea')).toBeUndefined();
  });
});

describe('ENTRY_REACTIONS and canReact', () => {
  const sub = (over: Record<string, unknown> = {}) => ({ uid: 'alice', kind: 'global' as const, status: 'approved' as const, ...over }) as never;

  it('are an eye and a heart', () => {
    expect([...ENTRY_REACTIONS]).toEqual(['eye', 'heart']);
  });

  it("lets a player react to someone else's approved side-quest entry", () => {
    expect(canReact(sub(), 'bob')).toBe(true);
  });

  it.each([
    ['their own entry', sub(), 'alice'],
    ['a sealed entry', sub({ status: 'sealed' }), 'bob'],
    ['a pending entry', sub({ status: 'pending' }), 'bob'],
    ['a thrown-out entry', sub({ status: 'rejected' }), 'bob'],
    ['a personal claim', sub({ kind: 'personal' }), 'bob'],
    ['nothing', null, 'bob'],
    ['nobody signed in', sub(), null],
  ])('refuses %s', (_label, s, uid) => {
    expect(canReact(s, uid as string | null)).toBe(false);
  });
});
