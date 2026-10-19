import { useGame } from '../data/GameProvider';
import { useStorageUrl } from '../data/hooks';
import './EntryVideo.css';

/** A revealed video entry, played where it shows (a vote card, the feed, a result). */
export function EntryVideo({ videoPath, thumbPath, label = 'Video entry' }: { videoPath: string; thumbPath?: string | null; label?: string }) {
  const src = useStorageUrl(videoPath);
  const poster = useStorageUrl(thumbPath);
  return <video className="entry-video" playsInline controls preload="metadata" poster={poster ?? undefined} src={src ?? undefined} aria-label={label} />;
}

/** "In the photo: Sam", for a revealed entry that names a player. */
export function TaggedLine({ uid, className }: { uid: string | null | undefined; className?: string }) {
  const { playersById } = useGame();
  if (!uid) return null;
  return <p className={className ?? 'entry-tagged'}>In the photo: {playersById.get(uid)?.displayName ?? 'a player'}</p>;
}
