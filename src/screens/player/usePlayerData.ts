import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { tsMs, useCollection } from '../../data/hooks';
import { db } from '../../firebase';
import { playerRecord, type PlayerRecord } from '../../lib/record';
import type { Doc, LedgerEntry, Submission } from '../../shared';

/** A side quest the player won (one 'global-win' ledger line). */
export interface SideWin {
  id: string;
  submission: Doc<Submission> | null;
  title: string;
  bonus: number;
  /** Votes for the winning entry, when the side quest is still among the loaded ones. */
  votes: number | null;
  atMs: number;
  /** The GM disqualified the entry after the win (the bonus was taken back). */
  disqualified: boolean;
}

/** A side quest the player entered without winning. */
export interface SideEntry {
  id: string;
  title: string;
  votes: number | null;
}

export interface PlayerData {
  /** Newest first. */
  ledger: Doc<LedgerEntry>[];
  ledgerLoading: boolean;
  ledgerError: Error | null;
  record: PlayerRecord;
  /** Their approved submissions with a photo, newest first. */
  photos: Doc<Submission>[];
  /** Their approved personal claims, newest first. */
  achieved: Doc<Submission>[];
  wins: SideWin[];
  alsoEntered: SideEntry[];
  /** Their approved submissions by id. */
  subsById: Map<string, Doc<Submission>>;
  /** Reactions on each submission's feed post, when that post is among the loaded ones. */
  reactions: Map<string, number>;
}

/** Everything the player view shows about one player, from data the app already has plus their points ledger. */
export function usePlayerData(player: RankedPlayer): PlayerData {
  const { approved, globalQuests, feed } = useGame();
  const uid = player.id;
  const ledgerQ = useCollection<LedgerEntry>(`ledger:${uid}`, () => query(collection(db, 'pointsLedger'), where('uid', '==', uid)));

  const ledger = useMemo(() => [...ledgerQ.data].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)), [ledgerQ.data]);
  const theirs = useMemo(() => approved.filter((s) => s.uid === uid), [approved, uid]);

  const derived = useMemo(() => {
    const subsById = new Map(theirs.map((s) => [s.id, s]));
    const questById = new Map(globalQuests.map((q) => [q.id, q]));
    const votesFor = (sub: Doc<Submission> | null | undefined) => {
      const tally = sub ? questById.get(sub.questId)?.tally : null;
      return sub && tally ? (tally[sub.id] ?? 0) : null;
    };

    // A disqualification takes the award back against the same entry (ref = the submission id).
    const overruled = new Set(ledger.filter((e) => e.reason === 'fraud' && e.ref).map((e) => e.ref));
    const wins: SideWin[] = ledger
      .filter((e) => e.reason === 'global-win')
      .map((e) => {
        const sub = e.ref ? (subsById.get(e.ref) ?? null) : null;
        const quest = sub ? questById.get(sub.questId) : undefined;
        return {
          id: e.id,
          submission: sub,
          title: sub?.questTitle ?? quest?.title ?? 'Side quest',
          bonus: e.delta,
          votes: votesFor(sub),
          atMs: tsMs(e.createdAt),
          disqualified: overruled.has(e.ref),
        };
      });
    const wonIds = new Set(wins.map((w) => w.submission?.id).filter(Boolean));
    const alsoEntered: SideEntry[] = theirs
      .filter((s) => s.kind === 'global' && !wonIds.has(s.id))
      .map((s) => ({ id: s.id, title: s.questTitle ?? questById.get(s.questId)?.title ?? 'Side quest', votes: votesFor(s) }));

    const postReactions = new Map(feed.map((p) => [p.id, p.reactionCount ?? 0]));
    const reactions = new Map<string, number>();
    for (const s of theirs) {
      const count = s.feedId ? postReactions.get(s.feedId) : undefined;
      if (count) reactions.set(s.id, count);
    }

    return {
      subsById,
      wins,
      alsoEntered,
      reactions,
      photos: theirs.filter((s) => s.thumbPath),
      achieved: theirs.filter((s) => s.kind === 'personal'),
      record: playerRecord(uid, ledger, theirs, player.questsCompleted),
    };
  }, [theirs, globalQuests, feed, ledger, uid, player.questsCompleted]);

  return { ledger, ledgerLoading: ledgerQ.loading, ledgerError: ledgerQ.error, ...derived };
}
