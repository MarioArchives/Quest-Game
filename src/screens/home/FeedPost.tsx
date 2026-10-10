import { Avatar } from '../../components/Avatar';
import { Icon, type IconName } from '../../components/Icon';
import { usePhotoViewer } from '../../components/PhotoViewer';
import { PointsChip } from '../../components/PointsChip';
import { useGame } from '../../data/GameProvider';
import { tsMs, useStorageUrl } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import type { Doc, FeedItem, FeedType } from '../../shared';
import { ReactionsBar } from './ReactionsBar';

const BADGE_ICON: Record<FeedType, IconName> = {
  join: 'user',
  approved: 'camera',
  rejected: 'close',
  fraud: 'gm',
  exposed: 'pin',
  'global-open': 'megaphone',
  'voting-open': 'ballot',
  'global-won': 'trophy',
  announcement: 'megaphone',
  status: 'gm',
  adjust: 'edit',
};

/** Types shown as a quiet one-liner rather than a card with a border. */
const QUIET: ReadonlySet<FeedType> = new Set(['join', 'status']);

function PostPhoto({ item, label }: { item: Doc<FeedItem>; label: string }) {
  const open = usePhotoViewer();
  const full = useStorageUrl(item.imagePath);
  const thumb = useStorageUrl(item.thumbPath);
  const src = full ?? thumb;
  return (
    <button
      type="button"
      className="post__photo"
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

/** One post in the Home feed: who and what, the reviewer's note, points, evidence, a FRAUD stamp, reactions. */
export function FeedPost({ item, now }: { item: Doc<FeedItem>; now: number }) {
  const { playersById } = useGame();
  const who = item.uid ? playersById.get(item.uid) : undefined;
  const actor = item.actorUid ? playersById.get(item.actorUid) : undefined;
  const hasPhoto = Boolean(item.imagePath || item.thumbPath);
  const quiet = QUIET.has(item.type) && !hasPhoto;
  const flagged = item.flagged === true;
  const fraud = item.type === 'fraud';

  // Bold the leading name only when the stored text really starts with it as a whole word (names can change later).
  const lead = [who, actor].find((p) => p && item.text.startsWith(`${p.displayName} `));
  const text = lead ? (
    <>
      <strong>{lead.displayName}</strong>
      {item.text.slice(lead.displayName.length)}
    </>
  ) : (
    item.text
  );
  const showQuest = Boolean(item.questTitle) && !item.text.includes(item.questTitle as string);
  // Some server posts (GM adjustments) already say the reason in their text.
  const showNote = Boolean(item.note) && !item.text.includes(item.note as string);
  const noteBy = actor?.displayName ?? (item.type === 'approved' || item.type === 'rejected' ? 'the GM' : null);

  const classes = ['post', `post--${item.type}`, hasPhoto ? 'post--photo' : '', quiet ? 'post--quiet' : '', flagged ? 'is-flagged' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes}>
      <div className="post__row">
        {who || item.photoURL ? (
          <Avatar name={who?.displayName ?? item.text} src={who?.photoURL ?? item.photoURL} size={quiet ? 30 : 40} />
        ) : (
          <span className={`post__badge${quiet ? ' post__badge--small' : ''}`} aria-hidden="true">
            <Icon name={BADGE_ICON[item.type] ?? 'megaphone'} size={quiet ? 16 : 20} />
          </span>
        )}
        <div className="post__body">
          <p className="post__text">
            {fraud ? <span className="post__flag">Fraud</span> : null}
            {item.type === 'global-open' ? <span className="post__flag post__flag--ink">Side quest</span> : null}
            {item.type === 'voting-open' ? <span className="post__flag post__flag--ink">Vote</span> : null}
            <span className={flagged ? 'post__struck' : undefined}>{text}</span>
            <span className="post__ago">{formatAgo(tsMs(item.createdAt), now)}</span>
          </p>
          {showNote ? (
            <blockquote className="post__note">
              <p>&ldquo;{item.note}&rdquo;</p>
              {noteBy ? <cite>&mdash; {noteBy}</cite> : null}
            </blockquote>
          ) : null}
          {showQuest ? <p className="post__quest">{item.questTitle}</p> : null}
          {flagged ? (
            <span className="post__stamp" role="img" aria-label="Overturned as fraud">
              Fraud
            </span>
          ) : null}
        </div>
        {typeof item.points === 'number' && item.points !== 0 ? (
          <span className={flagged ? 'post__points is-struck' : 'post__points'}>
            <PointsChip points={item.points} />
          </span>
        ) : null}
      </div>

      {hasPhoto ? <PostPhoto item={item} label={`Open photo${who ? ` from ${who.displayName}` : ''}`} /> : null}
      {item.caption ? <p className="post__caption">{item.caption}</p> : null}

      <ReactionsBar feedId={item.id} count={item.reactionCount ?? 0} />

    </li>
  );
}
