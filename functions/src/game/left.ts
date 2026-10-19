import type { DocRef } from '../shared/store/types.js';
import { termForms } from '../shared/packs/terms.js';
import type { Player, PlayerLeft, Submission } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { addFeed } from './feed.js';
import { fail, loadState, requireGM } from './guards.js';
import { pushAllowed, type PushPlan } from './push.js';
import { asId, toTs } from './util.js';

const OPEN_QUEST = new Set(['live', 'checking', 'voting']);

const POST_TEXT: Record<PlayerLeft | 'back', (name: string) => string> = {
  frozen: (name) => `${name} has left the game. Their score is frozen`,
  out: (name) => `${name} is out of the game`,
  back: (name) => `${name} is back in the game`,
};

/**
 * GM marks a player who has left: 'frozen' (stays on the leaderboard, score kept) or 'out' (off the leaderboard
 * and the final standings, and their side-quest entries still in play are withdrawn), or brings them back (null).
 * Either way they can't play, be guessed or be picked as a witness, and their map pin goes. Their history stays.
 * `push` (for the caller to send) tells anyone whose pending claim names them as witness to pick someone else.
 */
export async function setPlayerLeft(
  db: Db,
  ctx: Ctx,
  data: { uid?: unknown; left?: unknown },
): Promise<{ left: PlayerLeft | null; push: PushPlan | null }> {
  return db.runTransaction(async (tx) => {
    const t = termForms(ctx.pack.terms);
    const by = await requireGM(db, ctx, tx);
    const uid = asId(data.uid, 'uid');
    const left = data.left ?? null;
    if (left !== null && left !== 'frozen' && left !== 'out') fail('invalid-argument', "left must be 'frozen', 'out' or null.");
    if (uid === by) fail('permission-denied', "You can't mark yourself as having left.");

    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const playerRef = db.doc(`players/${uid}`);
    const playerSnap = await tx.get(playerRef);
    if (!playerSnap.exists) fail('not-found', 'No such player.');
    const player = playerSnap.data() as Player;
    if ((player.left ?? null) === left) return { left, push: null };

    // Reads first: claims waiting on them as witness, and (when putting them out) their entries still in play.
    const waiting = left
      ? (await tx.get(db.collection('submissions').where('witnessUid', '==', uid).where('status', '==', 'pending'))).docs
      : [];
    let withdrawn: DocRef[] = [];
    if (left === 'out') {
      const entries = (await tx.get(db.collection('submissions').where('uid', '==', uid))).docs.filter((d) => {
        const sub = d.data() as Submission;
        return sub.kind === 'global' && (sub.status === 'sealed' || sub.status === 'approved');
      });
      const quests = entries.length > 0 ? await tx.getAll(...entries.map((d) => db.doc(`globalQuests/${d.get('questId') as string}`))) : [];
      withdrawn = entries.filter((_, i) => OPEN_QUEST.has(quests[i]?.get('status') as string)).map((d) => d.ref);
    }

    tx.update(playerRef, { left, leftAt: left ? toTs(ctx.now) : null });
    if (left) tx.delete(db.doc(`locations/${uid}`));
    for (const ref of withdrawn) {
      tx.update(ref, { status: 'rejected', rejectReason: 'Out of the game', reviewedBy: by, reviewedAt: toTs(ctx.now) });
    }
    addFeed(tx, db, ctx.now, {
      type: 'left',
      text: POST_TEXT[left ?? 'back'](player.displayName),
      uid,
      ref: uid,
      actorUid: by,
      photoURL: player.photoURL ?? null,
    });

    const claimants = [...new Set(waiting.map((d) => d.get('uid') as string))];
    const push: PushPlan | null =
      claimants.length > 0 && pushAllowed(ctx.pack, 'witness-left')
        ? {
            to: claimants,
            message: {
              title: `Pick another ${t.witness.one}`,
              body: `${player.displayName} has left the game. Ask someone else to ${t.witness.one} your ${t.claim.one}.`,
              link: '#/account',
            },
          }
        : null;
    return { left, push };
  });
}
