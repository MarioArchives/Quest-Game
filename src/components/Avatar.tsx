import { useState, type CSSProperties } from 'react';
import { avatarTint } from '../lib/avatar';
import { brand } from '../pack';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  /** Red fill for "you" when there is no photo. */
  you?: boolean;
  /** The player, so a pack with avatar tints can give them a stable colour when they have no photo. */
  uid?: string;
  className?: string;
}

/** Circle with a 2px ink border; the initial in Anton on red-tint when there is no photo. */
export function Avatar({ name, src, size = 36, you = false, uid, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const style = { '--size': `${size}px` } as CSSProperties;
  // A pack with avatar placeholders tints each player's (a per-player colour is pack data, so it is set inline).
  const placeholder = brand.avatar;
  if (placeholder && !showImage) {
    const tint = uid ? avatarTint(uid, placeholder.tints) : null;
    if (tint) style.background = tint;
  }
  return (
    <span className={`avatar${you && !showImage ? ' avatar--you' : ''} ${className ?? ''}`.trim()} style={style} aria-hidden="true">
      {showImage ? (
        <img src={src ?? undefined} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(src ?? null)} />
      ) : brand.avatar?.placeholder === 'silhouette' ? (
        <Silhouette />
      ) : (
        initial
      )}
    </span>
  );
}

/** A plain head and shoulders, in the muted ink colour. */
function Silhouette() {
  return (
    <svg className="avatar__silhouette" viewBox="0 0 24 24" width="78%" height="78%" focusable="false" aria-hidden="true">
      <circle cx="12" cy="9" r="4.2" fill="currentColor" />
      <path d="M3.5 24c0-5.2 3.8-8.6 8.5-8.6s8.5 3.4 8.5 8.6z" fill="currentColor" />
    </svg>
  );
}
