// One entry as a taped polaroid, for the vote's deck (card), the cork board (pin) and the sheet (sheet). The photo
// (or the video, or the words of a text-only entry), the comment handwritten under it, who it is from, the people in
// it, and the eye and the heart: the entry's vote in the Log book. Presentational: the deck owns the dragging.
import { useMemo, type CSSProperties } from 'react';
import { EntryVideo, TaggedLine } from '../../../components/EntryVideo';
import { useGame } from '../../../data/GameProvider';
import { useDocument, useStorageUrl } from '../../../data/hooks';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, FeedItem, Submission } from '../../../shared';
import { useVoting } from './LogbookParts';
import { MarkCounts, VoteMarks, useCountsHidden } from './VoteMarks';

/** The name a polaroid carries: "You" on your own, else the player's name. */
export function useEntryName(entry: Doc<Submission>): string {
  const { playersById } = useGame();
  return playersById.get(entry.uid)?.displayName ?? 'A player';
}

/** The photo, or the video's poster, or the words of a text-only entry. */
export function PolaroidMedia({ entry, name, playVideo }: { entry: Doc<Submission>; name: string; playVideo: boolean }) {
  const url = useStorageUrl(entry.imagePath ?? entry.thumbPath);
  if (entry.videoPath && playVideo) {
    // Just the clip on a loop, filling the photo: no controls, so the card swipes over it like over a photo.
    return (
      <div className="vt-pol__video">
        <EntryVideo videoPath={entry.videoPath} thumbPath={entry.thumbPath} label={`${name}’s video`} loop />
      </div>
    );
  }
  if (url) return <img className="vt-pol__img" src={url} alt={`${name}’s entry`} draggable={false} data-vt-photo="" />;
  if (entry.videoPath) return <span className="vt-pol__none">VIDEO</span>;
  return <span className="vt-pol__words">{entry.caption}</span>;
}

/** The entry's post in the Log book: the eye and the heart are its votes (and count towards the top entry). */
function useEntryPost(entry: Doc<Submission>): Doc<FeedItem> | null {
  return useDocument<FeedItem>(entry.feedId ? `feed/${entry.feedId}` : null).data;
}

/** The eye and the heart, one of them yours at most: the same vote as under the entry in the Log book. */
export function ReactionButtons({ entry, name }: { entry: Doc<Submission>; name: string }) {
  const post = useEntryPost(entry);
  const posts = useMemo(() => (post ? [post] : []), [post]);
  const voting = useVoting(posts);
  return post ? <VoteMarks post={post} voting={voting} name={name} /> : null;
}

interface Props {
  entry: Doc<Submission>;
  size: 'card' | 'sheet';
  /** The line by the buttons: "PRIYA · 2 OF 5". */
  byline: string;
  /** Degrees. */
  tilt?: number;
  /** Show the eye and the heart (off on the result). */
  reactions?: boolean;
  /** The entry's result in words ("3 yes · 1 no"), on the closed vote. */
  words?: string | null;
}

export function Polaroid({ entry, size, byline, tilt = 0, reactions = true, words = null }: Props) {
  const name = useEntryName(entry);
  const textOnly = !entry.videoPath && !entry.imagePath && !entry.thumbPath;
  return (
    <article className={`vt-pol vt-pol--${size}`} style={{ '--tilt': `${tilt}deg` } as CSSProperties} aria-label={`${name}’s entry`}>
      <span className="vt-tape" aria-hidden="true" />
      <div className={`vt-pol__photo${textOnly ? ' is-words' : ''}`}>
        <PolaroidMedia entry={entry} name={name} playVideo />
      </div>
      {!textOnly && entry.caption ? <p className="vt-pol__cap">{entry.caption}</p> : null}
      <TaggedLine uid={entry.taggedUid} className="vt-pol__tagged" />
      <div className="vt-pol__foot">
        <span className="vt-pol__by">{words ? `${name.toUpperCase()} · ${words}` : byline}</span>
        {reactions ? <ReactionButtons entry={entry} name={name} /> : null}
      </div>
    </article>
  );
}

interface PinProps {
  entry: Doc<Submission>;
  tilt: number;
  /** YES / NO / ? on a yes/no board. */
  stamp: 'YES' | 'NO' | '?' | null;
  /** MY VOTE / MAYBE on a pick-one board. */
  tag: 'MY VOTE' | 'MAYBE' | null;
  /** The red pin: your vote. */
  voted: boolean;
  onOpen(): void;
}

/** A polaroid pinned on the cork board: a button that opens the sheet. Counts only; the toggles are on the sheet. */
export function PinPolaroid({ entry, tilt, stamp, tag, voted, onOpen, style }: PinProps & { style: CSSProperties }) {
  const name = useEntryName(entry);
  const { user } = useSession();
  const post = useEntryPost(entry);
  const up = post?.up ?? 0;
  const down = post?.down ?? 0;
  const hidden = useCountsHidden(post, post?.votes?.[user?.uid ?? ''] ?? null);
  const textOnly = !entry.videoPath && !entry.imagePath && !entry.thumbPath;
  return (
    <li className="vt-pin-slot" style={{ ...style, '--tilt': `${tilt}deg` } as CSSProperties}>
      <button
        type="button"
        className={`vt-pol vt-pol--pin${voted ? ' is-voted' : ''}`}
        aria-label={`${name}’s entry: look closer.${hidden ? '' : ` ${up} ${up === 1 ? 'heart' : 'hearts'}, ${down} ${down === 1 ? 'eye' : 'eyes'}`}${stamp ? `. ${stamp === '?' ? 'Not judged yet' : stamp}` : ''}${tag ? `. ${tag}` : ''}`}
        onClick={onOpen}
      >
        <span className="vt-pin" aria-hidden="true" />
        <span className={`vt-pol__photo${textOnly ? ' is-words' : ''}`}>
          <PolaroidMedia entry={entry} name={name} playVideo={false} />
          {stamp ? <span className={`vt-stamp vt-stamp--${stamp === 'YES' ? 'yes' : stamp === 'NO' ? 'no' : 'q'}`}>{stamp}</span> : null}
        </span>
        <span className="vt-pol__name">{name}</span>
        <MarkCounts up={up} down={down} hidden={hidden} className="vt-pol__counts" />
        {tag ? <span className={`vt-tag vt-tag--${tag === 'MY VOTE' ? 'mine' : 'maybe'}`} aria-hidden="true">{tag}</span> : null}
      </button>
    </li>
  );
}
