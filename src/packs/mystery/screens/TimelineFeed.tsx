// The Log book (the Feed tab), "bar by bar" as case files (E4·1): the most credible entry pinned on a card, then then one manila folder per revealed stop of
// the crawl, newest on top, each with its posts as kraft evidence tags strung on a twine line. The stop the group is
// at stays open (its newest posts, then "+ N more"); earlier stops are folded shut, a line each, and open on a tap.
// The missions themselves live on the Missions tab; a post that opens one links there.
import { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/Button';
import { EvidenceSheet, type EvidenceTarget } from '../../../components/EvidenceSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { formatDelta } from '../../../components/PointsChip';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useDocument, useNow, useQuery } from '../../../data/hooks';
import { isEvidenceSkipped } from '../../../lib/evidenceSkip';
import { clockTime } from '../../../lib/time';
import { orderStops } from '../../../modules/map/stops';
import { features, reactionStyle, t, zone } from '../../../pack';
import { PostPhoto, WITNESSED, firstName } from '../../../screens/home/FeedPost';
import { ReactionsBar } from '../../../screens/home/ReactionsBar';
import { takesVote } from '../../../shared';
import { HomeBanners } from '../../../screens/Dashboard';
import { PoliceCallCard } from '../../../screens/home/PoliceCallCard';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, FeedItem, Stop, TopPost } from '../../../shared';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor } from './CaseKit';
import type { MissionsLinkState } from './MissionsTab';
import { tagNumber } from './lockerLib';
import { EntryVideo, TaggedLine } from '../../../components/EntryVideo';
import { chapterCounts, chapterLine, chapterize, kicker, missionRef, OPEN_STOP_POSTS, walkLabel, type Chapter } from './timeline';
import { CatchUpPile, Stamps, TopCard, VotingContext, useVoting, type PileEntry, type TopEntry, type Voting } from './LogbookParts';
import { catchUpOrder, entryTitle, isYours, pickLine, pickOfStop, pillText, scoreOf, stopChip, toStamp, tonightLine, votableCount } from './logbook';
import './timeline.css';

type Post = { item: Doc<FeedItem>; type: string; ref: string | null; ms: number };

/** "+5 to Sam" while the top's points are with a player and the case is open. */
function topPayout(top: TopPost | null, status: string, players: Map<string, { displayName?: string | null }>): string | null {
  const award = top?.award;
  if (!award || status === 'ended') return null;
  const name = firstName(players.get(award.uid)?.displayName ?? '');
  return name ? `+${award.points} to ${name}` : `+${award.points}`;
}

