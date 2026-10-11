import type { Player, Submission, SubmissionStatus } from '../shared/types.js';
import {
  approveClaim,
  assertApprovable,
  loadReview,
  overrideAsFraud,
  rejectClaim,
  rejectEntry,
  type Loaded,
  type ReviewEnv,
} from './approval.js';
import type { Ctx, Db } from './context.js';
import type { PushPlan } from './push.js';
import { fail, isGM, loadSettings, loadState, requireUid } from './guards.js';
import { asId, isId, toTs } from './util.js';

const NOTE_MAX = 500;

/** Why a fresh claim can't be accepted, or null when it is fine. */
function invalidReason(sub: Submission, loaded: Loaded, witness: Player | null): string | null {
  if (!loaded.player) return 'You are not a player in this game.';
  if (loaded.player.left) return 'The GM has marked you as having left the game.';
  if (!isId(sub.witnessUid) || sub.witnessUid === sub.uid || !witness) {
    return 'Your witness must be another player.';
  }
  if (witness.left) return 'Your witness has left the game. Pick someone else.';
  if (!loaded.quest) return 'That quest is not in your hand.';
  if (loaded.quest.status !== 'active') return 'That quest has already been handed in or is no longer active.';
  return null;
}

/**
 * Firestore onCreate for submissions/{id}: a personal claim is checked (witness, quest), its text is
 * copied for the witness and the quest marked submitted. Approval is always a person's call, never
 * automatic. Side-quest entries are not created by clients (see enterSideQuest). Idempotent.
 */
export async function handleSubmissionCreated(
  db: Db,
  submissionId: string,
  now: Date,
  _rng?: () => number,
): Promise<PushPlan | null> {
  let plan: PushPlan | null = null;
  await db.runTransaction(async (tx) => {
    plan = null;
    const subRef = db.doc(`submissions/${submissionId}`);
    const snap = await tx.get(subRef);
    if (!snap.exists) return;
    const sub = snap.data() as Submission;
    if (sub.processedAt) return;
    const processedAt = toTs(now);

    // Only a fresh, pending submission is validated; anything else is just marked as seen.
    if (sub.status !== 'pending') {
      tx.update(subRef, { processedAt });
      return;
    }
    const reject = (rejectReason: string) => tx.update(subRef, { processedAt, status: 'rejected', rejectReason });
    if (!isId(sub.uid) || sub.kind !== 'personal') {
      reject(sub.kind === 'global' ? 'Side quests are entered with the Enter button.' : 'This submission is malformed.');
      return;
    }

    const settings = await loadSettings(db, tx);
    const loaded = await loadReview(tx, db, submissionId, sub, settings);
    const witness = isId(sub.witnessUid) ? ((await tx.get(db.doc(`players/${sub.witnessUid}`))).data() as Player | undefined) ?? null : null;
    const claimantName = (await tx.get(db.doc(`players/${sub.uid}`))).get('displayName') as string | undefined;
    const reason = invalidReason(sub, loaded, witness);
    if (reason) {
      reject(reason);
      return;
    }

    // The witness can't see the player's hand, so show them what is being claimed.
    tx.update(loaded.questRef!, { status: 'submitted', submissionId });
    tx.update(subRef, {
      processedAt,
      claimTitle: loaded.quest!.title ?? null,
      claimDescription: loaded.quest!.description ?? null,
    });
    // Only the witness hears about it, by name: the secret quest itself stays hidden.
    plan = {
      to: [sub.witnessUid as string],
      message: { title: 'Witness needed', body: `${claimantName ?? 'A player'} needs you as a witness`, link: '#/account' },
    };
  });
  return plan;
}

/**
 * Approve: the named witness or any GM, never the claimant. Reject a pending claim: the witness or a GM
 * (a fine, and the quest is swapped). Rejecting an approved submission (fraud override, or disqualifying
 * a side-quest entry) is GM only. Nobody reviews their own. The optional note is shown on the post.
 */
export async function reviewSubmission(
  db: Db,
  ctx: Ctx,
  data: { submissionId?: unknown; approve?: unknown; note?: unknown },
): Promise<{ status: SubmissionStatus }> {
  const rng = ctx.rng ?? Math.random;
  return db.runTransaction(async (tx) => {
    const by = requireUid(ctx);
    const id = asId(data.submissionId, 'submissionId');
    if (typeof data.approve !== 'boolean') fail('invalid-argument', 'approve must be true or false.');
    let note: string | null = null;
    if (data.note !== undefined && data.note !== null) {
      if (typeof data.note !== 'string' || data.note.length > NOTE_MAX) {
        fail('invalid-argument', `The note must be text of at most ${NOTE_MAX} characters.`);
      }
      note = data.note.trim() || null;
    }

    const subRef = db.doc(`submissions/${id}`);
    const snap = await tx.get(subRef);
    if (!snap.exists) fail('not-found', 'No such submission.');
    const sub = snap.data() as Submission;
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    const gm = await isGM(db, by, tx);
    const settings = await loadSettings(db, tx);
    const env: ReviewEnv = { tx, db, now: ctx.now, rng, by };

    if (by === sub.uid) fail('permission-denied', 'You cannot review your own submission.');
    // Side-quest entries have no witness: only a GM can touch them (and only to disqualify).
    const allowed = gm || (sub.kind === 'personal' && by === sub.witnessUid);
    if (!allowed) fail('permission-denied', 'Only the named witness or a GM can review this.');

    if (data.approve) {
      if (sub.status === 'approved') return { status: 'approved' as const };
      if (sub.kind !== 'personal') fail('failed-precondition', 'Side-quest entries are not approved by a person.');
      const loaded = await loadReview(tx, db, id, sub, settings, { reviewer: by, dealing: settings.refillOnComplete });
      assertApprovable(loaded);
      // A witness only approves what is waiting on them; undoing a rejection is the GM's call.
      if (!gm && sub.status !== 'pending') fail('permission-denied', 'Only a GM can approve a rejected claim.');
      const update = approveClaim(env, loaded, note);
      tx.update(subRef, { ...update, ...(sub.rejectReason ? { rejectReason: null } : {}) });
      return { status: 'approved' as const };
    }

    if (sub.status === 'rejected') return { status: 'rejected' as const };
    // An approved claim, or a side-quest entry (sealed or revealed): the GM's fraud override.
    if (sub.status === 'approved' || sub.status === 'sealed') {
      if (!gm) fail('permission-denied', 'Only a GM can overturn an approval.');
      const loaded = await loadReview(tx, db, id, sub, settings, { reviewer: by, dealing: sub.kind === 'personal', posts: true });
      tx.update(subRef, overrideAsFraud(env, loaded, note));
      return { status: 'rejected' as const };
    }
    if (sub.kind !== 'personal') {
      tx.update(subRef, rejectEntry(env, note));
      return { status: 'rejected' as const };
    }
    const loaded = await loadReview(tx, db, id, sub, settings, { reviewer: by, dealing: true });
    tx.update(subRef, rejectClaim(env, loaded, note));
    return { status: 'rejected' as const };
  });
}
