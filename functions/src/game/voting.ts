// Side-quest checking and voting: shared by enterSideQuest/castVote/advanceGlobalQuest, the timer, fireGlobalQuest
// and endGame. Checking has no time limit: late entries come in until a GM opens the vote.
// The read helpers must run before any write in a transaction; the write helpers only write.
import type { DocRef, Txn } from '../shared/store/types.js';
import { termForms } from '../shared/packs/terms.js';
import type { GamePack } from '../shared/packs/types.js';
import { tallyVotes } from '../shared/votes.js';
import type { GlobalQuest, Player, Settings, Submission, Vote } from '../shared/types.js';
import type { Db } from './context.js';
import { addFeed } from './feed.js';
import { isPlaying, loadSettings, loadState } from './guards.js';
import { applyScore, scoringFor, type Scoring } from './ledger.js';
import { millis, MIN_MS, toTs } from './util.js';

/** A side quest with its doc ref. */
export interface Quest {
  id: string;
  ref: DocRef;
  gq: GlobalQuest;
}

/**
 * A live entry (a global submission) in a side quest: 'sealed' until voting opens, then 'approved'.
 * Disqualified (rejected) entries are never read.
 */
export interface Entry {
  id: string;
  ref: DocRef;
  data: Submission;
  /** The entry's feed post, when it has one that exists (set by attachPosts). */
  postRef?: DocRef | null;
}

const isLiveEntry = (data: Submission) => data.kind === 'global' && (data.status === 'sealed' || data.status === 'approved');

const byEntryOrder = (a: Entry, b: Entry) => millis(a.data.createdAt) - millis(b.data.createdAt) || (a.id < b.id ? -1 : 1);

/** Sealed and approved entries of one side quest, oldest first. */
export async function readEntries(tx: Txn, db: Db, questId: string): Promise<Entry[]> {
  const snap = await tx.get(db.collection('submissions').where('questId', '==', questId));
  return snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, data: d.data() as Submission }))
    .filter((e) => isLiveEntry(e.data))
    .sort(byEntryOrder);
}

/** Sealed and approved entries of every side quest, grouped by quest id. */
export async function readAllEntries(tx: Txn, db: Db): Promise<Map<string, Entry[]>> {
  const snap = await tx.get(db.collection('submissions').where('kind', '==', 'global'));
  const byQuest = new Map<string, Entry[]>();
  for (const d of snap.docs) {
    const data = d.data() as Submission;
    if (!isLiveEntry(data)) continue;
    const list = byQuest.get(data.questId) ?? [];
    list.push({ id: d.id, ref: d.ref, data });
    byQuest.set(data.questId, list);
  }
  for (const list of byQuest.values()) list.sort(byEntryOrder);
  return byQuest;
}

/** voterUid → the submission they voted for. */
export async function readVotes(tx: Txn, db: Db, questId: string): Promise<Map<string, string>> {
  const snap = await tx.get(db.collection(`globalQuests/${questId}/votes`));
  return new Map(snap.docs.map((d) => [d.id, (d.data() as Vote).submissionId]));
}

export async function readPlayers(tx: Txn, db: Db): Promise<Map<string, Player>> {
  const snap = await tx.get(db.collection('players'));
  return new Map(snap.docs.map((d) => [d.id, d.data() as Player]));
}

/** The entries that can be voted for: the ones that have been revealed. */
export const revealedEntries = (entries: Entry[]): Entry[] => entries.filter((e) => e.data.status === 'approved');

/**
 * Looks up the feed posts of the sealed entries about to be revealed. Reads only: call before any
 * write, for every entry that startVoting will be given.
 */
export async function attachPosts(tx: Txn, db: Db, entries: Entry[]): Promise<void> {
  const sealed = entries.filter((e) => e.data.status === 'sealed' && e.data.feedId);
  if (sealed.length === 0) return;
  const posts = await tx.getAll(...sealed.map((e) => db.doc(`feed/${e.data.feedId}`)));
  sealed.forEach((entry, i) => {
    entry.postRef = posts[i].exists ? posts[i].ref : null;
  });
}

/** Players still playing who have at least one entry by someone else to choose from. */
export function eligibleVoters(players: Map<string, Player>, entries: Entry[]): string[] {
  return [...players].filter(([uid, p]) => isPlaying(p) && entries.some((e) => e.data.uid !== uid)).map(([uid]) => uid);
}

/**
 * Entries are done: open the vote. Every sealed entry is revealed — it becomes 'approved' (votable) and
 * its current evidence goes onto its feed post. All routes into voting come through here.
 */
export function startVoting(tx: Txn, db: Db, now: Date, settings: Settings, q: Quest, entries: Entry[]): void {
  for (const entry of entries.filter((e) => e.data.status === 'sealed')) {
    tx.update(entry.ref, { status: 'approved' });
    if (entry.postRef) {
      tx.update(entry.postRef, {
        imagePath: entry.data.imagePath ?? null,
        thumbPath: entry.data.thumbPath ?? null,
        caption: entry.data.caption ?? null,
      });
    }
  }
  tx.update(q.ref, { status: 'voting', votingEndsAt: toTs(new Date(now.getTime() + settings.voteWindowMin * MIN_MS)) });
  addFeed(tx, db, now, {
    type: 'voting-open',
    text: `Voting is open: ${q.gq.title}`,
    uid: null,
    ref: q.id,
    questTitle: q.gq.title,
  });
}

