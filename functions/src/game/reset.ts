import type { GameState } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, requireGM } from './guards.js';

// Top-level collections wiped by a reset (recursively, so quests, reactions and votes go too).
const WIPED_COLLECTIONS = [
  'players',
  'joinRequests',
  'submissions',
  'guesses',
  'guessCooldowns',
  'wraps',
  'locations',
  'pointsLedger',
  'feed',
  'globalQuests',
  'rewards',
  'motives',
  'checkins',
  'policeCalls',
];

/** GM wipes the game for a new round. Requires { confirm: 'RESET' }. Keeps templates, settings and admins. */
export async function resetGame(db: Db, ctx: Ctx, data: { confirm?: unknown }): Promise<void> {
  await requireGM(db, ctx);
  if (data?.confirm !== 'RESET') fail('invalid-argument', 'Type RESET to confirm.');

  // Which game the data was seeded for survives the reset (the app's "wrong game" check reads it).
  const pack = ((await db.doc('game/state').get()).data() as GameState | undefined)?.pack ?? null;

  for (const name of WIPED_COLLECTIONS) {
    await db.recursiveDelete(db.collection(name));
  }
  await db.doc('game/final').delete();

  // Periodic missions are set-up, like the templates: a new round keeps them and starts their counts again.
  for (const p of (await db.collection('periodics').get()).docs) await p.ref.update({ sent: 0, nextAt: null });

  const lobby: GameState = { status: 'lobby', startedAt: null, endedAt: null, nextGlobalQuestAt: null, announcement: null, ...(pack ? { pack } : {}) };
  await db.doc('game/state').set(lobby);
}
