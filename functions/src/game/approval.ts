// The claim state machine behind reviewSubmission: approve, reject and the GM's fraud override.
// Everything here runs inside the caller's transaction: load first (reads), then apply (writes).
import type { DocRef, Txn } from '../shared/store/types.js';
import type { GamePack } from '../shared/packs/types.js';
import { termForms } from '../shared/packs/terms.js';
import type { GlobalQuest, Player, Quest, Settings, Submission } from '../shared/types.js';
import type { Db } from './context.js';
import { dealReplacement, readDealing, type Dealing } from './deal.js';
import { addFeed } from './feed.js';
import { fail } from './guards.js';
import { applyPoints, applyScore, type Scoring } from './ledger.js';
import { isId, toTs } from './util.js';

export interface Loaded {
  id: string;
  subRef: DocRef;
  sub: Submission;
  settings: Settings;
  playerRef: DocRef;
  player: Player | null;
  questRef: DocRef | null;
  quest: Quest | null;
  gqRef: DocRef | null;
  gq: GlobalQuest | null;
  /** Display name of the reviewing player (witness or GM); null when the reviewer has no player doc. */
  reviewerName: string | null;
  /** The reviewing player's points (for scoring what the reviewer earns); null when they have no player doc. */
  reviewerPoints: number | null;
  /** Approval / win posts about this submission, flagged when the GM overrides it. */
  postRefs: DocRef[];
  /** The player's open-quest count and fresh templates for dealing a replacement; empty unless requested. */
  dealing: Dealing;
}

export interface LoadOptions {
  /** The reviewing uid; its player doc is read so posts can name them. */
  reviewer?: string;
  /** Read the player's dealing state (whenever a personal quest may need a replacement dealt). */
  dealing?: boolean;
  /** Read the feed posts about this submission (for a fraud override). */
  posts?: boolean;
}

/** Reads everything the submission's state transitions may touch. No writes. */
export async function loadReview(
  tx: Txn,
  db: Db,
  id: string,
  sub: Submission,
  settings: Settings,
  opts: LoadOptions = {},
): Promise<Loaded> {
  if (!isId(sub.uid)) fail('failed-precondition', 'This submission is malformed.');
  const playerRef = db.doc(`players/${sub.uid}`);
  const playerSnap = await tx.get(playerRef);

  let questRef: DocRef | null = null;
  let quest: Quest | null = null;
  let gqRef: DocRef | null = null;
  let gq: GlobalQuest | null = null;
  if (sub.kind === 'personal' && isId(sub.questId)) {
    questRef = db.doc(`players/${sub.uid}/quests/${sub.questId}`);
    const snap = await tx.get(questRef);
    quest = snap.exists ? (snap.data() as Quest) : null;
  } else if (sub.kind === 'global' && isId(sub.questId)) {
    gqRef = db.doc(`globalQuests/${sub.questId}`);
    const snap = await tx.get(gqRef);
    gq = snap.exists ? (snap.data() as GlobalQuest) : null;
  }

  let reviewerName: string | null = null;
  let reviewerPoints: number | null = null;
  if (opts.reviewer && isId(opts.reviewer)) {
    const snap = await tx.get(db.doc(`players/${opts.reviewer}`));
    reviewerName = snap.exists ? ((snap.data() as Player).displayName ?? null) : null;
    reviewerPoints = snap.exists ? ((snap.data() as Player).points ?? 0) : null;
  }

  const dealing = opts.dealing && sub.kind === 'personal' ? await readDealing(tx, db, sub.uid) : { pool: [], open: 0 };
  let postRefs: DocRef[] = [];
  if (opts.posts) {
    const posts = await tx.get(db.collection('feed').where('submissionId', '==', id));
    postRefs = posts.docs.filter((d) => d.get('type') === 'approved' || d.get('type') === 'global-won').map((d) => d.ref);
  }

  return {
    id,
    subRef: db.doc(`submissions/${id}`),
    sub,
    settings,
    playerRef,
    player: playerSnap.exists ? (playerSnap.data() as Player) : null,
    questRef,
    quest,
    gqRef,
    gq,
    reviewerName,
    reviewerPoints,
    postRefs,
    dealing,
  };
}

