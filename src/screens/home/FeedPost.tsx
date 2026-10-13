import { Avatar } from '../../components/Avatar';
import { Icon, type IconName } from '../../components/Icon';
import { usePhotoViewer } from '../../components/PhotoViewer';
import { formatDelta } from '../../components/PointsChip';
import { useGame } from '../../data/GameProvider';
import { tsMs, useStorageUrl } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import type { Doc, FeedItem, FeedType } from '../../shared';
import { ReactionsBar } from './ReactionsBar';
import './feed.css';
import { t } from '../../pack';

/** Two line icons the shared set doesn't have, drawn the same way (24px box, round 2px strokes). */
const EXTRA_GLYPHS = {
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
} as const;
type GlyphName = IconName | keyof typeof EXTRA_GLYPHS;

function Glyph({ name, size }: { name: GlyphName; size: number }) {
  if (name !== 'eye' && name !== 'clock') return <Icon name={name} size={size} strokeWidth={2.4} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {EXTRA_GLYPHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

interface Label {
  text: string;
  icon: GlyphName;
}

/** The small type tag at the top of a ticket. Red ones are the loud news; the rest are ink. */
const TAG: Record<FeedType, Label & { red?: boolean }> = {
  join: { text: 'Joined', icon: 'user' },
  approved: { text: `${t.quest.One} done`, icon: 'check' },
  rejected: { text: 'Rejected', icon: 'close' },
  fraud: { text: 'Fraud', icon: 'gm' },
  exposed: { text: 'Exposed', icon: 'eye', red: true },
  framed: { text: 'Framed', icon: 'eye', red: true },
  'global-open': { text: t.sideQuest.One, icon: 'megaphone', red: true },
  checking: { text: 'Time’s up', icon: 'clock' },
  'voting-open': { text: 'Vote now', icon: 'ballot', red: true },
  'global-won': { text: `${t.sideQuest.One} won`, icon: 'trophy' },
  announcement: { text: `From the ${t.gm.one}`, icon: 'megaphone', red: true },
  status: { text: 'Game', icon: 'gm' },
  adjust: { text: 'Points', icon: 'edit' },
  left: { text: 'Left', icon: 'logout' },
  'stop-revealed': { text: 'New location', icon: 'pin', red: true },
  'checkin-open': { text: t.checkin.One, icon: 'clock', red: true },
  'checkin-answer': { text: t.checkin.One, icon: 'check' },
  'checkin-closed': { text: `${t.checkin.One} closed`, icon: 'clock' },
};

/** What the stub shows when there are no points to print on it. */
const MARK: Record<FeedType, Label> = {
  join: { text: 'In', icon: 'user' },
  approved: { text: 'Done', icon: 'check' },
  rejected: { text: 'Denied', icon: 'close' },
  fraud: { text: 'Fraud', icon: 'gm' },
  exposed: { text: 'Caught', icon: 'eye' },
  framed: { text: 'Framed', icon: 'eye' },
  'global-open': { text: 'New', icon: 'megaphone' },
  checking: { text: 'Late OK', icon: 'clock' },
  'voting-open': { text: 'Vote', icon: 'ballot' },
  'global-won': { text: 'Won', icon: 'trophy' },
  announcement: { text: t.gm.One, icon: 'megaphone' },
  status: { text: 'Game', icon: 'gm' },
  adjust: { text: t.gm.One, icon: 'edit' },
  left: { text: 'Out', icon: 'logout' },
  'stop-revealed': { text: 'Map', icon: 'pin' },
  'checkin-open': { text: 'Answer', icon: 'clock' },
  'checkin-answer': { text: 'Here', icon: 'check' },
  'checkin-closed': { text: 'Closed', icon: 'clock' },
};

/** Types shown as a quiet one-liner rather than a ticket. */
const QUIET: ReadonlySet<FeedType> = new Set(['join', 'status', 'left']);

/** Approval posts end "— witnessed by Alex"; the stub prints the witness, so the headline drops it. */
export const WITNESSED = / — witnessed by (.+)$/;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function PostPhoto({ item, label }: { item: Doc<FeedItem>; label: string }) {
  const open = usePhotoViewer();
  const full = useStorageUrl(item.imagePath);
  const thumb = useStorageUrl(item.thumbPath);
  const src = full ?? thumb;
  return (
    <button
      type="button"
      className="tk__photo"
      aria-label={label}
      onClick={() =>
        open({
          imagePath: item.imagePath,
          thumbPath: item.thumbPath,
          caption: item.caption,
          uid: item.uid,
          createdAtMs: tsMs(item.createdAt),
          title: item.questTitle,
        })
      }
    >
      {src ? <img src={src} alt={item.caption || label} loading="lazy" /> : <Icon name="image" size={32} />}
    </button>
  );
}

/**
 * One post in the Home feed, as a ticket: the body says what happened (type tag, time, text, evidence, the
 * reviewer's note, a FRAUD stamp) with the reactions under it; the perforated stub on the right holds the points
 * and who witnessed it.
 * Joins, game status and players leaving stay quiet one-liners.
 */
export function FeedPost({ item, now }: { item: Doc<FeedItem>; now: number }) {
  const { playersById } = useGame();
  const who = item.uid ? playersById.get(item.uid) : undefined;
  const actor = item.actorUid ? playersById.get(item.actorUid) : undefined;
  const hasPhoto = Boolean(item.imagePath || item.thumbPath);
  const flagged = item.flagged === true;
  const points = typeof item.points === 'number' && item.points !== 0 ? item.points : null;
  // A side-quest entry is posted as `approved` with no points and no witness.
  const entry = item.type === 'approved' && points === null && !item.actorUid;

  // A post written moments ago may not have its server time yet.
  const at = tsMs(item.createdAt) || now;
  const time = (
    <time dateTime={new Date(at).toISOString()} className="tk__ago">
      {formatAgo(at, now)}
    </time>
  );

  const witnessed = item.type === 'approved' && !entry ? WITNESSED.exec(item.text) : null;
  const body = witnessed ? item.text.slice(0, witnessed.index) : item.text;
  const witnessName = item.type === 'approved' && !entry ? (actor?.displayName ?? witnessed?.[1] ?? null) : null;
  const witness = witnessName ? (witnessName === `the ${t.gm.one}` ? t.gm.One : firstName(witnessName)) : null;

  // Bold the leading name only when the stored text really starts with it as a whole word (names can change later).
  const lead = [who, actor].find((p) => p && body.startsWith(`${p.displayName} `));
  const text = lead ? (
    <>
      <strong>{lead.displayName}</strong>
      {body.slice(lead.displayName.length)}
    </>
  ) : (
    body
  );

  const reactions = <ReactionsBar feedId={item.id} count={item.reactionCount ?? 0} />;

  if (QUIET.has(item.type) && !hasPhoto) {
    return (
      <li className={`tk-line tk-line--${item.type}`}>
        {who || item.photoURL ? (
          <Avatar name={who?.displayName ?? item.text} src={who?.photoURL ?? item.photoURL} size={28} uid={who?.id} />
        ) : (
          <span className="tk-line__badge" aria-hidden="true">
            <Glyph name={TAG[item.type].icon} size={15} />
          </span>
        )}
        <p className="tk-line__text">
          {text} {time}
        </p>
        {reactions}
      </li>
    );
  }

  const tag: Label & { red?: boolean } = entry ? { text: 'Entered', icon: 'camera' } : TAG[item.type];
  const mark: Label = entry ? (hasPhoto ? { text: 'Entry', icon: 'camera' } : { text: 'Hidden', icon: 'lock' }) : MARK[item.type];
  const headline = item.type === 'approved' && !entry;
  const showQuest = Boolean(item.questTitle) && !item.text.includes(item.questTitle as string);
  // Some server posts (GM adjustments) already say the reason in their text.
  const showNote = Boolean(item.note) && !item.text.includes(item.note as string);
  const noteBy = actor?.displayName ?? (item.type === 'approved' || item.type === 'rejected' ? `the ${t.gm.one}` : null);
  const pointsText = points !== null ? formatDelta(points) : '';

  const classes = ['tk', `tk--${item.type}`, entry ? 'tk--entry' : '', points !== null && points < 0 ? 'tk--neg' : '', flagged ? 'is-flagged' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes}>
      <div className="tk__body">
        <p className="tk__meta">
          <span className={tag.red ? 'tk__tag tk__tag--red' : 'tk__tag'}>
            <Glyph name={tag.icon} size={13} />
            {tag.text}
          </span>
          {time}
        </p>
        <p className={headline ? 'tk__head' : 'tk__text'}>
          <span className={flagged ? 'tk__struck' : undefined}>{text}</span>
        </p>
        {showQuest ? <p className="tk__quest">{item.questTitle}</p> : null}
        {flagged ? (
          <span className="tk__stamp" role="img" aria-label="Overturned as fraud">
            Fraud
          </span>
        ) : null}
        {hasPhoto ? <PostPhoto item={item} label={`Open photo${who ? ` from ${who.displayName}` : ''}`} /> : null}
        {item.caption ? <p className="tk__caption">{item.caption}</p> : null}
        {showNote ? (
          <blockquote className="tk__note">
            <p>&ldquo;{item.note}&rdquo;</p>
            {noteBy ? <cite>&mdash; {noteBy}</cite> : null}
          </blockquote>
        ) : null}
      </div>

      <div className="tk__stub">
        {points !== null ? (
          <span className={['tk__pts', pointsText.length > 4 ? 'tk__pts--long' : '', flagged ? 'is-struck' : ''].filter(Boolean).join(' ')}>
            {pointsText}
            <span className="visually-hidden"> points{flagged ? ', taken back' : ''}</span>
          </span>
        ) : item.type === 'announcement' ? (
          <span className="tk__pts" aria-hidden="true">
            {t.gm.One}
          </span>
        ) : (
          <span className="tk__mark">
            <Glyph name={mark.icon} size={22} />
            {mark.text}
          </span>
        )}
        {(item.type === 'exposed' || item.type === 'framed') && who ? (
          <span className="tk__who">
            <span className="visually-hidden">for </span>
            {firstName(who.displayName)}
          </span>
        ) : null}
        {witness ? <span className="tk__witness">{t.witness.One} {witness}</span> : null}
      </div>

      {/* Under the body, beside the stub (after it in reading order, so the points come first). */}
      <div className="tk__react">{reactions}</div>
    </li>
  );
}
