// Standings (trusted confidant, person of interest): the onPlayerWritten trigger and the timer's sweep keep each
// player's `standing` in step with their points and post every change; with police, becoming a person of interest
// also opens a watch check-in when one is due.
import { termForms, type TermForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { cooldownLeftMs } from '../shared/police.js';
import { standingOf } from '../shared/standing.js';
import type { Txn } from '../shared/store/types.js';
import type { Player, PlayerStanding, Settings } from '../shared/types.js';
import type { Db } from './context.js';
import { addFeed } from './feed.js';
import { isQuietHours } from './globals.js';
import { loadSettings, loadState } from './guards.js';
import { openPoliceCall, questionFor, readQuizSource } from './police.js';
import { flushLines, noLines, readLineBook } from './policeLines.js';
import { millis } from './util.js';

/** The standing a player should have: none once they have left. */
const targetStanding = (player: Player, settings: Settings): PlayerStanding | null =>
  player.left ? null : standingOf(player.points, settings);

/** Writes the new standing and its post (none when they left). Reads nothing. */
function writeStanding(tx: Txn, db: Db, now: Date, t: TermForms, uid: string, player: Player, next: PlayerStanding | null): void {
  tx.update(db.doc(`players/${uid}`), { standing: next });
  if (player.left) return;
  const name = player.displayName;
  const prev = player.standing ?? null;
  const noun = (s: PlayerStanding) => (s === 'poi' ? t.poi.one : t.confidant.one);
  // Moving straight from one standing to the other posts only the new one.
  const text = next ? `${name} is now a ${noun(next)}` : `${name} is no longer a ${noun(prev!)}`;
  addFeed(tx, db, now, { type: 'standing', text, uid, ref: null, standing: next, photoURL: player.photoURL ?? null });
}

/** The players/{uid} write trigger: sync this player's standing (and, with police, their watch check-in). */
export async function handlePlayerWritten(db: Db, uid: string, now: Date, rng: () => number, pack: GamePack): Promise<void> {
  const t = termForms(pack.terms);
  await db.runTransaction(async (tx) => {
    const playerSnap = await tx.get(db.doc(`players/${uid}`));
    if (!playerSnap.exists) return;
    const state = await loadState(db, tx);
    if (state.status === 'ended') return;
    const player = playerSnap.data() as Player;
    const settings = await loadSettings(db, tx);
    const next = targetStanding(player, settings);
    if (next === (player.standing ?? null)) return;

    // A new person of interest is checked at once, if the game is running and their last watch call is old enough.
    const watch =
      pack.features.police &&
      next === 'poi' &&
      state.status === 'active' &&
      !isQuietHours(now, settings.quietHours, pack.timeZone) &&
      cooldownLeftMs(player.lastCheckedAt ? millis(player.lastCheckedAt) : null, settings.policeEveryMin, now.getTime()) === 0;
    const busy = watch ? (await tx.get(db.collection('policeCalls').where('uid', '==', uid))).docs.some((d) => d.get('status') === 'open') : true;
    // With phone calls on, the call rings their line when it can.
    const book = watch && !busy ? await readLineBook(tx, db, settings, [uid]) : noLines();
    const quiz = watch && !busy ? await readQuizSource(tx, db, pack, now) : null;

    writeStanding(tx, db, now, t, uid, player, next);
    if (watch && !busy) {
      openPoliceCall(tx, db, now, questionFor(pack, quiz, uid, rng), t, settings, { uid, name: player.displayName, kind: 'watch' }, book);
      flushLines(tx, db, now, t, book);
    }
  });
}

/** The timer's sweep: sync every player's standing (after the GM changes the thresholds). Returns who changed. */
export async function runStandings(db: Db, now: Date, pack: GamePack): Promise<{ changed: string[] }> {
  const t = termForms(pack.terms);
  return db.runTransaction(async (tx) => {
    const state = await loadState(db, tx);
    if (state.status === 'ended') return { changed: [] };
    const settings = await loadSettings(db, tx);
    const players = (await tx.get(db.collection('players'))).docs;
    const changed: string[] = [];
    for (const d of players) {
      const player = d.data() as Player;
      const next = targetStanding(player, settings);
      if (next === (player.standing ?? null)) continue;
      writeStanding(tx, db, now, t, d.id, player, next);
      changed.push(d.id);
    }
    return { changed };
  });
}
