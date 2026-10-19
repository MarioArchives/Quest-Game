// The Log book's parts (the mystery pack's Feed): the Credible / Doubtful stamps on an entry, the "most credible" card
// pinned at the top, and the catch-up pile behind the "Next to stamp" pill. The rules for who may vote and what counts
// are in logbook.ts and in the shared feedVotes helper; this draws them.
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { friendlyError } from '../../../api';
import { backend } from '../../../backend';
import { SERVER_TIME } from '../../../backend/types';
import { BottomSheet } from '../../../components/BottomSheet';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { useToast } from '../../../components/Toast';
import { tsMs, useStorageUrl } from '../../../data/hooks';
import { useSession } from '../../../session/SessionProvider';
import { firstName } from '../../../screens/home/FeedPost';
import type { Doc, FeedItem, TopPost } from '../../../shared';
import { kicker } from './timeline';
import {
  myVote,
  nextVote,
  pileLine,
  scoreLabel,
  sinceLine,
  stampCounts,
  underLine,
  isYours,
  type Pending,
  type Vote,
  type VotePost,
} from './logbook';

// ---------- voting ----------

export interface Voting {
  pending: Pending;
  /** Tap a stamp (or a pile button): sets, switches or takes back; shows at once and rolls back with a toast on failure. */
  cast(post: VotePost, tapped: Vote): void;
}

export const VotingContext = createContext<Voting | null>(null);

/**
 * Your votes, shown before the server confirms them. A pending vote is dropped once the post shows it (or when the
 * write fails, with a toast). `items` are the posts to watch for that.
 */
export function useVoting(items: VotePost[]): Voting {
  const toast = useToast();
  const { user } = useSession();
  const uid = user?.uid ?? null;
  const [pending, setPending] = useState<Pending>({});

  useEffect(() => {
    if (!uid) return;
    setPending((prev) => {
      let next: Record<string, Vote | null> | null = null;
      for (const item of items) {
        if (!(item.id in prev)) continue;
        if ((item.votes?.[uid] ?? null) === prev[item.id]) {
          next ??= { ...prev };
          delete next[item.id];
        }
      }
      return next ?? prev;
    });
  }, [items, uid]);

  const latest = useRef(pending);
  latest.current = pending;

  const cast = useCallback(
    (post: VotePost, tapped: Vote) => {
      if (!uid) return;
      const before = myVote(post, uid, latest.current);
      const next = nextVote(before, tapped);
      setPending((p) => ({ ...p, [post.id]: next }));
      const path = `feed/${post.id}/reactions/${uid}`;
      const write = next === null ? backend().data.remove(path) : backend().data.set(path, { vote: next, createdAt: SERVER_TIME });
      write.catch((err: unknown) => {
        setPending((p) => {
          const rest = { ...p };
          delete rest[post.id];
          return rest;
        });
        toast(friendlyError(err), 'error');
      });
    },
    [uid, toast],
  );

  return useMemo(() => ({ pending, cast }), [pending, cast]);
}

// ---------- the stamps on an entry ----------

/**
 * Under an entry that takes votes: "Credible n" and "Doubtful n" as two rubber stamps; yours is inked (and the entry is
 * stamped with your first name). An entry of yours shows its counts and no stamps.
 */
export function Stamps({ post, voting }: { post: VotePost; voting: Voting }) {
  const { user, player } = useSession();
  const uid = user?.uid ?? '';
  const { up, down, mine } = stampCounts(post, uid, voting.pending);
  if (isYours(post, uid)) {
    return (
      <span className="lb-own">
        Yours · credible {up} · doubtful {down}
      </span>
    );
  }
  const tap = (v: Vote) => () => voting.cast(post, v);
  return (
    <span className={`lb-stamps${mine === null ? ' is-wait' : ''}`} role="group" aria-label="Is this entry credible?">
      <button type="button" className={`lb-btn lb-btn--good${mine === 1 ? ' is-on' : ''}`} aria-pressed={mine === 1} disabled={!player} onClick={tap(1)}>
        Credible <b>{up}</b>
        <span className="visually-hidden">{mine === 1 ? ', yours. Tap to take it back' : ''}</span>
      </button>
      <button type="button" className={`lb-btn lb-btn--bad${mine === -1 ? ' is-on' : ''}`} aria-pressed={mine === -1} disabled={!player} onClick={tap(-1)}>
        Doubtful <b>{down}</b>
        <span className="visually-hidden">{mine === -1 ? ', yours. Tap to take it back' : ''}</span>
      </button>
      {mine !== null ? <Imprint vote={mine} /> : null}
    </span>
  );
}