export default function TimelineFeed() {
  const { isAdmin, user } = useSession();
  const uid = user?.uid ?? '';
  const { ready, feed, feedLoading, feedError, playersById, state } = useGame();
  const voting = useVoting(feed);
  const top = useDocument<TopPost>('game/top');
  const [pile, setPile] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const stopDocs = useQuery<Stop>(features.stops ? (isAdmin ? { path: 'stops' } : { path: 'stops', where: [['revealed', '==', true]] }) : null);

  const now = useNow(30_000);
  const chapters = useMemo(() => {
    const posts: Post[] = feed.map((item) => ({ item, type: item.type, ref: item.ref, ms: tsMs(item.createdAt) || Date.now() }));
    return chapterize(posts, orderStops(stopDocs.data, isAdmin), now);
  }, [feed, stopDocs.data, isAdmin, now]);

  // Which stop each entry sits in, for the top card and the pile.
  const stopOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of chapters) for (const p of c.posts) map.set(p.item.id, c.stop ? c.stop.name : 'Before the crawl');
    return map;
  }, [chapters]);

  const order = useMemo(() => catchUpOrder(chapters.map((c) => ({ posts: c.posts.map((p) => p.item) })), uid, voting.pending), [chapters, uid, voting.pending]);
  const here = order.filter((o) => o.chapter === 0).length;
  const pill = pillText(here, order.length - here);
  const pileEntries: PileEntry[] = order.map((o) => ({
    post: o.post,
    chapter: o.chapter,
    who: o.post.uid ? firstName(playersById.get(o.post.uid)?.displayName ?? '') || null : null,
    stop: stopOf.get(o.post.id) ?? null,
    time: clockTime(tsMs(o.post.createdAt) || now, zone),
  }));

  const topEntry: TopEntry | null = useMemo(() => {
    const id = top.data?.feedId;
    const item = id ? (feed.find((f) => f.id === id) ?? null) : null;
    if (!item) return null;
    const ms = tsMs(item.createdAt);
    return {
      item,
      who: item.uid ? firstName(playersById.get(item.uid)?.displayName ?? '') || null : null,
      what: item.questTitle ?? null,
      stop: stopOf.get(item.id) ?? null,
      time: ms ? clockTime(ms, zone) : null,
    };
  }, [top.data?.feedId, feed, playersById, stopOf]);
  const previous = useMemo(() => {
    const id = top.data?.feedId ? top.data.previousFeedId : null;
    if (!id) return null;
    const item = feed.find((f) => f.id === id);
    return item ? { title: entryTitle(item), score: scoreOf(item) } : { title: 'An earlier entry', score: null };
  }, [top.data, feed]);

  // Going to an entry: its stop opens, then it scrolls into view and is marked for a moment.
  useEffect(() => {
    if (!focusId) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`tl-post-${focusId}`);
      if (el) {
        const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
        el.classList.add('lb-found');
        window.setTimeout(() => el.classList.remove('lb-found'), 1800);
      }
      setFocusId(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusId]);

  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  return (
    <VotingContext.Provider value={voting}>
    <div className="tl">
      <HomeBanners />

      {features.police ? <PoliceCallCard /> : null}

      {feedError ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load the {t.feed.one}.
        </p>
      ) : feedLoading ? (
        <Loader className="app__loader" caption="Loading" />
      ) : feed.length === 0 ? (
        <div className="empty">
          <h3>Quiet so far</h3>
          <p>Nothing is in the {t.feed.one} yet. The first {t.claim.one} will be logged here.</p>
        </div>
      ) : (
        <>
        <div className="lb-head">
          <h2>{t.feed.One}</h2>
          <span>{tonightLine(feed.length)}</span>
        </div>
        <TopCard top={top.data} entry={topEntry} previous={previous} payout={topPayout(top.data, state.status, playersById)} clock={(ms) => clockTime(ms, zone)} onOpen={setFocusId} />
        <div className="tl__trail">
          {chapters.map((c, i) => (
            <Fragment key={c.stop?.id ?? 'before'}>
              {/* A stop closes when the next (newer) one opens; only the newest is open, the rest fold shut. */}
              <ChapterBlock chapter={c} closedMs={i > 0 ? chapters[i - 1]!.startMs : null} newest={i === 0} alt={i % 2 === 0} focusId={focusId} />
              {c.walk ? <Footprints label={walkLabel(c.walk)} /> : null}
            </Fragment>
          ))}
        </div>
        {pill ? (
          <Button variant="primary" small className="lb-pill" onClick={() => setPile(true)}>
            <Icon name="chevronDown" size={15} strokeWidth={2.6} />
            {pill}
          </Button>
        ) : null}
        </>
      )}
      {pile ? <CatchUpPile order={pileEntries} voting={voting} onClose={() => setPile(false)} /> : null}
    </div>
    </VotingContext.Provider>
  );
}

const stopNo = (n: number) => String(n).padStart(2, '0');

