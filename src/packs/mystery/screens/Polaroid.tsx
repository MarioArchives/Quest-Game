// One entry as a taped polaroid, for the vote's deck (card), the cork board (pin) and the sheet (sheet). The photo
// (or the video, or the words of a text-only entry), the comment handwritten under it, who it is from, the people in
// it, and the eye and the heart. Presentational: the deck owns the dragging.
import type { CSSProperties, PointerEvent } from 'react';
import { EntryVideo, TaggedLine } from '../../../components/EntryVideo';
import { useGame } from '../../../data/GameProvider';
import { useStorageUrl } from '../../../data/hooks';
import { useEntryReactions } from '../../../data/useEntryReactions';
import { ENTRY_REACTIONS, type Doc, type EntryReactionKind, type Submission } from '../../../shared';

export const REACTION_ICON: Record<EntryReactionKind, { label: string; d: string; filled: boolean }> = {
  eye: { label: 'Suspicious', d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', filled: false },
  heart: { label: 'Love it', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', filled: true },
};

/** The name a polaroid carries: "You" on your own, else the player's name. */
export function useEntryName(entry: Doc<Submission>): string {
  const { playersById } = useGame();
  return playersById.get(entry.uid)?.displayName ?? 'A player';
}

/** The photo, or the video's poster, or the words of a text-only entry. */
export function PolaroidMedia({ entry, name, playVideo }: { entry: Doc<Submission>; name: string; playVideo: boolean }) {
  const url = useStorageUrl(entry.imagePath ?? entry.thumbPath);
  if (entry.videoPath && playVideo) {
    // Its controls are for playing it: the pointer going down on them must not start the card's drag.
    return (
      <div className="vt-pol__video" onPointerDown={(e: PointerEvent) => e.stopPropagation()}>
        <EntryVideo videoPath={entry.videoPath} thumbPath={entry.thumbPath} label={`${name}’s video`} />
      </div>
    );
  }
  if (url) return <img className="vt-pol__img" src={url} alt={`${name}’s entry`} draggable={false} data-vt-photo="" />;
  if (entry.videoPath) return <span className="vt-pol__none">VIDEO</span>;
  return <span className="vt-pol__words">{entry.caption}</span>;
}

/** The eye and the heart as toggles with their counts. Disabled on your own entry. */
export function ReactionButtons({ entry, name }: { entry: Doc<Submission>; name: string }) {
  const r = useEntryReactions(entry);
  return (
    <>
      {ENTRY_REACTIONS.map((kind) => {
        const icon = REACTION_ICON[kind];
        return (
          <button
            key={kind}
            type="button"
            className={`vt-react vt-react--${kind}`}
            aria-label={`${icon.label}: ${name}’s entry`}
            aria-pressed={r.mine[kind]}
            disabled={!r.can}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => r.toggle(kind)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={icon.filled && r.mine[kind] ? 'is-filled' : undefined}>
              <path d={icon.d} />
            </svg>
            <span>{r.count[kind]}</span>
          </button>
        );
      })}
    </>
  );
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
  const r = useEntryReactions(entry);
  const textOnly = !entry.videoPath && !entry.imagePath && !entry.thumbPath;
  return (
    <li className="vt-pin-slot" style={{ ...style, '--tilt': `${tilt}deg` } as CSSProperties}>
      <button
        type="button"
        className={`vt-pol vt-pol--pin${voted ? ' is-voted' : ''}`}
        aria-label={`${name}’s entry: look closer. ${r.count.eye} eye, ${r.count.heart} heart${stamp ? `. ${stamp === '?' ? 'Not judged yet' : stamp}` : ''}${tag ? `. ${tag}` : ''}`}
        onClick={onOpen}
      >
        <span className="vt-pin" aria-hidden="true" />
        <span className={`vt-pol__photo${textOnly ? ' is-words' : ''}`}>
          <PolaroidMedia entry={entry} name={name} playVideo={false} />
          {stamp ? <span className={`vt-stamp vt-stamp--${stamp === 'YES' ? 'yes' : stamp === 'NO' ? 'no' : 'q'}`}>{stamp}</span> : null}
        </span>
        <span className="vt-pol__name">{name}</span>
        <span className="vt-pol__counts" aria-hidden="true">
          {ENTRY_REACTIONS.map((kind) => (
            <span key={kind}>
              <svg viewBox="0 0 24 24">
                <path d={REACTION_ICON[kind].d} />
              </svg>
              {r.count[kind]}
            </span>
          ))}
        </span>
        {tag ? <span className={`vt-tag vt-tag--${tag === 'MY VOTE' ? 'mine' : 'maybe'}`} aria-hidden="true">{tag}</span> : null}
      </button>
    </li>
  );
}
