// Side-quest voting: shared by enterSideQuest/castVote/advanceGlobalQuest, the timer and endGame.
// The read helpers must run before any write in a transaction; the write helpers only write.
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { tallyVotes } from '../shared/votes.js';
import type { GlobalQuest, Player, Settings, Submission, Vote } from '../shared/types.js';
import type { Db } from './context.js';
import { addFeed } from './feed.js';
import { loadSettings } from './guards.js';
import { applyPoints } from './ledger.js';
import { millis, MIN_MS, toTs } from './util.js';

/** A side quest with its doc ref. */
export interface Quest {
  id: string;
  ref: DocumentReference;
  gq: GlobalQuest;
}

/** An approved entry (a global submission) in a side quest. */
export interface Entry {
  id: string;
  ref: DocumentReference;
  data: Submission;
}

const byEntryOrder = (a: Entry, b: Entry) => millis(a.data.createdAt) - millis(b.data.createdAt) || (a.id < b.id ? -1 : 1);

/** Approved entries of one side quest, oldest first. */
export async function readEntries(tx: Transaction, db: Db, questId: string): Promise<Entry[]> {
  const snap = await tx.get(db.collection('submissions').where('questId', '==', questId));
  return snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, data: d.data() as Submission }))
    .filter((e) => e.data.kind === 'global' && e.data.status === 'approved')
    .sort(byEntryOrder);
}

/** Approved entries of every side quest, grouped by quest id. */
export async function readAllEntries(tx: Transaction, db: Db): Promise<Map<string, Entry[]>> {
  const snap = await tx.get(db.collection('submissions').where('kind', '==', 'global').where('status', '==', 'approved'));
  const byQuest = new Map<string, Entry[]>();
  for (const d of snap.docs) {
    const data = d.data() as Submission;
    const list = byQuest.get(data.questId) ?? [];
    list.push({ id: d.id, ref: d.ref, data });
    byQuest.set(data.questId, list);
  }
  for (const list of byQuest.values()) list.sort(byEntryOrder);
  return byQuest;
}

/** voterUid → the submission they voted for. */
export async function readVotes(tx: Transaction, db: Db, questId: string): Promise<Map<string, string>> {
  const snap = await tx.get(db.collection(`globalQuests/${questId}/votes`));
  return new Map(snap.docs.map((d) => [d.id, (d.data() as Vote).submissionId]));
}

export async function readPlayers(tx: Transaction, db: Db): Promise<Map<string, Player>> {
  const snap = await tx.get(db.collection('players'));
  return new Map(snap.docs.map((d) => [d.id, d.data() as Player]));
}

/** Players who have at least one entry by someone else to choose from. */
export function eligibleVoters(players: Map<string, Player>, entries: Entry[]): string[] {
  return [...players.keys()].filter((uid) => entries.some((e) => e.data.uid !== uid));
}

/** Entries are done: open the vote. */
export function startVoting(tx: Transaction, db: Db, now: Date, settings: Settings, q: Quest): void {
  tx.update(q.ref, { status: 'voting', votingEndsAt: toTs(new Date(now.getTime() + settings.voteWindowMin * MIN_MS)) });
  addFeed(tx, db, now, {
    type: 'voting-open',
    text: `Voting is open: ${q.gq.title}`,
    uid: null,
    ref: q.id,
    questTitle: q.gq.title,
  });
}

/** Close a side quest nobody entered (or one ended early): no winners. */
export function closeWithoutWinner(tx: Transaction, q: Quest): void {
  tx.update(q.ref, { status: 'closed', winnerUids: [], winningSubmissionIds: [], tally: {} });
}

/**
 * Tally the votes and close the side quest: the most-voted entries each win the full bonus
 * (ties all win, no votes means no winner). The tally is published on the quest.
 */
export function closeWithTally(
  tx: Transaction,
  db: Db,
  now: Date,
  settings: Settings,
  q: Quest,
  entries: Entry[],
  votes: Map<string, string>,
  players: Map<string, Player>,
): void {
  const { counts, winners } = tallyVotes([...votes.values()], entries.map((e) => e.id));
  const winnerUids: string[] = [];
  const winningSubmissionIds: string[] = [];

  for (const entry of entries.filter((e) => winners.includes(e.id))) {
    const uid = entry.data.uid;
    const player = players.get(uid);
    winnerUids.push(uid);
    winningSubmissionIds.push(entry.id);
    let applied = 0;
    if (player) {
      applied = applyPoints(tx, db, now, settings, {
        uid,
        current: player.points,
        delta: q.gq.bonusPoints,
        reason: 'global-win',
        ref: entry.id,
        by: 'system',
      }).applied;
    }
    // The bonus is part of the entry's award, so a later disqualification takes it back.
    tx.update(entry.ref, { pointsAwarded: (entry.data.pointsAwarded ?? 0) + q.gq.bonusPoints });
    addFeed(tx, db, now, {
      type: 'global-won',
      text: `${player?.displayName ?? 'Someone'} won the side quest "${q.gq.title}" with ${counts[entry.id]} ${counts[entry.id] === 1 ? 'vote' : 'votes'}`,
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
 * endGame: tally every side quest still in voting (paying its winners) and close the live ones with
 * no winner, so the frozen standings include everything that was decided.
 */
export async function settleOpenQuests(db: Db, now: Date): Promise<void> {
  const open = (await db.collection('globalQuests').get()).docs.filter(
    (d) => d.get('status') === 'live' || d.get('status') === 'voting',
  );
  for (const doc of open) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const gq = snap.data() as GlobalQuest | undefined;
      if (!gq || (gq.status !== 'live' && gq.status !== 'voting')) return;
      const q: Quest = { id: doc.id, ref: doc.ref, gq };
      if (gq.status === 'live') {
        closeWithoutWinner(tx, q);
        return;
      }
      const settings = await loadSettings(db, tx);
      const entries = await readEntries(tx, db, doc.id);
      const votes = await readVotes(tx, db, doc.id);
      const players = await readPlayers(tx, db);
      closeWithTally(tx, db, now, settings, q, entries, votes, players);
    });
  }
}