export interface ReviewEnv {
  tx: Txn;
  db: Db;
  now: Date;
  rng: () => number;
  /** The reviewer's uid. */
  by: string;
  /** The game's pack (its words) and the rule set in force, resolved once for this transaction. */
  pack: GamePack;
  scoring: Scoring;
}

/** "side quest" → "side-quest", for use as a modifier. */
export const hyphenated = (noun: string): string => noun.replace(/ /g, '-');

function requirePlayerDoc(L: Loaded): Player {
  if (!L.player) fail('failed-precondition', 'The submitter is not a player.');
  return L.player;
}

/** Throws failed-precondition unless a personal claim's quest still allows an approval. */
export function assertApprovable(L: Loaded, pack: GamePack): void {
  requirePlayerDoc(L);
  if (!L.quest || (L.quest.status !== 'active' && L.quest.status !== 'submitted')) {
    fail('failed-precondition', `That ${termForms(pack.terms).quest.one} can no longer be completed.`);
  }
}

/** Approve a personal claim: award points, complete the quest, refill the hand and post it. Returns the submission update. */
export function approveClaim(env: ReviewEnv, L: Loaded, note: string | null): Record<string, unknown> {
  assertApprovable(L, env.pack);
  const player = requirePlayerDoc(L);
  const { tx, db, now, by } = env;
  const t = termForms(env.pack.terms);
  const { sub, settings } = L;
  const quest = L.quest as Quest;
  const questRef = L.questRef as DocRef;

  const balances = new Map([[sub.uid, player.points]]);
  if (L.reviewerPoints !== null) balances.set(by, L.reviewerPoints);
  const { applied: appliedBy } = applyScore(
    tx,
    db,
    now,
    env.scoring,
    { kind: 'questApproved', uid: sub.uid, approver: by, questPoints: quest.points ?? null },
    balances,
    { ref: L.id, by },
    { [sub.uid]: { questsCompleted: (player.questsCompleted ?? 0) + 1 } },
  );
  const applied = appliedBy.get(sub.uid) ?? 0;
  tx.update(questRef, { status: 'done', completedAt: toTs(now), submissionId: L.id });

  // A finished quest uses up its slot; it is only refilled when the GM turned that on (and never above five).
  L.dealing.open -= 1;
  const refillQuestId = settings.refillOnComplete
    ? dealReplacement(tx, db, now, env.rng, sub.uid, L.dealing, settings.starterQuestCount)
    : null;
  const reveal = settings.revealOnComplete;
  const feedId = addFeed(tx, db, now, {
    type: 'approved',
    text:
      (reveal ? `${player.displayName} completed "${quest.title}"` : `${player.displayName} completed a secret ${t.quest.one}`) +
      ` — witnessed by ${L.reviewerName ?? `the ${t.gm.one}`}`,
    uid: sub.uid,
    ref: L.id,
    actorUid: by,
    note,
    points: applied,
    submissionId: L.id,
    questTitle: reveal ? quest.title : null,
    photoURL: player.photoURL ?? null,
  });

  return {
    status: 'approved',
    pointsAwarded: applied,
    reviewedBy: by,
    reviewedAt: toTs(now),
    reviewNote: note,
    questTitle: reveal ? quest.title : null,
    refillQuestId,
    feedId,
    // The witness has seen the claim; once approved, a hidden quest stays hidden.
    ...(reveal ? {} : { claimTitle: null, claimDescription: null }),
  };
}

/**
 * The witness or a GM rejects a pending personal claim: a small fine, and the quest is swapped for a
 * fresh one (its title was shown to the witness, so it is no longer secret). Posted to the feed.
 */
