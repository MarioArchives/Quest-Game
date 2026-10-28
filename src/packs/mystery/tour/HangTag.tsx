// A kraft tag hanging upright on twine: the knot tied on the cord just above the tag with a short frayed end, the front
// strand over the top edge and down the face, the back strand going down behind, the tag riding the top of the hole,
// and a card washer glued round a metal grommet. The body is HTML (clipped corners and a hole, both cut by its outline);
// the rig over it is one SVG, so every tag hangs the same way at any size. Turned over (`flip`), the shape and the rig
// are mirrored top to bottom, eyelet and knot at the foot, and the words stay upright. Also the tags' few icons and
// their handwriting with the log book's eye and heart drawn in.
import { useId, type CSSProperties, type ReactNode, type Ref } from 'react';

export function HangTag({
  width,
  tilt = 0,
  flip = false,
  className,
  style,
  ref,
  children,
}: {
  width: number;
  /** Degrees off straight, about the knot. */
  tilt?: number;
  /** Turned over: the eyelet at the foot, for a tag tied to something under it. */
  flip?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div className={`tr-ht${flip ? ' tr-ht--flip' : ''}${className ? ` ${className}` : ''}`} style={{ ...style, width, ['--w' as string]: `${width}px`, ['--rot' as string]: `${tilt}deg` }} ref={ref}>
      <div className="tr-ht__shape">
        <div className="tr-ht__body" style={{ clipPath: outline(flip) }}>
          {children}
        </div>
      </div>
      <Rig />
    </div>
  );
}

/**
 * The tag's outline as one clip-path: the two clipped corners, and the hole (r 7, 32px in from the eyelet's edge) cut by
 * a slit of no width from that edge to a ring of points round it. A CSS mask for the hole would be simpler, but under
 * the shape's shadow it leaves ghosts of the tag on the page in Chrome on some GPUs.
 */
function outline(flip: boolean): string {
  const px = (v: number) => `${Math.round(v * 100) / 100}px`;
  const x = (dx: number) => (dx ? `calc(50% ${dx < 0 ? '-' : '+'} ${px(Math.abs(dx))})` : '50%');
  // From the edge nearest the eyelet: 0 is the top (or, turned over, the foot), going in.
  const y = (d: number) => (flip ? `calc(100% - ${px(d)})` : px(d));
  const ring = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * 2 * Math.PI;
    return `${x(7 * Math.sin(a))} ${y(32 - 7 * Math.cos(a))}`;
  });
  const hole = [`50% ${y(0)}`, ...ring, `50% ${y(0)}`];
  const points = flip
    ? ['0 0', '100% 0', '100% calc(100% - 26px)', 'calc(100% - 26px) 100%', ...hole, '26px 100%', '0 calc(100% - 26px)']
    : ['26px 0', ...hole, 'calc(100% - 26px) 0', '100% 26px', '100% 100%', '0 100%', '0 26px'];
  return `polygon(evenodd, ${points.join(', ')})`;
}

