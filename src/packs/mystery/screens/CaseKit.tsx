// The case-file kit (E4·1): manila folders with a tab and a paperclip, kraft evidence tags hung by a string through
// the eyelet in the middle of their left end from one twine line, ink stamps, and ruled index cards. The Board, the
// files and the GM console all draw with these, so the strings and folders look the same everywhere.
import type { ReactNode } from 'react';
import { tagNumber } from './lockerLib';
import './casefile.css';

export type StampTone = 'plain' | 'good' | 'bad' | 'warm' | 'active' | 'filed';

/**
 * A manila folder: an optional tab above, a paperclip on the top edge (or, with `clip="tab"`, clipped over the tab),
 * whatever goes inside.
 */
export function Folder({
  tab,
  children,
  clip = true,
  className,
  label,
  tour,
}: {
  tab?: ReactNode;
  children: ReactNode;
  clip?: boolean | 'tab';
  className?: string;
  label?: string;
  /** Its name for the torch tour (data-tour), which lights it. */
  tour?: string;
}) {
  const onTab = clip === 'tab' && !!tab;
  return (
    <section className={`cf-folder${className ? ` ${className}` : ''}`} aria-label={label} data-tour={tour}>
      {tab ? (
        <span className={`cf-folder__tab${onTab ? ' cf-folder__tab--clip' : ''}`}>
          {tab}
          {onTab ? <Paperclip /> : null}
        </span>
      ) : null}
      <div className="cf-folder__body">
        {clip === true ? <Paperclip /> : null}
        {children}
      </div>
    </section>
  );
}

export function Paperclip() {
  return (
    <svg className="cf-clip" width="16" height="44" viewBox="0 0 16 44" aria-hidden="true" focusable="false">
      <path d="M5 40 V8 a3 3 0 0 1 6 0 V34 a5 5 0 0 1 -10 0 V12" fill="none" stroke="var(--eyelet)" strokeWidth="2" />
    </svg>
  );
}

/** A rubber stamp: ink in a box, a little crooked. */
export function Stamp({ tone = 'plain', children, className }: { tone?: StampTone; children: ReactNode; className?: string }) {
  return <span className={`cf-stamp cf-stamp--${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}

/** One twine line down the left, with tags hung from it; it runs behind everything, from behind the folder above. */
export function Strung({ children, className, label, tour }: { children: ReactNode; className?: string; label?: string; tour?: string }) {
  return (
    <ul className={`cf-strung${className ? ` ${className}` : ''}`} aria-label={label} data-tour={tour}>
      {children}
    </ul>
  );
}

/** A slight, steady tilt per tag (about its eyelet), so they look hung by hand. */
export const tiltFor = (id: string): number => ((Number(tagNumber(id)) % 5) - 2) * 0.35;

/**
 * A kraft tag on the line: the string runs behind the tag and through a real hole in its eyelet. `tilt` turns it
 * about the eyelet, so the string stays put.
 */
export function Tag({ children, tilt = 0, className, rowClassName, id }: { children: ReactNode; tilt?: number; className?: string; rowClassName?: string; id?: string }) {
  return (
    <li id={id} className={`cf-row${rowClassName ? ` ${rowClassName}` : ''}`}>
      <svg className="cf-knot" width="52" height="24" viewBox="0 0 52 24" aria-hidden="true" focusable="false">
        <path d="M7.5 3 C 18 3, 28 8, 46 12" fill="none" stroke="var(--twine)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <div className="cf-tagwrap" style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}>
        <article className={`cf-tag${className ? ` ${className}` : ''}`}>
          <span className="cf-eye" aria-hidden="true" />
          {children}
        </article>
      </div>
    </li>
  );
}

/** The tag's top line: its number on the left, a time or note on the right. */
export function TagTop({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="cf-top">
      <span>{left}</span>
      {right !== undefined ? <span>{right}</span> : null}
    </div>
  );
}

/** A ruled index card (white, a red header rule), e.g. the GM's "needs your signature" counts. */
export function IndexCard({ children, className, tour }: { children: ReactNode; className?: string; tour?: string }) {
  return (
    <div className={`cf-card${className ? ` ${className}` : ''}`} data-tour={tour}>
      {children}
    </div>
  );
}