export function rejectClaim(env: ReviewEnv, L: Loaded, note: string | null): Record<string, unknown> {
  const player = requirePlayerDoc(L);
  const { tx, db, now, by } = env;
  const t = termForms(env.pack.terms);
  const { sub, settings } = L;

  const scored = applyScore(
    tx,
    db,
    now,
    env.scoring,
    { kind: 'claimRejected', uid: sub.uid },
    new Map([[sub.uid, player.points]]),
    { ref: L.id, by },
  );
  const applied = scored.applied.get(sub.uid) ?? 0;
  if (L.questRef && L.quest?.status === 'submitted' && L.quest.submissionId === L.id) {
    tx.update(L.questRef, { status: 'replaced' });
    L.dealing.open -= 1;
    dealReplacement(tx, db, now, env.rng, sub.uid, L.dealing, settings.starterQuestCount);
  }
  const reveal = settings.revealOnComplete;
  addFeed(tx, db, now, {
    type: 'rejected',
    text:
      `${L.reviewerName ?? `The ${t.gm.One}`} rejected ${player.displayName}'s ${t.claim.one}` +
      (reveal && L.quest ? ` for "${L.quest.title}"` : ''),
    uid: sub.uid,
    ref: L.id,
    actorUid: by,
    note,
    points: applied,
    submissionId: L.id,
    questTitle: reveal && L.quest ? L.quest.title : null,
    photoURL: player.photoURL ?? null,
  });
  return { status: 'rejected', reviewedBy: by, reviewedAt: toTs(now), reviewNote: note };
}

/** GM rejects a side-quest entry that has not been decided yet: nothing was paid, so nothing to take back. */
export function rejectEntry(env: ReviewEnv, note: string | null): Record<string, unknown> {
  return { status: 'rejected', reviewedBy: env.by, reviewedAt: toTs(env.now), reviewNote: note };
}

/**
 * GM overrides an approved submission as fraud (a personal claim, or disqualifying a side-quest entry):
 * take back what it paid, fine the player, undo what it did, flag the original posts and post the
 * override publicly. Returns the submission update.
 */
export function overrideAsFraud(env: ReviewEnv, L: Loaded, note: string | null): Record<string, unknown> {
  const player = requirePlayerDoc(L);
  const { tx, db, now, by } = env;
  const t = termForms(env.pack.terms);
  const { sub, settings } = L;

  // Sequential on the running total, so pointsFloorZero clamps the fine rather than the refund.
  const reversal = applyPoints(
    tx,
    db,
    now,
    settings,
    { uid: sub.uid, current: player.points, delta: -(sub.pointsAwarded ?? 0), reason: 'reversal', ref: L.id, by },
    sub.kind === 'personal' ? { questsCompleted: Math.max(0, (player.questsCompleted ?? 0) - 1) } : {},
  );
  const fine = applyScore(
    tx,
    db,
    now,
    env.scoring,
    { kind: 'fraudFine', uid: sub.uid },
    new Map([[sub.uid, reversal.total]]),
    { ref: L.id, by },
  );

  if (sub.kind === 'personal') {
    // The quest is gone for good; the refill stays, or a fresh quest is dealt if there was none.
    if (L.questRef && L.quest?.status === 'done') {
      tx.update(L.questRef, { status: 'replaced' });
      // (A done quest was not open, so the open count is unchanged by replacing it.)
      if (!sub.refillQuestId) dealReplacement(tx, db, now, env.rng, sub.uid, L.dealing, settings.starterQuestCount);
    }
  } else if (L.gq && L.gqRef && L.gq.winningSubmissionIds?.includes(L.id)) {
    // A disqualified winner loses the bonus (it is part of pointsAwarded) and their place among the winners.
    tx.update(L.gqRef, {
      winnerUids: (L.gq.winnerUids ?? []).filter((uid) => uid !== sub.uid),
      winningSubmissionIds: L.gq.winningSubmissionIds.filter((id) => id !== L.id),
    });
  }

  for (const ref of L.postRefs) tx.update(ref, { flagged: true });
  addFeed(tx, db, now, {
    type: 'fraud',
    text:
      `${L.reviewerName ?? `The ${t.gm.One}`} overturned ${player.displayName}'s ` +
      (sub.kind === 'personal' ? t.quest.one : `${hyphenated(t.sideQuest.one)} entry`) +
      ' as fraud',
    uid: sub.uid,
    ref: L.id,
    actorUid: by,
    note,
    points: reversal.applied + (fine.applied.get(sub.uid) ?? 0),
    submissionId: L.id,
    questTitle: sub.questTitle ?? null,
    photoURL: player.photoURL ?? null,
  });

  return {
    status: 'rejected',
    pointsAwarded: 0,
    reviewedBy: by,
    reviewedAt: toTs(now),
    reviewNote: note,
    questTitle: null,
    refillQuestId: null,
  };
}
