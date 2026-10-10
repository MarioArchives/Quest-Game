export const FESTIVAL_LINE = 'Lancaster Music Festival · 8–11 Oct 2026';

/** The gig-poster masthead (halftone, red field, big Anton title) used by the sign-in family of screens. */
export function PosterHeader({ compact = false, sticker }: { compact?: boolean; sticker?: string }) {
  return (
    <header className={`poster halftone${compact ? ' poster--compact' : ''}`}>
      <p className="poster__line eyebrow">{FESTIVAL_LINE}</p>
      <h1 className="poster__title">
        Festival
        {compact ? ' ' : <br />}
        Quest
      </h1>
      {sticker ? <span className="sticker poster__sticker">{sticker}</span> : null}
    </header>
  );
}