/** The twine and the eyelet, on a grid with the tag's top centre at 0,0 and the hole at 0,32. */
function Rig() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const above = `${id}-above`;
  const face = `${id}-face`;
  const hole = `${id}-hole`;
  const blur = `${id}-blur`;
  const strand = 'M2 -20 C 0.6 -12.5, -0.5 -6, -0.4 0.5 C -0.2 9, 0 17, 0 27';
  const back = 'M2.4 -19 C 4.8 -12.5, 6.6 -6.5, 6.6 3';
  const end = 'M-1.6 -19.2 C -5 -16.4, -7.4 -13.2, -8.8 -8.6';
  return (
    <svg className="tr-ht__rig" viewBox="-30 -40 60 90" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={above} clipPathUnits="userSpaceOnUse">
          <rect x="-40" y="-60" width="80" height="60" />
        </clipPath>
        <clipPath id={face} clipPathUnits="userSpaceOnUse">
          <rect x="-40" y="0" width="80" height="22.5" />
        </clipPath>
        <clipPath id={hole} clipPathUnits="userSpaceOnUse">
          <circle cx="0" cy="32" r="7" />
        </clipPath>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      {/* the back strand, in shade above the edge, then hidden behind the tag */}
      <g clipPath={`url(#${above})`}>
        <path d={back} className="tr-rig__shade" strokeWidth="3.4" />
        <path d={back} className="tr-rig__deep" strokeWidth="3.4" strokeDasharray="1.2 2.5" opacity="0.55" />
      </g>
      {/* the card washer and the grommet */}
      <path d="M0.9 17.3 a15.5 15.5 0 1 1 0 31 a15.5 15.5 0 1 1 0 -31 Z" className="tr-rig__washer-shadow" />
      <path d="M0 16.5 a15.5 15.5 0 1 1 0 31 a15.5 15.5 0 1 1 0 -31 Z M0 25 a7 7 0 1 0 0 14 a7 7 0 1 0 0 -14 Z" fillRule="evenodd" className="tr-rig__washer" />
      <circle cx="0" cy="32" r="13.3" className="tr-rig__stitch" />
      <path d="M0 21 a11 11 0 1 1 0 22 a11 11 0 1 1 0 -22 Z M0 25 a7 7 0 1 0 0 14 a7 7 0 1 0 0 -14 Z" fillRule="evenodd" className="tr-rig__ring" />
      <path d="M-8.3 27.4 A 9.2 9.2 0 0 1 3.6 22.9" className="tr-rig__shine" />
      <path d="M8.4 36.6 A 9.2 9.2 0 0 1 -3.4 40.8" className="tr-rig__dark" />
      <path d="M0 25 a7 7 0 0 1 6.6 4.7" className="tr-rig__lip" />
      {/* the front strand over the top edge and down the face, its shadow on the card */}
      <g clipPath={`url(#${face})`}>
        <path d={strand} transform="translate(1.9 2.3)" filter={`url(#${blur})`} className="tr-rig__deep" strokeWidth="3.2" opacity="0.42" />
      </g>
      <path d={strand} className="tr-rig__twine" strokeWidth="3.4" />
      <path d={strand} className="tr-rig__twist" strokeWidth="3.4" />
      <path d="M1.1 -17 C 0 -10, -0.9 -4, -1.2 1 C -1 9, -0.8 16, -0.8 23" className="tr-rig__hi" />
      {/* through the eyelet, riding the top of the hole and darkening as it turns through */}
      <g clipPath={`url(#${hole})`}>
        <path d="M0 23.5 L0 30.6" className="tr-rig__shade" strokeWidth="3.8" />
        <ellipse cx="0" cy="30.4" rx="2.2" ry="1.5" className="tr-rig__knotfill-deep" />
        <path d="M-6.8 30 a7 7 0 0 1 13.6 0" className="tr-rig__deep" strokeWidth="1" opacity="0.5" />
      </g>
      {/* the knot, with a short frayed end */}
      <path d={end} className="tr-rig__twine" strokeWidth="3" />
      <path d={end} className="tr-rig__twist" strokeWidth="3" strokeDasharray="1.1 2.4" />
      <path d="M-8.8 -8.6 l -.7 2.6 M-8.8 -8.6 l .9 2.4 M-8.8 -8.6 l -2 1.5" className="tr-rig__fray" />
      <ellipse cx="1.6" cy="-21.4" rx="5.1" ry="3.4" transform="rotate(-18 1.6 -21.4)" className="tr-rig__knot" />
      <path d="M-2.6 -22.4 q 4 -2.6 8.4 -.6" className="tr-rig__fray" />
      <ellipse cx="2.7" cy="-18.3" rx="4.6" ry="3" transform="rotate(14 2.7 -18.3)" className="tr-rig__knot" />
      <path d="M-1.2 -18.8 q 3.8 2 8 .2" className="tr-rig__fray" />
    </svg>
  );
}

/** A brass map tack, pinned through the twine into whatever is lit. */
export function Tack({ x, y }: { x: number; y: number }) {
  return <span className="tr-tack" style={{ left: x - 9, top: y - 9 }} aria-hidden="true" />;
}

function Ic({ d }: { d: string }) {
  return (
    <svg className="tr-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export const ArrowIcon = () => <Ic d="M5 12h14M13 6l6 6-6 6" />;
export const CheckIcon = () => <Ic d="M5 12l5 5L19 7" />;
export const PlayIcon = () => <Ic d="M8 5l11 7-11 7z" />;

/** The eye and the heart as the log book draws them (screens/VoteMarks.tsx). */
const MARKS = {
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
};

/** A stop's words, with {heart} and {eye} drawn as the marks (and read out as their names). */
export function TagText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{heart\}|\{eye\})/).map((part, i) => {
        const kind = part === '{heart}' ? 'heart' : part === '{eye}' ? 'eye' : null;
        if (!kind) return part;
        return (
          <svg key={i} className={`tr-mk tr-mk--${kind}`} viewBox="0 0 24 24" role="img" aria-label={kind}>
            <path d={MARKS[kind]} />
          </svg>
        );
      })}
    </>
  );
}

/** A stop's words as plain text, the marks spelt out (what a screen reader hears, and the tests read). */
export const tagWords = (text: string) => text.replace(/\{(heart|eye)\}/g, '$1');