/**
 * A live side quest's time is up (window over, everyone in, or a GM moved it on): the GMs check the entries. Late
 * entries are still taken until a GM opens the vote, which only a GM does. `by` is the GM who closed it, if one did.
 */
export function startChecking(tx: Txn, db: Db, now: Date, pack: GamePack, q: Quest, by: string | null = null): void {
  tx.update(q.ref, { status: 'checking' });
  addFeed(tx, db, now, {
    type: 'checking',
    text: `Time's up: ${q.gq.title}. Late entries still count until the ${termForms(pack.terms).gm.one} opens voting`,
    uid: null,
    ref: q.id,
    actorUid: by,
    questTitle: q.gq.title,
  });
}

/**
 * A GM opens the vote on a checking side quest: the entries left go in, unchecked ones included; nothing left
 * means no winner. Call attachPosts on `entries` first.
 */
export function finishChecking(tx: Txn, db: Db, now: Date, settings: Settings, q: Quest, entries: Entry[]): 'voting' | 'closed' {
  if (entries.length === 0) {
    closeWithoutWinner(tx, q);
    return 'closed';
  }
  startVoting(tx, db, now, settings, q, entries);
  return 'voting';
}

/** Close a side quest nobody entered (or one ended early): no winners. */
export function closeWithoutWinner(tx: Txn, q: Quest): void {
  tx.update(q.ref, { status: 'closed', winnerUids: [], winningSubmissionIds: [], tally: {} });
}

/**
 * Tally the votes and close the side quest: the most-voted entries each win the full bonus
 * (ties all win, no votes means no winner). The tally is published on the quest.
 */
export function closeWithTally(
  tx: Txn,
  db: Db,
  now: Date,
  pack: GamePack,
  scoring: Scoring,
  q: Quest,
  entries: Entry[],
  votes: Map<string, string>,
  players: Map<string, Player>,
): void {
  const t = termForms(pack.terms);
  // Only revealed entries can be voted for or win.
  entries = revealedEntries(entries);
  const { counts, winners } = tallyVotes([...votes.values()], entries.map((e) => e.id));
  const winnerUids: string[] = [];
  const winningSubmissionIds: string[] = [];

  for (const entry of entries.filter((e) => winners.includes(e.id))) {
    const uid = entry.data.uid;
    const player = players.get(uid);
    winnerUids.push(uid);
    winningSubmissionIds.push(entry.id);
    // The rule set decides the bonus; a winner who has no player doc gets nothing (applyScore skips them).
    const { applied: changes } = applyScore(
      tx,
      db,
      now,
      scoring,
      { kind: 'sideQuestWon', uid, bonus: q.gq.bonusPoints, votes: counts[entry.id] },
      new Map(player ? [[uid, player.points]] : []),
      { ref: entry.id, by: 'system' },
    );
    const applied = changes.get(uid) ?? 0;
    // What was paid is part of the entry's award, so a later disqualification takes it back.
    tx.update(entry.ref, { pointsAwarded: (entry.data.pointsAwarded ?? 0) + applied });
    addFeed(tx, db, now, {
      type: 'global-won',
      text: `${player?.displayName ?? 'Someone'} won the ${t.sideQuest.one} "${q.gq.title}" with ${counts[entry.id]} ${counts[entry.id] === 1 ? 'vote' : 'votes'}`,
      uid,
      ref: entry.id,
      submissionId: entry.id,
      questTitle: q.gq.title,
      points: applied,
      photoURL: player?.photoURL ?? null,
      imagePath: entry.data.imagePath ?? null,
      thumbPath: entry.data.thumbPath ?? null,
      caption: entry.data.caption ?? null,
    });
  }

  tx.update(q.ref, { status: 'closed', winnerUids, winningSubmissionIds, tally: counts });
}

/**
 * endGame: tally every side quest still in voting (paying its winners) and close the live and checking ones
 * with no winner, so the frozen standings include everything that was decided.
 */
export async function settleOpenQuests(db: Db, now: Date, pack: GamePack): Promise<void> {
  const isOpen = (status: unknown) => status === 'live' || status === 'checking' || status === 'voting';
  const open = (await db.collection('globalQuests').get()).docs.filter((d) => isOpen(d.get('status')));
  for (const doc of open) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const gq = snap.data() as GlobalQuest | undefined;
      if (!gq || !isOpen(gq.status)) return;
      const q: Quest = { id: doc.id, ref: doc.ref, gq };
      if (gq.status !== 'voting') {
        closeWithoutWinner(tx, q);
        return;
      }
      const state = await loadState(db, tx);
      const settings = await loadSettings(db, tx);
      const entries = await readEntries(tx, db, doc.id);
      const votes = await readVotes(tx, db, doc.id);
      const players = await readPlayers(tx, db);
      closeWithTally(tx, db, now, pack, scoringFor(pack, settings, state, now), q, entries, votes, players);
    });
  }
}
