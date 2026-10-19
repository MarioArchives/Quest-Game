import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { tabBadges } from '../lib/badges';
import { isEvidenceSkipped, skipVersion, subscribeSkips } from '../lib/evidenceSkip';
import { useSession } from '../session/SessionProvider';
import type { JoinRequest } from '../shared';
import { useGame } from './GameProvider';
import { tsMs, useNow, useQuery } from './hooks';

type SeenTab = 'home' | 'feed' | 'account' | 'wrap';
type Seen = Partial<Record<SeenTab, number>>;

const seenKey = (uid: string, tab: SeenTab) => `fq:seen:${uid}:${tab}`;

function readSeen(uid: string): Seen {
  const out: Seen = {};
  if (!uid) return out;
  for (const tab of ['home', 'feed', 'account', 'wrap'] as const) {
    try {
      const raw = localStorage.getItem(seenKey(uid, tab));
      const at = raw === null ? NaN : Number(raw);
      if (Number.isFinite(at)) out[tab] = at;
    } catch {
      /* private mode: the dots just reset on reload */
    }
  }
  return out;
}

/**
 * Which bottom-bar tabs show a dot. "Last seen" is kept per device and per tab (localStorage, keyed by uid) and
 * moves forward whenever that tab is open, so posts arriving while you are looking at Home never light its dot.
 * With `feedTab` (the pack's own Feed screen) new posts light Feed instead, and Home lights for what needs you.
 * Only GMs run the extra join-request listener.
 */
export function useTabBadges(pathname: string, feedTab = false): { home: boolean; feed: boolean; account: boolean; gm: boolean; wrap: boolean } {
  const { user, isAdmin } = useSession();
  const { state, feed, mySubmissions, witnessRequests, globalQuests, me } = useGame();
  const uid = user?.uid ?? '';
  const now = useNow(15_000);
  // Re-render when an evidence banner is dismissed.
  const skipVer = useSyncExternalStore(subscribeSkips, skipVersion);

  const joins = useQuery<JoinRequest>(isAdmin ? { path: 'joinRequests', where: [['status', '==', 'pending']] } : null);

  const [seen, setSeen] = useState<Seen>(() => readSeen(uid));
  useEffect(() => setSeen(readSeen(uid)), [uid]);

  const mark = useCallback(
    (tab: SeenTab, at: number) => {
      if (!uid) return;
      setSeen((prev) => {
        if ((prev[tab] ?? -1) >= at) return prev;
        try {
          localStorage.setItem(seenKey(uid, tab), String(at));
        } catch {
          /* ignore */
        }
        return { ...prev, [tab]: at };
      });
    },
    [uid],
  );

  // Server timestamps can run slightly ahead of this device's clock, so "seen" is never earlier than what is on screen.
  const latestPost = useMemo(() => feed.reduce((max, post) => Math.max(max, tsMs(post.createdAt)), 0), [feed]);
  const latestReview = useMemo(() => mySubmissions.reduce((max, s) => Math.max(max, tsMs(s.reviewedAt)), 0), [mySubmissions]);
  // The new posts are read on Home, or on the pack's Feed.
  const playing = Boolean(me && !me.left);
  const onHome = !feedTab && pathname === '/';
  const onFeed = feedTab && pathname === '/feed';
  const onAccount = pathname === '/account';
  const onWrap = pathname === '/wrap';

  useEffect(() => {
    if (onHome) mark('home', Math.max(Date.now(), latestPost));
  }, [onHome, latestPost, mark]);
  useEffect(() => {
    if (onFeed) mark('feed', Math.max(Date.now(), latestPost));
  }, [onFeed, latestPost, mark]);
  useEffect(() => {
    if (onAccount) mark('account', Math.max(Date.now(), latestReview));
  }, [onAccount, latestReview, mark]);
  useEffect(() => {
    if (onWrap) mark('wrap', Date.now());
  }, [onWrap, mark]);

  return useMemo(
    () =>
      tabBadges({
        uid,
        isGM: isAdmin,
        now,
        gameStatus: state.status,
        feed: feed.map((post) => ({ uid: post.uid, createdAt: tsMs(post.createdAt), type: post.type, ref: post.ref })),
        lastSeen: seen,
        witnessRequests: witnessRequests.length,
        myClaims: mySubmissions.map((s) => ({
          kind: s.kind,
          questId: s.questId,
          status: s.status,
          reviewedAt: s.reviewedAt ? tsMs(s.reviewedAt) : null,
          hasEvidence: Boolean(s.imagePath || s.caption),
          evidenceDismissed: isEvidenceSkipped(uid, s.id),
        })),
        pendingJoins: isAdmin ? joins.data.length : 0,
        sideQuests: globalQuests.map((q) => ({
          id: q.id,
          status: q.status,
          endsAt: tsMs(q.endsAt),
          votingEndsAt: q.votingEndsAt ? tsMs(q.votingEndsAt) : null,
        })),
        feedTab,
        playing,
      }),
    [uid, isAdmin, now, state.status, feed, seen, witnessRequests.length, mySubmissions, joins.data.length, globalQuests, skipVer, feedTab, playing],
  );
}
