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
   * In a line of text (a list or a lookup still loading): the drawing beside the caption, which takes the type around
   * it. Renders a span, so it can sit in a paragraph.
   */
  inline?: boolean;
  /**
   * What the mark sits on: 'paper' (default: ink line, accent plate), 'red' (on an accent surface; the plate turns paper so it
   * still shows), 'ink' (the line turns paper).
   */
  on?: 'paper' | 'red' | 'ink';
  className?: string;
}

export function Loader({ size = 72, label = 'Loading', caption, fullScreen = false, inline = false, on = 'paper', className }: LoaderProps) {
  const style = { '--loader-size': `${size}px` } as CSSProperties;
  const classes = ['loader', on !== 'paper' ? `loader--on-${on}` : '', fullScreen ? 'loader--screen' : '', inline ? 'loader--inline' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const Root = inline ? 'span' : 'div';
  return (
    <Root className={classes} role="status" style={style}>
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
    </Root>
  );
}
