import { collection, query, where } from 'firebase/firestore';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { tsMs, useCollection } from '../../data/hooks';
import { db } from '../../firebase';
import type { Doc, JoinRequest, Submission } from '../../shared';

export interface GmDataValue {
  /** Oldest request first. */
  pendingJoins: Doc<JoinRequest>[];
  /** Most recently turned away first. */
  rejectedJoins: Doc<JoinRequest>[];
  /** Waiting personal claims, oldest first. */
  pendingSubs: Doc<Submission>[];
  loading: boolean;
  error: Error | null;
}

const GmDataContext = createContext<GmDataValue | null>(null);

/** Listeners that several GM sections (and their count badges) share: join requests and the review queue. */
export function GmDataProvider({ children }: { children: ReactNode }) {
  const joinsQ = useCollection<JoinRequest>('gm:joins', () => collection(db, 'joinRequests'));
  const pendingQ = useCollection<Submission>('gm:pending-subs', () =>
    query(collection(db, 'submissions'), where('status', '==', 'pending')),
  );

  const value = useMemo<GmDataValue>(() => {
    const pendingJoins = joinsQ.data.filter((j) => j.status === 'pending').sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
    const rejectedJoins = joinsQ.data
      .filter((j) => j.status === 'rejected')
      .sort((a, b) => tsMs(b.reviewedAt ?? b.updatedAt) - tsMs(a.reviewedAt ?? a.updatedAt));
    // Only personal claims wait for a review; side-quest entries are created approved and settled by the vote.
    const pendingSubs = pendingQ.data.filter((s) => s.kind === 'personal').sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
    return {
      pendingJoins,
      rejectedJoins,
      pendingSubs,
      loading: joinsQ.loading || pendingQ.loading,
      error: joinsQ.error ?? pendingQ.error,
    };
  }, [joinsQ.data, joinsQ.loading, joinsQ.error, pendingQ.data, pendingQ.loading, pendingQ.error]);

  return <GmDataContext.Provider value={value}>{children}</GmDataContext.Provider>;
}

export function useGmData(): GmDataValue {
  const ctx = useContext(GmDataContext);
  if (!ctx) throw new Error('useGmData must be used inside <GmDataProvider>');
  return ctx;
}
