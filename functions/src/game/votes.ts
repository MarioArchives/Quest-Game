import type { GlobalQuest, GlobalQuestStatus, Submission } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { parseEvidence } from './evidence.js';
import { addFeed } from './feed.js';
import { fail, loadSettings, loadState, requireGM, requirePlayer } from './guards.js';
import { asId, millis, toTs } from './util.js';
import {
  closeWithoutWinner,
  closeWithTally,
  eligibleVoters,
  readEntries,
  readPlayers,
  readVotes,
  startVoting,
} from './voting.js';

/**
 * A player votes for one approved entry of a side quest in 'voting' (not their own). Re-voting replaces
 * the vote. When every eligible voter has voted, voting closes at once. Returns whether it closed.
 */
export async function castVote(
  db: Db,
  ctx: Ctx,
  data: { globalQuestId?: unknown; submissionId?: unknown },
): Promise<{ closed: boolean }> {
  return db.runTransaction(async (tx) => {
    const { uid } = await requirePlayer(db, ctx, tx);
    const questId = asId(data.globalQuestId, 'globalQuestId');
    const submissionId = asId(data.submissionId, 'submissionId');

    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', 'No such side quest.');
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status !== 'voting') fail('failed-precondition', 'This side quest is not open for voting.');
    if (gq.votingEndsAt && ctx.now.getTime() >= millis(gq.votingEndsAt)) {
      fail('failed-precondition', 'Voting on this side quest has ended.');
    }

    const entries = await readEntries(tx, db, questId);
    const target = entries.find((e) => e.id === submissionId);
    if (!target) fail('invalid-argument', 'That is not an entry in this side quest.');
    if (target.data.uid === uid) fail('permission-denied', 'You cannot vote for your own entry.');

    const votes = await readVotes(tx, db, questId);
    const players = await readPlayers(tx, db);
    const settings = await loadSettings(db, tx);
    votes.set(uid, submissionId);

    tx.set(db.doc(`globalQuests/${questId}/votes/${uid}`), { submissionId, createdAt: toTs(ctx.now) });
    const allVoted = eligibleVoters(players, entries).every((voter) => votes.has(voter));
    if (allVoted) closeWithTally(tx, db, ctx.now, settings, { id: questId, ref: questRef, gq }, entries, votes, players);
    return { closed: allVoted };
  });
}

/** GM moves a side quest on early: live → voting, or voting → closed (with the tally). */
export async function advanceGlobalQuest(
  db: Db,
  ctx: Ctx,
  data: { globalQuestId?: unknown },
): Promise<{ status: GlobalQuestStatus }> {
  return db.runTransaction(async (tx) => {
    await requireGM(db, ctx, tx);
    const questId = asId(data.globalQuestId, 'globalQuestId');
    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', 'No such side quest.');
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status === 'closed') fail('failed-precondition', 'This side quest is already closed.');

    const settings = await loadSettings(db, tx);
    const entries = await readEntries(tx, db, questId);
    const q = { id: questId, ref: questRef, gq };

    if (gq.status === 'live') {
      if (entries.length === 0) {
        closeWithoutWinner(tx, q);
        return { status: 'closed' as const };
      }
      startVoting(tx, db, ctx.now, settings, q);
      return { status: 'voting' as const };
    }
    const votes = await readVotes(tx, db, questId);
    const players = await readPlayers(tx, db);
    closeWithTally(tx, db, ctx.now, settings, q, entries, votes, players);
    return { status: 'closed' as const };
  });
}

/**
 * Enter a live side quest directly with evidence — no witness, no review: the entry is created
 * 'approved' (votable, pays nothing) and posted to the feed. One entry per player per side quest.
 * When every player has entered, voting opens at once.
 */
export async function enterSideQuest(
  db: Db,
  ctx: Ctx,
  data: { globalQuestId?: unknown; imagePath?: unknown; thumbPath?: unknown; caption?: unknown },
): Promise<{ submissionId: string; votingOpened: boolean }> {
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Side quests can only be entered while the game is running.');

    const questId = asId(data.globalQuestId, 'globalQuestId');
    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', 'No such side quest.');
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status !== 'live' || ctx.now.getTime() >= millis(gq.endsAt)) {
      fail('failed-precondition', 'This side quest is not open for entries.');
    }
    const evidence = parseEvidence(uid, data);

    const entries = await readEntries(tx, db, questId);
    const mine = await tx.get(db.collection('submissions').where('questId', '==', questId).where('uid', '==', uid));
    if (mine.docs.some((d) => d.get('kind') === 'global' && d.get('status') !== 'rejected')) {
      fail('already-exists', 'You have already entered this side quest.');
    }
    const players = await readPlayers(tx, db);
    const settings = await loadSettings(db, tx);

    const entryRef = db.collection('submissions').doc();
    const now = toTs(ctx.now);
    const post = {
      imagePath: evidence.imagePath ?? null,
      thumbPath: evidence.thumbPath ?? null,
      caption: evidence.caption ?? null,
    };
    const feedId = addFeed(tx, db, ctx.now, {
      type: 'approved',
      text: `${player.displayName} entered the side quest "${gq.title}"`,
      uid,
      ref: entryRef.id,
      submissionId: entryRef.id,
      questTitle: gq.title,
      photoURL: player.photoURL ?? null,
      ...post,
    });
    const entry: Submission = {
      uid,
      kind: 'global',
      questId,
      createdAt: now,
      status: 'approved',
      pointsAwarded: 0,
      ...post,
      evidenceAt: now,
      processedAt: now,
      feedId,
      questTitle: gq.title,
    } as Submission;
    tx.create(entryRef, entry);

    // Everyone in? Then the vote starts straight away.
    const entrants = new Set([...entries.map((e) => e.data.uid), uid]);
    const everyoneEntered = [...players.keys()].every((p) => entrants.has(p));
    if (everyoneEntered) startVoting(tx, db, ctx.now, settings, { id: questId, ref: questRef, gq });
    return { submissionId: entryRef.id, votingOpened: everyoneEntered };
  });
}
