import { useEffect, useRef } from 'react';
import { useGame } from '../data/GameProvider';
import { useStorageUrl } from '../data/hooks';
import './EntryVideo.css';

/**
 * A revealed video entry, played where it shows (a vote card, the feed, a result). With `loop` it is just the clip, like
 * a moving photo: silent, playing round and round, with no controls (no full screen, no scrubbing, no menu) and no
 * taps of its own, so a card it sits on still swipes.
 */
export function EntryVideo({ videoPath, thumbPath, label = 'Video entry', loop = false }: { videoPath: string; thumbPath?: string | null; label?: string; loop?: boolean }) {
  const src = useStorageUrl(videoPath);
  const poster = useStorageUrl(thumbPath);
  const ref = useRef<HTMLVideoElement>(null);

  // Muted has to be set on the element itself for phones to let it play by itself.
  useEffect(() => {
    const video = ref.current;
    if (!loop || !video || !src) return;
    video.muted = true;
    void video.play().catch(() => {});
  }, [loop, src]);

  if (loop) {
    return (
      <video
        ref={ref}
        className="entry-video entry-video--loop"
        playsInline
        autoPlay
        muted
        loop
        disablePictureInPicture
        disableRemotePlayback
        preload="auto"
        poster={poster ?? undefined}
        src={src ?? undefined}
        aria-label={label}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }
  return <video className="entry-video" playsInline controls preload="metadata" poster={poster ?? undefined} src={src ?? undefined} aria-label={label} />;
}

/** "In the photo: Sam", for a revealed entry that names a player. */
export function TaggedLine({ uid, className }: { uid: string | null | undefined; className?: string }) {
  const { playersById } = useGame();
  if (!uid) return null;
  return <p className={className ?? 'entry-tagged'}>In the photo: {playersById.get(uid)?.displayName ?? 'a player'}</p>;
}
