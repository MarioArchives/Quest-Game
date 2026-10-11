import type { GlobalQuest, GlobalQuestStatus, Submission } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { parseEvidence } from './evidence.js';
import { addFeed } from './feed.js';
import { fail, isPlaying, loadSettings, loadState, requireGM, requirePlayer } from './guards.js';
import type { PushPlan } from './push.js';
import { asId, millis, toTs } from './util.js';
import {
  closeWithTally,
  attachPosts,
  eligibleVoters,
  finishChecking,
  readEntries,
  readPlayers,
  readVotes,
  revealedEntries,
  startChecking,
} from './voting.js';

const NOTE_MAX = 500;

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

    const entries = revealedEntries(await readEntries(tx, db, questId));
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

/**
 * GM moves a side quest on: live → checking (late entries still come in), checking → voting (unchecked entries go
 * in; closed with no winner when there are none), or voting → closed (with the tally). Only a GM opens the vote.
 */
export async function advanceGlobalQuest(
  db: Db,
  ctx: Ctx,
  data: { globalQuestId?: unknown },
): Promise<{ status: GlobalQuestStatus }> {
  return db.runTransaction(async (tx) => {
    const by = await requireGM(db, ctx, tx);
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
      startChecking(tx, db, ctx.now, q, by);
      return { status: 'checking' as const };
    }
    if (gq.status === 'checking') {
      await attachPosts(tx, db, entries);
      return { status: finishChecking(tx, db, ctx.now, settings, q, entries) };
    }
    const votes = await readVotes(tx, db, questId);
    const players = await readPlayers(tx, db);
    closeWithTally(tx, db, ctx.now, settings, q, entries, votes, players);
    return { status: 'closed' as const };
  });
}

/**
 * Enter a side quest directly with evidence — no witness. The entry is created 'sealed' (pays nothing; hidden from
 * other players, the feed only says who entered) and is revealed, with its evidence, when voting opens. One entry
 * per player per side quest. Entries are taken while it is live and, late, while the GMs check (until a GM opens the
 * vote). When every player has entered a live side quest, its time is up at once and the GMs check the entries.
 */
export async function enterSideQuest(
  db: Db,
  ctx: Ctx,
  data: { globalQuestId?: unknown; imagePath?: unknown; thumbPath?: unknown; caption?: unknown },
): Promise<{ submissionId: string; checking: boolean; late: boolean }> {
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', 'Side quests can only be entered while the game is running.');

    const questId = asId(data.globalQuestId, 'globalQuestId');
    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', 'No such side quest.');
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status !== 'live' && gq.status !== 'checking') {
      fail('failed-precondition', 'Voting has started on this side quest, so entries are closed.');
    }
    // Past the window (the timer moves it to checking within 15 min) or while the GMs check: a late entry.
    const late = gq.status === 'checking' || ctx.now.getTime() >= millis(gq.endsAt);
    const evidence = parseEvidence(uid, data);

    const entries = await readEntries(tx, db, questId);
    const mine = await tx.get(db.collection('submissions').where('questId', '==', questId).where('uid', '==', uid));
    if (mine.docs.some((d) => d.get('kind') === 'global' && d.get('status') !== 'rejected')) {
      fail('already-exists', 'You have already entered this side quest.');
    }
    const players = gq.status === 'live' ? await readPlayers(tx, db) : new Map();

    // Everyone still playing in on a live side quest (sealed entries count)? Then time's up: the GMs check them.
    const entrants = new Set([...entries.map((e) => e.data.uid), uid]);
    const checking = gq.status === 'live' && [...players].every(([p, doc]) => !isPlaying(doc) || entrants.has(p));

    const entryRef = db.collection('submissions').doc();
    const now = toTs(ctx.now);
    const photo = {
      imagePath: evidence.imagePath ?? null,
      thumbPath: evidence.thumbPath ?? null,
      caption: evidence.caption ?? null,
    };
    // The post only says who entered; the evidence goes onto it when the entry is revealed.
    const feedId = addFeed(tx, db, ctx.now, {
      type: 'approved',
      text: `${player.displayName} entered the side quest "${gq.title}"`,
      uid,
      ref: entryRef.id,
      submissionId: entryRef.id,
      questTitle: gq.title,
      photoURL: player.photoURL ?? null,
    });
    const entry: Submission = {
      uid,
      kind: 'global',
      questId,
      createdAt: now,
      status: 'sealed',
      pointsAwarded: 0,
      ...photo,
      evidenceAt: now,
      processedAt: now,
      feedId,
      questTitle: gq.title,
    } as Submission;
    tx.create(entryRef, entry);

    if (checking) startChecking(tx, db, ctx.now, { id: questId, ref: questRef, gq });
    return { submissionId: entryRef.id, checking, late };
  });
}

/**
 * A GM checks a side-quest entry once time is up, before the vote: accept it, or reject it (thrown out with no fine;
 * only its owner is told, with the note). Nobody checks their own entry. The vote waits for a GM to open it
 * (advanceGlobalQuest), so late entries can still be checked. Disqualifying with a fine stays with
 * reviewSubmission. `push` is for the caller to send after the transaction.
 */
export async function checkEntry(
  db: Db,
  ctx: Ctx,
  data: { submissionId?: unknown; accept?: unknown; note?: unknown },
): Promise<{ checked: 'accepted' | 'rejected'; status: GlobalQuestStatus; push: PushPlan | null }> {
  return db.runTransaction(async (tx) => {
    const by = await requireGM(db, ctx, tx);
    const id = asId(data.submissionId, 'submissionId');
    if (typeof data.accept !== 'boolean') fail('invalid-argument', 'accept must be true or false.');
    let note: string | null = null;
    if (data.note !== undefined && data.note !== null) {
      if (typeof data.note !== 'string' || data.note.length > NOTE_MAX) {
        fail('invalid-argument', `The note must be text of at most ${NOTE_MAX} characters.`);
      }
      note = data.note.trim() || null;
    }
    const accept = data.accept;

    const subRef = db.doc(`submissions/${id}`);
    const subSnap = await tx.get(subRef);
    if (!subSnap.exists) fail('not-found', 'No such entry.');
    const sub = subSnap.data() as Submission;
    if (sub.kind !== 'global') fail('invalid-argument', 'That is not a side-quest entry.');
    if (sub.uid === by) fail('permission-denied', 'You cannot check your own entry.');
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');

    const questRef = db.doc(`globalQuests/${sub.questId}`);
    const questSnap = await tx.get(questRef);
    const gq = questSnap.data() as GlobalQuest | undefined;
    if (!gq || gq.status !== 'checking') {
      fail('failed-precondition', "Entries are checked once time is up and before voting opens.");
    }
    if (sub.status !== 'sealed') fail('failed-precondition', 'That entry has already been thrown out.');

    const decided = { checked: accept ? 'accepted' : 'rejected', reviewedBy: by, reviewedAt: toTs(ctx.now), reviewNote: note };
    tx.update(subRef, accept ? decided : { ...decided, status: 'rejected' });
    const push: PushPlan | null = accept
      ? null
      : {
          to: [sub.uid],
          exclude: by,
          message: {
            title: 'Entry not accepted',
            body: `Your entry for "${gq.title}" was not accepted${note ? `: ${note}` : '.'}`,
            link: '#/account',
          },
        };
    return { checked: accept ? ('accepted' as const) : ('rejected' as const), status: 'checking' as const, push };
  });
}
