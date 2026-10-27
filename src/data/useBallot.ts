// The player's own ballot on one vote: what they've cast (their vote doc, readable only by them), how far they've got,
// and casting more. Optimistic: a pick or judgement shows at once, and is rolled back with a toast if it fails.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { castVote, friendlyError } from '../api';
import { useToast } from '../components/Toast';
import { t } from '../pack';
import { useSession } from '../session/SessionProvider';
import { voteStyleOf, type Doc, type GlobalQuest, type Judgement, type Submission, type VoteStyle } from '../shared';
import { ballotProgress, type BallotProgress } from '../lib/voteTakeover';
import { useGame } from './GameProvider';

export interface Ballot {
  style: VoteStyle;
  /** Pick one: the entry the vote is on (a pending one included), else null. */
  pick: string | null;
  /** Yes/no: the judgements made (pending ones included), by submission id. */
  judged: Record<string, Judgement>;
  progress: BallotProgress;
  /** Until the vote doc has loaded. */
  loading: boolean;
  /**
   * Pick one: `vote(sid)` moves the vote there. Yes/no: `vote(sid, 'yes' | 'no')`. Calls go one at a time per player
   * (the latest judgement per entry wins); resolves once sent, never rejects (a failure is a toast and a rollback).
   */
  vote(submissionId: string, judgement?: Judgement): Promise<void>;
}

/** What has been cast here but isn't on the vote doc yet. */
interface Pending {
  pick?: string;
  judged: Record<string, Judgement>;
}

/** The ballot of the signed-in player on `quest`, whose entries up for the vote are `entries` (theirs included). */
export function useBallot(quest: Doc<GlobalQuest>, entries: readonly Doc<Submission>[]): Ballot {
  const toast = useToast();
  const { user } = useSession();
  const { myBallots, myBallotsLoading } = useGame();
  const uid = user?.uid ?? null;
  const style = voteStyleOf(quest);
  const doc = myBallots.get(quest.id) ?? null;
  const [pending, setPending] = useState<Pending>({ judged: {} });

  // A pending vote is dropped once the vote doc shows it.
  useEffect(() => {
    setPending((prev) => {
      let next: Pending | null = null;
      if (prev.pick !== undefined && doc?.submissionId === prev.pick) next = { ...prev, pick: undefined };
      for (const [sid, j] of Object.entries(prev.judged)) {
        if (doc?.ballot?.[sid] === j) {
          next ??= { ...prev };
          next.judged = { ...next.judged };
          delete next.judged[sid];
        }
      }
      return next ?? prev;
    });
  }, [doc]);

  // The calls go out one at a time; the latest wish per entry (or for the pick) wins.
  const wanted = useRef(new Map<string, Judgement | string>());
  const draining = useRef<Promise<void> | null>(null);
  const questId = quest.id;

  const drain = useCallback(async () => {
    while (wanted.current.size > 0) {
      const [key, value] = wanted.current.entries().next().value as [string, Judgement | string];
      wanted.current.delete(key);
      const isPick = style === 'pick';
      try {
        const { closed } = await castVote(isPick ? { globalQuestId: questId, submissionId: value } : { globalQuestId: questId, submissionId: key, vote: value as Judgement });
        if (closed) toast(`That was the last vote. The result is in the ${t.feed.one}.`, 'success');
      } catch (err) {
        setPending((prev) => {
          if (isPick) return { ...prev, pick: undefined };
          const judged = { ...prev.judged };
          delete judged[key];
          return { ...prev, judged };
        });
        toast(friendlyError(err), 'error');
      }
    }
    draining.current = null;
  }, [questId, style, toast]);

  const vote = useCallback(
    (submissionId: string, judgement?: Judgement): Promise<void> => {
      if (!uid) return Promise.resolve();
      if (style === 'pick') {
        setPending((prev) => ({ ...prev, pick: submissionId }));
        wanted.current.set('pick', submissionId);
      } else {
        if (!judgement) return Promise.resolve();
        setPending((prev) => ({ ...prev, judged: { ...prev.judged, [submissionId]: judgement } }));
        wanted.current.set(submissionId, judgement);
      }
      draining.current ??= drain();
      return draining.current;
    },
    [uid, style, drain],
  );

  const pick = pending.pick ?? doc?.submissionId ?? null;
  const judged = useMemo(() => ({ ...(doc?.ballot ?? {}), ...pending.judged }), [doc, pending.judged]);
  const progress = useMemo(
    () => ballotProgress({ voteStyle: style }, { submissionId: pick ?? undefined, ballot: judged }, entries, uid ?? ''),
    [style, pick, judged, entries, uid],
  );

  return { style, pick, judged, progress, loading: Boolean(uid) && myBallotsLoading, vote };
}