function ChapterBlock({
  chapter,
  closedMs,
  newest,
  alt,
  focusId,
}: {
  chapter: Chapter<Post, ReturnType<typeof orderStops>[number]>;
  closedMs: number | null;
  newest: boolean;
  /** Every other folded stop is a shade darker, like files of different stock. */
  alt: boolean;
  /** An entry to go to: the stop holding it opens in full. */
  focusId: string | null;
}) {
  const { stop, startMs, posts, now, headed } = chapter;
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const voting = useContext(VotingContext);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const holdsFocus = focusId !== null && posts.some((p) => p.item.id === focusId);
  useEffect(() => {
    if (holdsFocus) {
      setOpen(true);
      setAll(true);
    }
  }, [holdsFocus]);
  const items = posts.map((p) => p.item);
  const left = toStamp(items, uid, voting?.pending).length;
  const chip = stopChip(votableCount(items, uid), left);
  const pick = pickLine(pickOfStop(items).map((p) => entryTitle(p)));
  const counts = chapterCounts(posts.map((p) => ({ photo: Boolean(p.item.imagePath || p.item.thumbPath) })));
  const name = stop ? stop.name : 'Before the crawl';
  const no = stop ? stopNo(stop.number) : '00';
  const times = { from: startMs !== null ? clockTime(startMs, zone) : null, to: closedMs !== null ? clockTime(closedMs, zone) : null };
  const shown = newest && !all ? posts.slice(0, OPEN_STOP_POSTS) : posts;
  const rows = (
    <Strung>
      {shown.map((p) => (
        <Row key={p.item.id} item={p.item} ms={p.ms} />
      ))}
      {posts.length === 0 ? <li className="tl__none">Nothing logged here yet.</li> : null}
    </Strung>
  );
  if (!headed) return rows;

  if (!newest) {
    // An earlier stop, folded shut: its name, when, how much happened there. It opens in place.
    const id = `tl-stop-${stop?.id ?? 'before'}`;
    return (
      <section className={`tl__chapter tl__shut${alt ? ' tl__shut--alt' : ''}${open ? ' is-open' : ''}`} aria-label={stop ? `Stop ${stop.number}, ${name}` : name}>
        <span className="cf-folder__tab">Stop {no} · filed</span>
        {chip ? <span className={`lb-chip lb-chip--tab${left > 0 ? '' : ' lb-chip--done'}`}>{chip}</span> : null}
        <button type="button" className="tl__shutbar" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span>
            <b>{name}</b>
            <span>{chapterLine(times, counts, false)}</span>
            {pick ? <span className="lb-pick">{pick}</span> : null}
          </span>
          <Icon name="chevronDown" size={20} strokeWidth={2.4} className="tl__shutchev" />
        </button>
        {open ? <div id={id}>{rows}</div> : null}
      </section>
    );
  }

  const more = posts.length - shown.length;
  return (
    <section className="tl__chapter" aria-label={stop ? `Stop ${stop.number}, ${name}` : name}>
      <Folder tab={`${now ? 'Now · ' : ''}stop ${no}`}>
        <span className="cf-meta">
          {chapterLine(times, counts, true)}
          {left > 0 ? (
            <>
              {' · '}
              <em className="lb-left">{left} to stamp</em>
            </>
          ) : null}
        </span>
        <div className="tl__folderrow">
          <h3 className="cf-title tl__stopname">{name}</h3>
          <Stamp tone={now ? 'active' : 'filed'}>{now ? 'Active' : 'Filed'}</Stamp>
        </div>
      </Folder>
      {rows}
      {more > 0 ? (
        <button type="button" className="tl__more" onClick={() => setAll(true)}>
          + {more} more {stop ? `at ${stop.name}` : 'before the crawl'}
        </button>
      ) : null}
    </section>
  );
}

