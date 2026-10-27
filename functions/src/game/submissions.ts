import { getPack } from '../shared/packs/index.js';
import type { GamePack } from '../shared/packs/types.js';
import { termForms, type TermForms } from '../shared/packs/terms.js';
import type { Player, Submission, SubmissionStatus } from '../shared/types.js';
import {
  approveClaim,
  assertApprovable,
  hyphenated,
  loadReview,
  overrideAsFraud,
  rejectClaim,
  rejectEntry,
  type Loaded,
  type ReviewEnv,
} from './approval.js';
import type { Ctx, Db } from './context.js';
import { scoringFor } from './ledger.js';
import { recomputeTop } from './reactions.js';
import { pushAllowed, type PushPlan } from './push.js';
import { fail, isGM, loadSettings, loadState, requireUid } from './guards.js';
import { asId, isId, toTs } from './util.js';

const NOTE_MAX = 500;

/** Why a fresh claim can't be accepted, or null when it is fine. */
function invalidReason(sub: Submission, loaded: Loaded, witness: Player | null, t: TermForms): string | null {
  if (!loaded.player) return 'You are not a player in this game.';
  if (loaded.player.left) return `The ${t.gm.One} has marked you as having left the game.`;
  if (!isId(sub.witnessUid) || sub.witnessUid === sub.uid || !witness) {
    return `Your ${t.witness.one} must be another player.`;
  }
  if (witness.left) return `Your ${t.witness.one} has left the game. Pick someone else.`;
  if (!loaded.quest) return `That ${t.quest.one} is not in your hand.`;
  if (loaded.quest.status !== 'active') return `That ${t.quest.one} has already been handed in or is no longer active.`;
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
  pack: GamePack = getPack(),
): Promise<PushPlan | null> {
  const t = termForms(pack.terms);
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
      reject(sub.kind === 'global' ? `${t.sideQuest.Many} are entered with the Enter button.` : 'This submission is malformed.');
      return;
    }

    const settings = await loadSettings(db, tx);
    const loaded = await loadReview(tx, db, submissionId, sub, settings);
    const witness = isId(sub.witnessUid) ? ((await tx.get(db.doc(`players/${sub.witnessUid}`))).data() as Player | undefined) ?? null : null;
    const claimantName = (await tx.get(db.doc(`players/${sub.uid}`))).get('displayName') as string | undefined;
    const reason = invalidReason(sub, loaded, witness, t);
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
      witnessNotifiedUid: sub.witnessUid,
    });
    // Only the witness hears about it, by name: the secret ${t.quest.one} itself stays hidden.
    if (!pushAllowed(pack, 'witness')) return;
    plan = {
      to: [sub.witnessUid as string],
      message: { title: `${t.witness.One} needed`, body: `${claimantName ?? 'A player'} needs you as a ${t.witness.one}`, link: '#/account' },
    };
  });
  return plan;
}

/**
 * Firestore onWrite for submissions/{id}: when the claimant asks someone else to witness a pending claim, the new
 * witness hears about it. Compares witnessUid with witnessNotifiedUid (set here and by the create trigger), so it
 * fires once per change and never on its own write.
 */
export async function handleSubmissionWritten(
  db: Db,
  submissionId: string,
  _now: Date,
  _rng?: () => number,
  pack: GamePack = getPack(),
): Promise<PushPlan | null> {
  const t = termForms(pack.terms);
  let plan: PushPlan | null = null;
  await db.runTransaction(async (tx) => {
    plan = null;
    const subRef = db.doc(`submissions/${submissionId}`);
    const snap = await tx.get(subRef);
    if (!snap.exists) return;
    const sub = snap.data() as Submission;
    // The create trigger tells the first witness; until it has processed the claim there is nothing to compare.
    if (!sub.processedAt || sub.kind !== 'personal' || sub.status !== 'pending' || !isId(sub.witnessUid)) return;
    if (sub.witnessNotifiedUid === sub.witnessUid) return;
    const announce = !!sub.witnessNotifiedUid && pushAllowed(pack, 'witness');
    const claimantName = announce ? ((await tx.get(db.doc(`players/${sub.uid}`))).get('displayName') as string | undefined) : undefined;
    tx.update(subRef, { witnessNotifiedUid: sub.witnessUid });
    // A claim from before this field existed: record its witness, but don't announce it again.
    if (!announce) return;
    plan = {
      to: [sub.witnessUid as string],
      message: { title: `${t.witness.One} needed`, body: `${claimantName ?? 'A player'} needs you as a ${t.witness.one}`, link: '#/account' },
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
  const t = termForms(ctx.pack.terms);
  let overridden = false;
  const result = await db.runTransaction(async (tx) => {
    overridden = false;
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
    const env: ReviewEnv = { tx, db, now: ctx.now, rng, by, pack: ctx.pack, scoring: scoringFor(ctx.pack, settings, state, ctx.now) };

    if (by === sub.uid) fail('permission-denied', 'You cannot review your own submission.');
    // Side-quest entries have no witness: only a GM can touch them (and only to disqualify).
    const allowed = gm || (sub.kind === 'personal' && by === sub.witnessUid);
    if (!allowed) fail('permission-denied', `Only the named ${t.witness.one} or a ${t.gm.one} can review this.`);

    if (data.approve) {
      if (sub.status === 'approved') return { status: 'approved' as const };
      if (sub.kind !== 'personal') fail('failed-precondition', `${hyphenated(t.sideQuest.One)} entries are not approved by a person.`);
      const loaded = await loadReview(tx, db, id, sub, settings, { reviewer: by, dealing: settings.refillOnComplete });
      assertApprovable(loaded, ctx.pack);
      // A witness only approves what is waiting on them; undoing a rejection is the GM's call.
      if (!gm && sub.status !== 'pending') fail('permission-denied', `Only a ${t.gm.one} can approve a rejected ${t.claim.one}.`);
      const update = approveClaim(env, loaded, note);
      tx.update(subRef, { ...update, ...(sub.rejectReason ? { rejectReason: null } : {}) });
      return { status: 'approved' as const };
    }

    if (sub.status === 'rejected') return { status: 'rejected' as const };
    // An approved claim, or a side-quest entry (sealed or revealed): the GM's fraud override.
    if (sub.status === 'approved' || sub.status === 'sealed') {
      if (!gm) fail('permission-denied', `Only a ${t.gm.one} can overturn an approval.`);
      const loaded = await loadReview(tx, db, id, sub, settings, { reviewer: by, dealing: sub.kind === 'personal', posts: true, reward: true });
      tx.update(subRef, overrideAsFraud(env, loaded, note));
      overridden = true;
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
  // The override flagged the entry's posts: a flagged post loses the pinned top entry (votes packs).
  if (overridden && ctx.pack.reactions === 'votes') await recomputeTop(db, ctx.now, ctx.pack);
  return result;
}
