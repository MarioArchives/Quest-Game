// The Board's Feed tab, "bar by bar" as case files (E4·1): the pinned announcement, the open periodic and group
// missions, then one manila folder per revealed stop of the crawl, newest on top, each with its posts as kraft
// evidence tags strung on a twine line.
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EvidenceSheet, type EvidenceTarget } from '../../../components/EvidenceSheet';
import { Loader } from '../../../components/Loader';
import { formatDelta } from '../../../components/PointsChip';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { isEvidenceSkipped } from '../../../lib/evidenceSkip';
import { clockTime } from '../../../lib/time';
import { orderStops } from '../../../modules/map/stops';
import { features, t, zone } from '../../../pack';
import { PostPhoto, WITNESSED, firstName } from '../../../screens/home/FeedPost';
import { ReactionsBar } from '../../../screens/home/ReactionsBar';
import { HomeBanners } from '../../../screens/Dashboard';
import { SideQuestCards } from '../../../screens/home/SideQuestCard';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, FeedItem, Stop } from '../../../shared';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor } from './CaseKit';
import { RollCallTags } from './RollCallTags';
import { tagNumber } from './lockerLib';
import { chapterize, kicker, walkLabel, type Chapter } from './timeline';
import './timeline.css';

type Post = { item: Doc<FeedItem>; type: string; ref: string | null; ms: number };

export function TimelineFeed() {
  const { isAdmin } = useSession();
  const { ready, feed, feedLoading, feedError } = useGame();
  const stopDocs = useQuery<Stop>(features.stops ? (isAdmin ? { path: 'stops' } : { path: 'stops', where: [['revealed', '==', true]] }) : null);

  const now = useNow(30_000);
  const chapters = useMemo(() => {
    const posts: Post[] = feed.map((item) => ({ item, type: item.type, ref: item.ref, ms: tsMs(item.createdAt) || Date.now() }));
    return chapterize(posts, orderStops(stopDocs.data, isAdmin), now);
  }, [feed, stopDocs.data, isAdmin, now]);

  if (!ready) return <Loader className="app__loader" caption="Loading" />;

  return (
    <div className="tl">
      <HomeBanners />

      {features.checkins ? <RollCallTags /> : null}
      {features.sideQuests ? <SideQuestCards /> : null}

      {feedError ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load the feed.
        </p>
      ) : feedLoading ? null : feed.length === 0 ? (
        <div className="empty">
          <h3>Quiet so far</h3>
          <p>Nothing has happened yet. The first {t.claim.one} will show up here.</p>
        </div>
      ) : (
        <div className="tl__trail">
          {chapters.map((c, i) => (
            <Fragment key={c.stop?.id ?? 'before'}>
              {/* A stop closes when the next (newer) one opens. */}
              <ChapterBlock chapter={c} closedMs={i > 0 ? chapters[i - 1]!.startMs : null} />
              {c.walk ? <Footprints label={walkLabel(c.walk)} /> : null}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function ChapterBlock({ chapter, closedMs }: { chapter: Chapter<Post, ReturnType<typeof orderStops>[number]>; closedMs: number | null }) {
  const { stop, startMs, posts, now, headed } = chapter;
  const rows = (
    <Strung>
      {posts.map((p) => (
        <Row key={p.item.id} item={p.item} ms={p.ms} />
      ))}
      {posts.length === 0 ? <li className="tl__none">Nothing logged here yet.</li> : null}
    </Strung>
  );
  if (!headed) return rows;
  const opened = startMs !== null ? clockTime(startMs, zone) : null;
  const meta = stop ? `Case file · opened ${opened ?? '—'}${!now && closedMs !== null ? ` · closed ${clockTime(closedMs, zone)}` : ''}` : 'Case file';
  return (
    <section className="tl__chapter" aria-label={stop ? `Stop ${stop.number}, ${stop.name}` : 'Before the crawl'}>
      <Folder tab={stop ? `Stop ${String(stop.number).padStart(2, '0')}${now ? ' · Now' : ''}` : 'Stop 00'}>
        <span className="cf-meta">{meta}</span>
        <div className="tl__folderrow">
          <h3 className="cf-title tl__stopname">{stop ? stop.name : 'Before the crawl'}</h3>
          <Stamp tone={now ? 'active' : 'filed'}>{now ? 'Active' : 'Filed'}</Stamp>
        </div>
      </Folder>
      {rows}
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

/** One post as a kraft evidence tag: number and time, an ink-stamped kicker, the text, evidence, reactions, points. */
function Row({ item, ms }: { item: Doc<FeedItem>; ms: number }) {
  const { playersById, mySubmissions } = useGame();
  const { user } = useSession();
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
  const pointsText = points !== null ? formatDelta(points) : '';
  const tone = ['rejected', 'checking'].includes(item.type)
    ? 'warm'
    : ['exposed', 'framed', 'fraud'].includes(item.type)
      ? 'bad'
      : ['approved', 'global-won'].includes(item.type) && !entry
        ? 'good'
        : 'plain';

  return (
    <Tag tilt={tiltFor(item.id)} rowClassName={`tl__row tl__row--${item.type}${flagged ? ' is-flagged' : ''}`}>
      <TagTop left={`No. ${tagNumber(item.id)}`} right={<time dateTime={new Date(ms).toISOString()}>{clockTime(ms, zone)}</time>} />
      <Stamp tone={tone}>{kicker(item.type, { entry, witness })}</Stamp>
      <p className="cf-text tl__text">
        <span className={flagged ? 'tk__struck' : undefined}>{text}</span>
      </p>
      {flagged ? <Stamp tone="bad">Overturned</Stamp> : null}
      {hasPhoto ? <PostPhoto item={item} label={`Open photo${who ? ` from ${who.displayName}` : ''}`} /> : null}
      {item.caption ? <p className="tl__caption">&ldquo;{item.caption}&rdquo;</p> : null}
      {showNote ? <p className="tl__note">&ldquo;{item.note}&rdquo;</p> : null}
      {wantsEvidence && mine ? (
        <button type="button" className="tl__add" onClick={() => setSheet({ mode: 'evidence', submission: mine, title: item.questTitle ?? mine.questTitle ?? `your ${t.quest.one}` })}>
          Add a photo or comment
        </button>
      ) : null}
      <div className="cf-foot">
        <ReactionsBar feedId={item.id} count={item.reactionCount ?? 0} />
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