/** The trail of prints between two stops, with how far it is. */
function Footprints({ label }: { label: string }) {
  return (
    <div className="tl__walk" aria-label={label.toLowerCase()}>
      <svg width="40" height="64" viewBox="0 0 40 64" aria-hidden="true" focusable="false">
        <g fill="var(--chart)">
          <ellipse cx="13" cy="8" rx="4.5" ry="6.5" transform="rotate(-8 13 8)" />
          <ellipse cx="12" cy="18" rx="3" ry="2.6" />
          <ellipse cx="27" cy="30" rx="4.5" ry="6.5" transform="rotate(8 27 30)" />
          <ellipse cx="28" cy="40" rx="3" ry="2.6" />
          <ellipse cx="13" cy="52" rx="4.5" ry="6.5" transform="rotate(-8 13 52)" />
          <ellipse cx="12" cy="62" rx="3" ry="2.6" />
        </g>
      </svg>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

/**
 * One post as a kraft evidence tag: number and time, an ink-stamped kicker, the text, evidence, reactions, points.
 * The charge sheet shows the post an upheld charge makes with it, too.
 */
export function Row({ item, ms }: { item: Doc<FeedItem>; ms: number }) {
  const { playersById, mySubmissions } = useGame();
  const { user } = useSession();
  const shared = useContext(VotingContext);
  // A post shown outside the Log book (the charge sheet) keeps its own votes.
  const own = useVoting(shared ? [] : [item]);
  const voting: Voting = shared ?? own;
  const uid = user?.uid ?? '';
  const stampable = reactionStyle === 'votes' && (takesVote(item, uid) || isYours(item, uid));
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);
  const who = item.uid ? playersById.get(item.uid) : undefined;
  const actor = item.actorUid ? playersById.get(item.actorUid) : undefined;
  const hasPhoto = Boolean(item.imagePath || item.thumbPath);
  const flagged = item.flagged === true;
  const points = typeof item.points === 'number' && item.points !== 0 ? item.points : null;
  // A side-quest entry is posted as `approved` with no points and no witness.
  const entry = item.type === 'approved' && points === null && !item.actorUid;

  const witnessed = item.type === 'approved' && !entry ? WITNESSED.exec(item.text) : null;
  const body = witnessed ? item.text.slice(0, witnessed.index) : item.text;
  const witnessName = item.type === 'approved' && !entry ? (actor?.displayName ?? witnessed?.[1] ?? null) : null;
  const witness = witnessName ? (witnessName === `the ${t.gm.one}` ? t.gm.One : firstName(witnessName)) : null;

  // Bold the leading name (a link to that player) only when the stored text really starts with it as a whole word.
  const lead = [who, actor].find((p) => p && body.startsWith(`${p.displayName} `));
  const text = lead ? (
    <>
      <button type="button" className="tl__name" onClick={() => navigate(`/player/${lead.id}`)}>
        {lead.displayName}
      </button>
      {body.slice(lead.displayName.length)}
    </>
  ) : (
    body
  );

  const mine = item.type === 'approved' && item.uid && item.uid === user?.uid && item.submissionId ? mySubmissions.find((s) => s.id === item.submissionId) : undefined;
  const wantsEvidence = Boolean(mine && mine.kind === 'personal' && mine.status === 'approved' && !mine.imagePath && !mine.caption && !isEvidenceSkipped(user?.uid ?? '', mine.id));
  const showNote = Boolean(item.note) && !item.text.includes(item.note as string);
  const missionLink = missionRef(item);
  const pointsText = points !== null ? formatDelta(points) : '';
  const tone = ['rejected', 'checking', 'standing'].includes(item.type)
    ? 'warm'
    : ['exposed', 'framed', 'fraud', 'police-call', 'police-tip'].includes(item.type) || (item.type === 'police-result' && (points ?? 0) < 0)
      ? 'bad'
      : ['approved', 'global-won', 'global-scored', 'police-result'].includes(item.type) && !entry
        ? 'good'
        : 'plain';

  return (
    <Tag id={`tl-post-${item.id}`} tilt={tiltFor(item.id)} rowClassName={`tl__row tl__row--${item.type}${flagged ? ' is-flagged' : ''}`}>
      <TagTop left={`No. ${tagNumber(item.id)}`} right={<time dateTime={new Date(ms).toISOString()}>{clockTime(ms, zone)}</time>} />
      <Stamp tone={tone}>{kicker(item.type, { entry, witness })}</Stamp>
      <p className="cf-text tl__text">
        <span className={flagged ? 'tk__struck' : undefined}>{text}</span>
      </p>
      {flagged ? <Stamp tone="bad">Overturned</Stamp> : null}
      {item.videoPath ? <EntryVideo videoPath={item.videoPath} thumbPath={item.thumbPath} label={`Video${who ? ` from ${who.displayName}` : ''}`} /> : hasPhoto ? <PostPhoto item={item} label={`Open photo${who ? ` from ${who.displayName}` : ''}`} /> : null}
      <TaggedLine uid={item.taggedUid} className="tl__note" />
      {item.caption ? <p className="tl__caption">&ldquo;{item.caption}&rdquo;</p> : null}
      {showNote ? <p className="tl__note">&ldquo;{item.note}&rdquo;</p> : null}
      {missionLink ? (
        <button type="button" className="tl__link" onClick={() => void navigate('/', { state: { mission: missionLink } satisfies MissionsLinkState })}>
          Open in Missions
          <Icon name="chevron" size={14} strokeWidth={2.6} />
        </button>
      ) : null}
      {wantsEvidence && mine ? (
        <button type="button" className="tl__add" onClick={() => setSheet({ mode: 'evidence', submission: mine, title: item.questTitle ?? mine.questTitle ?? `your ${t.quest.one}` })}>
          Add a photo or comment
        </button>
      ) : null}
      <div className="cf-foot">
        {reactionStyle === 'votes' ? stampable ? <Stamps post={item} voting={voting} /> : <span /> : <ReactionsBar feedId={item.id} count={item.reactionCount ?? 0} />}
        {points !== null ? (
          <span className={`cf-pts ${points < 0 ? 'cf-pts--neg' : 'cf-pts--pos'}${flagged ? ' is-struck' : ''}`}>
            {pointsText}
            <span className="visually-hidden"> points{flagged ? ', taken back' : ''}</span>
          </span>
        ) : null}
      </div>
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </Tag>
  );
}
