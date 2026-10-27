import { termForms } from '../shared/packs/terms.js';
import type { Txn } from '../shared/store/types.js';
import { ballotComplete, voteStyleOf } from '../shared/votes.js';
import type { Assignment, GlobalQuest, GlobalQuestStatus, Judgement, Player, Submission, Vote } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { parseEvidence } from './evidence.js';
import { addFeed } from './feed.js';
import { fail, isPlaying, loadSettings, loadState, requireGM, requirePlayer } from './guards.js';
import { scoringFor } from './ledger.js';
import { pushAllowed, type PushPlan } from './push.js';
import { asId, millis, toTs } from './util.js';
import {
  closeWithTally,
  attachPosts,
  type Entry,
  type Quest,
  eligibleVoters,
  isUnchecked,
  moveOn,
  readMoveOn,
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
  data: { globalQuestId?: unknown; submissionId?: unknown; vote?: unknown },
): Promise<{ closed: boolean }> {
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.sideQuests) fail('failed-precondition', `${t.sideQuest.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const { uid } = await requirePlayer(db, ctx, tx);
    const questId = asId(data.globalQuestId, 'globalQuestId');
    const submissionId = asId(data.submissionId, 'submissionId');

    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', `No such ${t.sideQuest.one}.`);
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status !== 'voting') fail('failed-precondition', `This ${t.sideQuest.one} is not open for voting.`);
    if (gq.votingEndsAt && ctx.now.getTime() >= millis(gq.votingEndsAt)) {
      fail('failed-precondition', `Voting on this ${t.sideQuest.one} has ended.`);
    }

    const entries = revealedEntries(await readEntries(tx, db, questId));
    const target = entries.find((e) => e.id === submissionId);
    if (!target) fail('invalid-argument', `That is not an entry in this ${t.sideQuest.one}.`);
    if (target.data.uid === uid) fail('permission-denied', 'You cannot vote for your own entry.');

    const yesNo = voteStyleOf(gq) === 'yesno';
    if (!yesNo && data.vote !== undefined) fail('invalid-argument', 'This is a one-vote pick: say which entry, not yes or no.');
    if (yesNo) return castJudgement(db, ctx, tx, { id: questId, ref: questRef, gq }, entries, submissionId, data.vote);

    const votes = await readVotes(tx, db, questId);
    const players = await readPlayers(tx, db);
    const settings = await loadSettings(db, tx);
    const state = await loadState(db, tx);
    votes.set(uid, { submissionId, createdAt: toTs(ctx.now) });

    tx.set(db.doc(`globalQuests/${questId}/votes/${uid}`), { submissionId, createdAt: toTs(ctx.now) });
    const allVoted = eligibleVoters(players, entries).every((voter) => votes.get(voter)?.submissionId !== undefined);
    if (allVoted) closeWithTally(tx, db, ctx.now, ctx.pack, scoringFor(ctx.pack, settings, state, ctx.now), { id: questId, ref: questRef, gq }, entries, votes, players);
    return { closed: allVoted };
  });
}

/**
 * A yes or a no on one entry of a yes/no vote. Only the voter's own vote doc is read, so judgements sent at the same time
 * don't make the transactions conflict; the other votes and the players are read only once this ballot is complete,
 * which is when it can be the last one in.
 */
async function castJudgement(
  db: Db,
  ctx: Ctx,
  tx: Txn,
  q: Quest,
  entries: Entry[],
  submissionId: string,
  judgement: unknown,
): Promise<{ closed: boolean }> {
  const uid = ctx.uid!;
  if (judgement !== 'yes' && judgement !== 'no') fail('invalid-argument', 'Say yes or no.');
  const voteRef = db.doc(`globalQuests/${q.id}/votes/${uid}`);
  const prev = (await tx.get(voteRef)).data() as Vote | undefined;
  const ballot = { ...(prev?.ballot ?? {}), [submissionId]: judgement as Judgement };
  const stamp = toTs(ctx.now);
  const mine = { ballot, createdAt: prev?.createdAt ?? stamp, updatedAt: stamp };
  if (!ballotComplete(ballot, entries.map((e) => ({ id: e.id, uid: e.data.uid })), uid)) {
    tx.set(voteRef, mine);
    return { closed: false };
  }
  const votes = await readVotes(tx, db, q.id);
  const players = await readPlayers(tx, db);
  const settings = await loadSettings(db, tx);
  const state = await loadState(db, tx);
  votes.set(uid, mine);
  tx.set(voteRef, mine);
  const done = eligibleVoters(players, entries).every((voter) =>
    ballotComplete(votes.get(voter)?.ballot, entries.map((e) => ({ id: e.id, uid: e.data.uid })), voter) && votes.has(voter),
  );
  if (done) closeWithTally(tx, db, ctx.now, ctx.pack, scoringFor(ctx.pack, settings, state, ctx.now), q, entries, votes, players);
  return { closed: done };
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
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.sideQuests) fail('failed-precondition', `${t.sideQuest.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const by = await requireGM(db, ctx, tx);
    const questId = asId(data.globalQuestId, 'globalQuestId');
    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', `No such ${t.sideQuest.one}.`);
    const gq = questSnap.data() as GlobalQuest;
    if (gq.status === 'closed') fail('failed-precondition', `This ${t.sideQuest.one} is already closed.`);

    const settings = await loadSettings(db, tx);
    const state = await loadState(db, tx);
    const entries = await readEntries(tx, db, questId);
    const q = { id: questId, ref: questRef, gq };

    if (gq.status === 'live') {
      const move = await readMoveOn(tx, db, [q]);
      return { status: moveOn(tx, db, ctx.now, ctx.pack, settings, scoringFor(ctx.pack, settings, state, ctx.now), q, move, by) };
    }
    if (gq.status === 'checking') {
      await attachPosts(tx, db, entries);
      const players = await readPlayers(tx, db);
      return { status: finishChecking(tx, db, ctx.now, settings, scoringFor(ctx.pack, settings, state, ctx.now), q, entries, players) };
    }
    const votes = await readVotes(tx, db, questId);
    const players = await readPlayers(tx, db);
    closeWithTally(tx, db, ctx.now, ctx.pack, scoringFor(ctx.pack, settings, state, ctx.now), q, entries, votes, players);
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
  data: { globalQuestId?: unknown; imagePath?: unknown; thumbPath?: unknown; videoPath?: unknown; caption?: unknown; taggedUid?: unknown },
): Promise<{ submissionId: string; checking: boolean; late: boolean }> {
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.sideQuests) fail('failed-precondition', `${t.sideQuest.Many} are not part of this game.`);
  return db.runTransaction(async (tx) => {
    const { uid, player } = await requirePlayer(db, ctx, tx);
    const state = await loadState(db, tx);
    if (state.status !== 'active') fail('failed-precondition', `${t.sideQuest.Many} can only be entered while the game is running.`);

    const questId = asId(data.globalQuestId, 'globalQuestId');
    const questRef = db.doc(`globalQuests/${questId}`);
    const questSnap = await tx.get(questRef);
    if (!questSnap.exists) fail('not-found', `No such ${t.sideQuest.one}.`);
    const gq = questSnap.data() as GlobalQuest;
    if (gq.kind === 'announce') fail('failed-precondition', 'This is an announcement: it takes no entries.');
    if (gq.status !== 'live' && gq.status !== 'checking') {
      fail('failed-precondition', `Voting has started on this ${t.sideQuest.one}, so entries are closed.`);
    }
    // Past the window (the timer moves it on soon) or while the GMs check: a late entry. A story mission takes none,
    // so the fastest entry and the fines are fair.
    const late = gq.status === 'checking' || ctx.now.getTime() >= millis(gq.endsAt);
    if (late && isUnchecked(gq)) fail('failed-precondition', `Time is up for this ${t.sideQuest.one}, so entries are closed.`);
    const evidence = parseEvidence(uid, data, { media: gq.entry?.media, captionRequired: gq.entry?.caption === 'required' });
    const taggedUid = await readTag(tx, db, uid, questId, gq, data.taggedUid);

    const entries = await readEntries(tx, db, questId);
    const mine = await tx.get(db.collection('submissions').where('questId', '==', questId).where('uid', '==', uid));
    if (mine.docs.some((d) => d.get('kind') === 'global' && d.get('status') !== 'rejected')) {
      fail('already-exists', `You have already entered this ${t.sideQuest.one}.`);
    }
    const players = gq.status === 'live' ? await readPlayers(tx, db) : new Map();

    // Everyone still playing in on a live side quest (sealed entries count)? Then time's up: the GMs check them, or
    // (a story mission) it goes straight on.
    const entrants = new Set([...entries.map((e) => e.data.uid), uid]);
    // (A long-running mission waits for its deadline however many are in.)
    const checking = gq.status === 'live' && !gq.longRun && [...players].every(([p, doc]) => !isPlaying(doc) || entrants.has(p));
    const q = { id: questId, ref: questRef, gq };
    const direct = checking && isUnchecked(gq);
    const settings = direct ? await loadSettings(db, tx) : null;
    const move = direct ? await readMoveOn(tx, db, [q]) : null;

    const entryRef = db.collection('submissions').doc();
    const now = toTs(ctx.now);
    const photo = {
      imagePath: evidence.imagePath ?? null,
      thumbPath: evidence.thumbPath ?? null,
      caption: evidence.caption ?? null,
    };
    // A video and the player it names are kept with the entry, and shown with it when it is revealed.
    const extras = { ...(evidence.videoPath ? { videoPath: evidence.videoPath } : {}), ...(taggedUid ? { taggedUid } : {}) };
    // The post only says who entered; the evidence goes onto it when the entry is revealed.
    const feedId = addFeed(tx, db, ctx.now, {
      type: 'approved',
      text: `${player.displayName} entered the ${t.sideQuest.one} "${gq.title}"`,
      uid,
      ref: entryRef.id,
      submissionId: entryRef.id,
      questTitle: gq.title,
      photoURL: player.photoURL ?? null,
      // The last one in moves it straight on, so this entry is revealed at once.
      ...(direct ? { imagePath: photo.imagePath, thumbPath: photo.thumbPath, caption: photo.caption, ...extras } : {}),
    });
    const entry: Submission = {
      uid,
      kind: 'global',
      questId,
      createdAt: now,
      status: direct ? 'approved' : 'sealed',
      pointsAwarded: 0,
      ...photo,
      ...extras,
      evidenceAt: now,
      processedAt: now,
      feedId,
      questTitle: gq.title,
    } as Submission;
    tx.create(entryRef, entry);

    if (direct) {
      // The new entry joins the others (already read) as the latest.
      const all = [...move!.entries.get(questId)!, { id: entryRef.id, ref: entryRef, data: entry }];
      moveOn(tx, db, ctx.now, ctx.pack, settings!, scoringFor(ctx.pack, settings!, state, ctx.now), q, { ...move!, entries: new Map([[questId, all]]) });
    } else if (checking) {
      startChecking(tx, db, ctx.now, ctx.pack, q);
    }
    return { submissionId: entryRef.id, checking, late };
  });
}

