import { useState, type CSSProperties } from 'react';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  /** Red fill for "you" when there is no photo. */
  you?: boolean;
  className?: string;
}

/** Circle with a 2px ink border; the initial in Anton on red-tint when there is no photo. */
export function Avatar({ name, src, size = 36, you = false, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const style = { '--size': `${size}px` } as CSSProperties;
  return (
    <span className={`avatar${you && !showImage ? ' avatar--you' : ''} ${className ?? ''}`.trim()} style={style} aria-hidden="true">
      {showImage ? (
        <img src={src ?? undefined} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(src ?? null)} />
      ) : (
        initial
      )}
    </span>
  );
}