/** The ink your stamp leaves on the entry, after the stamps: the word, then your first name. Aria-hidden; the button says it. */
function Imprint({ vote }: { vote: Vote }) {
  const { player } = useSession();
  return (
    <span className={`lb-imp lb-imp--${vote === 1 ? 'good' : 'bad'}`} aria-hidden="true">
      {vote === 1 ? 'Credible' : 'Doubtful'}
      {player ? <i>{firstName(player.displayName)}</i> : null}
    </span>
  );
}

// ---------- the top card ----------

export interface TopEntry {
  item: Doc<FeedItem> | null;
  who: string | null;
  what: string | null;
  stop: string | null;
  time: string | null;
}

function CardThumb({ item }: { item: Doc<FeedItem> }) {
  const src = useStorageUrl(item.thumbPath ?? item.imagePath);
  return <span className="lb-thumb">{src ? <img src={src} alt="" loading="lazy" /> : <Icon name="image" size={28} />}</span>;
}

/**
 * "Most credible tonight +N", pinned at the top: the entry's words or photo, who and where, its stamps and since when.
 * After it changes hands the old card stays visible underneath with its hours. A tap goes to the entry.
 */
export function TopCard({
  top,
  entry,
  previous,
  clock,
  onOpen,
}: {
  top: TopPost | null;
  entry: TopEntry | null;
  /** The card that held it before: its title and score as they stand now (null score when it left the log). */
  previous: { title: string; score: number | null } | null;
  clock: (ms: number) => string;
  onOpen(feedId: string): void;
}) {
  if (!top || !top.feedId) {
    return (
      <section className="lb-top lb-top--quiet" aria-label="Most credible tonight">
        <p>No entry stamped credible yet</p>
      </section>
    );
  }
  const item = entry?.item ?? null;
  const sinceMs = top.since ? tsMs(top.since) : null;
  const since = sinceLine(sinceMs !== null ? clock(sinceMs) : null);
  const text = item ? (item.caption?.trim() ? `“${item.caption}”` : item.text) : 'An entry from earlier tonight';
  const by = entry ? [entry.who, entry.what, [entry.stop, entry.time].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ') : '';
  const feedId = top.feedId;
  const prevFrom = top.previousSince ? tsMs(top.previousSince) : null;
  const under = previous ? underLine(previous.title, previous.score, prevFrom !== null ? clock(prevFrom) : null, sinceMs !== null ? clock(sinceMs) : null) : null;

  const body = (
    <>
      <span className="lb-card__h">
        <span>Most credible tonight</span>
        <b>{scoreLabel(top.score)}</b>
      </span>
      <span className="lb-card__b">
        {item && (item.thumbPath || item.imagePath) ? <CardThumb item={item} /> : null}
        <span className="lb-card__txt">
          <span className="lb-card__t">{text}</span>
          {by ? <span className="lb-card__by">{by}</span> : null}
        </span>
      </span>
      <span className="lb-card__f">
        <span className="lb-cnt--good">Credible {top.up}</span>
        <span className="lb-cnt--bad">Doubtful {top.down}</span>
        {since ? <span>{since}</span> : null}
      </span>
    </>
  );

  return (
    <section className={`lb-top${under ? ' lb-top--swap' : ''}`} aria-label="Most credible tonight">
      {under ? (
        <div className="lb-under">
          <s>{under}</s>
        </div>
      ) : null}
      {item ? (
        <button type="button" className="lb-card lb-card--tap" onClick={() => onOpen(feedId)} aria-label={`Most credible tonight, ${scoreLabel(top.score)}. Go to the entry`}>
          <Pin />
          {body}
        </button>
      ) : (
        <div className="lb-card">
          <Pin />
          {body}
        </div>
      )}
    </section>
  );
}

function Pin() {
  return (
    <svg className="lb-pin" width="26" height="30" viewBox="0 0 26 30" aria-hidden="true" focusable="false">
      <ellipse className="lb-pin__sh" cx="16" cy="27" rx="6" ry="2" />
      <path className="lb-pin__needle" d="M13 15 L15.5 27" />
      <circle className="lb-pin__head" cx="13" cy="10" r="8" />
      <circle className="lb-pin__hi" cx="10.5" cy="7.5" r="2.4" />
    </svg>
  );
}

// ---------- the catch-up pile ----------

/** What the pile needs to show one entry. */
export interface PileEntry {
  post: Doc<FeedItem>;
  chapter: number;
  who: string | null;
  stop: string | null;
  time: string;
}

const SWIPE_PX = 90;

/**
 * Entries you haven't stamped, one at a time: this stop first, newest first, then back through the night. Doubtful,
 * Skip, Credible, or swipe the card (left doubtful, right credible). When none are left it says so and closes.
 */
export function CatchUpPile({ order, voting, onClose }: { order: PileEntry[]; voting: Voting; onClose(): void }) {
  // The order is fixed when the pile opens, so a vote doesn't reshuffle what comes next.
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const [list] = useState(order);
  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; id: number } | null>(null);
  const current = list[i] ?? null;
  const done = current === null;

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(timer);
  }, [done, onClose]);

  const vote = (v: Vote) => {
    if (!current) return;
    // Only sets: a vote you already have on it is left as it is rather than taken back.
    if (myVote(current.post, uid, voting.pending) !== v) voting.cast(current.post, v);
    setDx(0);
    setI((n) => n + 1);
  };
  const skip = () => {
    setDx(0);
    setI((n) => n + 1);
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) setDx(e.clientX - start.current.x);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const moved = e.clientX - start.current.x;
    start.current = null;
    if (moved > SWIPE_PX) vote(1);
    else if (moved < -SWIPE_PX) vote(-1);
    else setDx(0);
  };

  return (
    <BottomSheet title="Next to stamp" subtitle={current ? pileLine(i, list) : undefined} onClose={onClose}>
      {current ? (
        <div className="lb-pile">
          <div className="lb-pile__stack">
            <span className="lb-pile__back lb-pile__back--2" aria-hidden="true" />
            <span className="lb-pile__back" aria-hidden="true" />
            <div
              className={`lb-pile__card${dx > 24 ? ' is-good' : dx < -24 ? ' is-bad' : ''}`}
              style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` } : undefined}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => {
                start.current = null;
                setDx(0);
              }}
            >
              <PileCard entry={current} />
            </div>
          </div>
          <div className="lb-pile__btns">
            <Button variant="danger" onClick={() => vote(-1)}>
              Doubtful
            </Button>
            <Button variant="ghost" onClick={skip}>
              Skip
            </Button>
            <Button variant="primary" onClick={() => vote(1)}>
              Credible
            </Button>
          </div>
          <p className="lb-pile__hint">Swipe right for credible, left for doubtful. Nothing is scored.</p>
        </div>
      ) : (
        <p className="lb-pile__done" role="status">
          All stamped. Nothing left to stamp.
        </p>
      )}
    </BottomSheet>
  );
}

function PileCard({ entry }: { entry: PileEntry }) {
  const { post } = entry;
  const src = useStorageUrl(post.thumbPath ?? post.imagePath);
  const hasPhoto = Boolean(post.thumbPath || post.imagePath);
  const by = [entry.who, entry.stop].filter(Boolean).join(' · ');
  return (
    <div className="lb-pile__tag">
      <span className="lb-pile__top">
        <span>{kicker(post.type)}</span>
        <time>{entry.time}</time>
      </span>
      {hasPhoto ? <span className="lb-thumb lb-thumb--wide">{src ? <img src={src} alt="" draggable={false} /> : <Icon name="image" size={28} />}</span> : null}
      <span className="lb-pile__text">{post.caption?.trim() ? `“${post.caption}”` : post.text}</span>
      {by ? <span className="lb-pile__by">{by}</span> : null}
    </div>
  );
}