/**
 * The player an entry names, for a mission that takes one: with `tag: 'player'` the entrant picks a current player other
 * than themselves; with `tag: 'assigned'` it is the player they were dealt when it fired (a different one is refused). A
 * mission without a tag takes none. Reads only.
 */
async function readTag(tx: Txn, db: Db, uid: string, questId: string, gq: GlobalQuest, sent: unknown): Promise<string | null> {
  const tag = gq.entry?.tag;
  const given = sent !== undefined && sent !== null;
  if (!tag) {
    if (given) fail('invalid-argument', 'This does not take a player.');
    return null;
  }
  if (tag === 'assigned') {
    const dealt = await tx.get(db.doc(`assignments/${questId}_${uid}`));
    if (!dealt.exists) fail('failed-precondition', 'You were not dealt anyone for this one.');
    const target = (dealt.data() as Assignment).targetUid;
    if (given && sent !== target) fail('invalid-argument', 'That is not the player you were dealt.');
    return target;
  }
  if (typeof sent !== 'string' || sent.length === 0 || sent.includes('/')) fail('invalid-argument', 'Pick the player this is about.');
  if (sent === uid) fail('invalid-argument', 'Pick someone other than yourself.');
  const player = await tx.get(db.doc(`players/${sent as string}`));
  if (!player.exists || !isPlaying(player.data() as Player)) fail('invalid-argument', 'Pick a player who is in the game.');
  return sent as string;
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
  const t = termForms(ctx.pack.terms);
  if (!ctx.pack.features.sideQuests) fail('failed-precondition', `${t.sideQuest.Many} are not part of this game.`);
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
    if (sub.kind !== 'global') fail('invalid-argument', `That is not a ${t.sideQuest.one} entry.`);
    if (sub.uid === by) fail('permission-denied', 'You cannot check your own entry.');
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');

    const questRef = db.doc(`globalQuests/${sub.questId}`);
    const questSnap = await tx.get(questRef);
    const gq = questSnap.data() as GlobalQuest | undefined;
    if (gq && isUnchecked(gq)) fail('failed-precondition', `Entries to this ${t.sideQuest.one} are not checked: it goes straight on.`);
    if (!gq || gq.status !== 'checking') {
      fail('failed-precondition', "Entries are checked once time is up and before voting opens.");
    }
    if (sub.status !== 'sealed') fail('failed-precondition', 'That entry has already been thrown out.');

    const decided = { checked: accept ? 'accepted' : 'rejected', reviewedBy: by, reviewedAt: toTs(ctx.now), reviewNote: note };
    tx.update(subRef, accept ? decided : { ...decided, status: 'rejected' });
    const push: PushPlan | null = accept || !pushAllowed(ctx.pack, 'entry-rejected')
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
