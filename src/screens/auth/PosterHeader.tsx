import look from '@pack';

/** The poster masthead (halftone, accent field, big display title) used by the sign-in family of screens. */
export function PosterHeader({ compact = false, sticker }: { compact?: boolean; sticker?: string }) {
  const { posterLine, posterTitle } = look.auth;
  return (
    <header className={`poster halftone${compact ? ' poster--compact' : ''}`}>
      <p className="poster__line eyebrow">{posterLine}</p>
      <h1 className="poster__title">
        {posterTitle.map((line, i) => (
          <span key={line}>
            {i > 0 ? compact ? ' ' : <br /> : null}
            {line}
          </span>
        ))}
      </h1>
      {sticker ? <span className="sticker poster__sticker">{sticker}</span> : null}
    </header>
  );
}
