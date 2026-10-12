import type { CSSProperties } from 'react';
import look from '@pack';
import './Loader.css';

export interface LoaderProps {
  /** Pixel size of the drawing (default 72). */
  size?: number;
  /** Accessible name announced to screen readers (default "Loading"). */
  label?: string;
  /** Optional visible caption in the display face under the drawing. */
  caption?: string;
  /** Fill the viewport and centre on paper (app boot / auth resolving). */
  fullScreen?: boolean;
  /**
   * What the mark sits on: 'paper' (default: ink line, accent plate), 'red' (on an accent surface; the plate turns paper so it
   * still shows), 'ink' (the line turns paper).
   */
  on?: 'paper' | 'red' | 'ink';
  className?: string;
}

export function Loader({ size = 72, label = 'Loading', caption, fullScreen = false, on = 'paper', className }: LoaderProps) {
  const style = { '--loader-size': `${size}px` } as CSSProperties;
  const classes = ['loader', on !== 'paper' ? `loader--on-${on}` : '', fullScreen ? 'loader--screen' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} role="status" style={style}>
      <svg
        className="loader__svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <look.LoaderArt />
      </svg>
      <span className="visually-hidden">{label}</span>
      {caption ? (
        <span className="loader__caption" aria-hidden="true">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
