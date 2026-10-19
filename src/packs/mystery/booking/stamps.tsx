// The Manchester Metropolitan Police's marks for the booking desk (from the UI mocks' stamp sheet): the worker bee, the
// honeycomb stamp (the letter's seal and the calling card's crest) and the star badge on the letterhead. Each is one ink
// (currentColor, so CSS sets the colour) on a viewBox about 100 wide, roughened and mottled by a filter so it prints
// like a rubber stamp rather than flat vector.
import { useId } from 'react';

/** Ids for one stamp's defs that are unique on the page and safe in url(#…) (useId gives ':r1:'). */
const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, '');

const MONO = "var(--mono, 'Space Mono', ui-monospace, monospace)";
const DISPLAY = "var(--display, 'Archivo Black', 'Arial Black', sans-serif)";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** The point `r` out from (cx, cy), `deg` degrees clockwise from three o'clock. */
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
};
const toPoints = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ');
/** A hexagon lying flat (a side at the top and bottom), as polygon points. */
const hexagon = (cx: number, cy: number, r: number) => toPoints([0, 60, 120, 180, 240, 300].map((d) => polar(cx, cy, r, d)));
/** A five-pointed star, point up. */
const star = (cx: number, cy: number, r: number) =>
  toPoints(Array.from({ length: 10 }, (_, i) => polar(cx, cy, i % 2 ? r * 0.42 : r, -90 + i * 36)));

/**
 * Rubber on paper: every edge nudged by fine noise (ink creeping into the fibres), pinpricks where the ink didn't take,
 * and broad patches pressed lighter. The noise is in viewBox units, so the texture scales with the stamp.
 */
function InkFilter({ id, seed }: { id: string; seed: number }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves={2} seed={seed} result="fibre" />
      <feDisplacementMap in="SourceGraphic" in2="fibre" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="ragged" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" seed={seed + 1} result="grain" />
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -10 7.5" result="specks" />
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={seed + 2} result="press" />
      <feColorMatrix in="press" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 2.15" result="pressure" />
      <feComposite in="ragged" in2="specks" operator="in" result="specked" />
      <feComposite in="specked" in2="pressure" operator="in" />
    </filter>
  );
}

/* ---------------------------------------------------------------- the bee */

// Drawn head up around (0, 0), about 43 wide and 47 tall. Every sub-path runs clockwise, so overlaps fill rather than cancel.
const HEAD = 'M-4 -15.5a4 4 0 1 1 8 0a4 4 0 1 1 -8 0Z';
const THORAX = 'M-5.6 -7.5a5.6 5.2 0 1 1 11.2 0a5.6 5.2 0 1 1 -11.2 0Z';
const ABDOMEN = 'M0 -2C6.5 -2 8.6 4 8.2 9.5C7.8 15 3.6 19 0 22.5C-3.6 19 -7.8 15 -8.2 9.5C-8.6 4 -6.5 -2 0 -2Z';
const BODY = HEAD + THORAX + ABDOMEN;
/** The stripes are paper showing through: bands bowed towards the tail, as the segments are seen from above. */
const STRIPES = [3.4, 8.8, 14.2].map((y) => `M-10 ${r2(y - 1.4)}Q0 ${r2(y + 2.6)} 10 ${r2(y - 1.4)}`);
const FEELER = 'M-1.5 -18.5Q-2.6 -22.5 -6 -23.6';
// The right-hand wings, drawn from the root outwards along +x, then set at the shoulder; the left are their mirror.
const FOREWING = 'M0 0C3 -5 12 -7.5 17.5 -5.5C21.5 -4 21.5 0.5 17.5 2C12.5 3.8 4.5 2.8 0 0Z';
const FORE_VEIN = 'M2.5 0.3C8 -1.6 13 -2 17 -1.2';
const FORE_AT = 'translate(3 -9) rotate(-25)';
const HINDWING = 'M0 0C2.5 -3.6 9 -4.6 12.5 -3C15 -1.8 14.6 1.6 12 2.4C8.5 3.5 3 2.4 0 0Z';
const HIND_AT = 'translate(3.2 -5.5) rotate(10)';
const SIDES = [1, -1];

/** The worker bee, from above with its wings spread, centred on (x, y); about 43 × 47 at size 1. */
export function Bee({ x, y, size }: { x: number; y: number; size: number }) {
  const uid = useUid();
  const box = { x: -30, y: -30, width: 60, height: 60 };
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <defs>
        {/* A hairline of paper between the wings and the body, and the hind wings tucked under the fore. */}
        <mask id={`w${uid}`} maskUnits="userSpaceOnUse" {...box}>
          <rect {...box} fill="#fff" />
          <path d={BODY} fill="#000" stroke="#000" strokeWidth="2.6" />
        </mask>
        <mask id={`h${uid}`} maskUnits="userSpaceOnUse" {...box}>
          <rect {...box} fill="#fff" />
          {SIDES.map((side) => (
            <path key={side} d={FOREWING} transform={`scale(${side} 1) ${FORE_AT}`} fill="#000" stroke="#000" strokeWidth="2.6" />
          ))}
        </mask>
        <mask id={`s${uid}`} maskUnits="userSpaceOnUse" {...box}>
          <rect {...box} fill="#fff" />
          {STRIPES.map((d) => (
            <path key={d} d={d} fill="none" stroke="#000" strokeWidth="2.4" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#w${uid})`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <g mask={`url(#h${uid})`}>
          {SIDES.map((side) => (
            <path key={side} d={HINDWING} transform={`scale(${side} 1) ${HIND_AT}`} />
          ))}
        </g>
        {SIDES.map((side) => (
          <g key={side} transform={`scale(${side} 1) ${FORE_AT}`}>
            <path d={FOREWING} />
            <path d={FORE_VEIN} strokeWidth="1" />
          </g>
        ))}
      </g>
      {SIDES.map((side) => (
        <g key={side} transform={`scale(${side} 1)`}>
          <path d={FEELER} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="-6" cy="-23.6" r="1.25" fill="currentColor" />
        </g>
      ))}
      <path d={HEAD + THORAX} fill="currentColor" />
      <path d={ABDOMEN} fill="currentColor" mask={`url(#s${uid})`} />
      <path d={ABDOMEN} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · honeycomb */

// A hexagon lying flat, centred on (50, 44). The name's baseline runs inside the border on a smaller hexagon, clockwise
// from the bottom-left corner round to the bottom-right, its corners rounded so the words bend round them rather than
// kink; C.I.D. sits straight along the bottom between two solid cells.
const HC = { x: 50, y: 44 };
const HEX_TEXT_R = 33.95;
const HEX_ROUND = 13;

/** The path through a hexagon's corners from `from` to `to` degrees (clockwise, every 60), each inner corner rounded. */
function hexRun(r: number, from: number, to: number, round: number) {
  const corners: [number, number][] = [];
  for (let d = from; d <= to; d += 60) corners.push(polar(HC.x, HC.y, r, d));
  const cut = round * Math.tan(Math.PI / 6);
  const toward = ([x, y]: [number, number], [tx, ty]: [number, number]) => {
    const len = Math.hypot(tx - x, ty - y);
    return `${r2(x + ((tx - x) / len) * cut)} ${r2(y + ((ty - y) / len) * cut)}`;
  };
  let d = `M${corners[0]!.join(' ')}`;
  for (let i = 1; i < corners.length - 1; i++) {
    d += `L${toward(corners[i]!, corners[i - 1]!)}A${round} ${round} 0 0 1 ${toward(corners[i]!, corners[i + 1]!)}`;
  }
  d += `L${corners[corners.length - 1]!.join(' ')}`;
  // Each rounded corner is a little shorter than the two straight bits it replaces.
  const length = (corners.length - 1) * r - (corners.length - 2) * (2 * cut - (round * Math.PI) / 3);
  return { d, length };
}

const HEX_NAME = hexRun(HEX_TEXT_R, 120, 420, HEX_ROUND);
/** Space left at each end of the name for the cells at the bottom corners. */
const HEX_NAME_GAP = 5;
const HEX_NAME_LEN = r2(HEX_NAME.length - 2 * HEX_NAME_GAP);

/** A honeycomb cell: a hexagonal stamp with a double border, the name round the inside, and the bee in an inner cell. */
export function HoneycombStamp({ className }: { className?: string }) {
  const uid = useUid();
  return (
    <svg className={className} viewBox="0 0 100 88" aria-hidden="true">
      <defs>
        <InkFilter id={`i${uid}`} seed={21} />
        <path id={`n${uid}`} d={HEX_NAME.d} />
      </defs>
      <g filter={`url(#i${uid})`}>
        <g fill="none" stroke="currentColor" strokeLinejoin="round">
          <polygon points={hexagon(HC.x, HC.y, 47.5)} strokeWidth="2.6" />
          <polygon points={hexagon(HC.x, HC.y, 43.6)} strokeWidth="1.1" />
          <polygon points={hexagon(HC.x, HC.y, 30)} strokeWidth="1.8" />
        </g>
        <g fill="currentColor" fontWeight="700" style={{ fontFamily: MONO }}>
          <text fontSize="7.8">
            <textPath href={`#n${uid}`} startOffset={HEX_NAME_GAP} textLength={HEX_NAME_LEN} lengthAdjust="spacing">
              MANCHESTER METROPOLITAN POLICE
            </textPath>
          </text>
          <text x={HC.x} y={HC.y + 34.6} fontSize="7" textAnchor="middle">
            C.I.D.
          </text>
          <polygon points={hexagon(...polar(HC.x, HC.y, 37.1, 120), 2.5)} />
          <polygon points={hexagon(...polar(HC.x, HC.y, 37.1, 60), 2.5)} />
        </g>
        <Bee x={HC.x} y={HC.y + 1} size={0.84} />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- the force's badge, for the letterhead */

// A star badge in the old police way, printed in one ink: an eight-pointed star with a knurled face, a crown on its top
// point, a ring carrying the force's name, and the bee in the middle. Drawn round (50, 66); the viewBox runs from -4 so
// the cross on the crown fits.
const BADGE_STAR = toPoints(Array.from({ length: 16 }, (_, i) => polar(50, 66, i % 2 ? 33 : 46, -90 + i * 22.5)));
const BADGE_TIPS = Array.from({ length: 8 }, (_, i) => polar(50, 66, 45, -90 + i * 45));
// The name runs clockwise from seven o'clock over the top to five, on a circle of 22.8 so it sits in the middle of the
// ring (20–29); a small star fills the gap at the foot.
const BADGE_FROM = polar(50, 66, 22.8, 120);
const BADGE_TO = polar(50, 66, 22.8, 60);
const BADGE_NAME = `M${BADGE_FROM.join(' ')}A22.8 22.8 0 1 1 ${BADGE_TO.join(' ')}`;
const BADGE_NAME_LEN = r2((300 / 180) * Math.PI * 22.8);

/** The letterhead badge: knock-outs are in `--badge-paper` (the paper it's printed on), the rest in currentColor. */
export function PoliceBadge({ className }: { className?: string }) {
  const uid = useUid();
  const paper = 'var(--badge-paper, #f1f0ec)';
  return (
    <svg className={className} viewBox="0 -4 100 120" aria-hidden="true">
      <defs>
        {/* Fine crossed lines at 45°: the diamond knurling of a cast badge. */}
        <pattern id={`k${uid}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill={paper} />
          <path d="M0 0H3M0 0V3" stroke="currentColor" strokeWidth="0.75" />
        </pattern>
        <path id={`n${uid}`} d={BADGE_NAME} />
      </defs>
      <polygon points={BADGE_STAR} fill={`url(#k${uid})`} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* A ridge down each point, so the star reads as bevelled. */}
      <path d={BADGE_TIPS.map(([x, y]) => `M50 66L${x} ${y}`).join('')} stroke="currentColor" strokeWidth="1" />
      <circle cx="50" cy="66" r="30.5" fill={paper} />
      <circle cx="50" cy="66" r="29" fill="currentColor" />
      <circle cx="50" cy="66" r="20" fill={paper} />
      <circle cx="50" cy="66" r="18.4" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <text fill={paper} fontSize="5.4" fontWeight="700" letterSpacing="0.3" style={{ fontFamily: DISPLAY }}>
        <textPath href={`#n${uid}`} textLength={BADGE_NAME_LEN} lengthAdjust="spacing">
          MANCHESTER METROPOLITAN POLICE
        </textPath>
      </text>
      <polygon points={star(50, 90.5, 2.6)} fill={paper} />
      <Bee x={50} y={67} size={0.62} />
      {/* The crown on the top point: arches and fleurs over a jewelled band, a cross on top. */}
      <g fill="currentColor">
        <path d="M49.1 -3H50.9V-1.2H52.7V0.6H50.9V3.4H49.1V0.6H47.3V-1.2H49.1Z" />
        <path d="M37 20L35 9.5Q38.4 11.2 41.2 12L44.2 5.4L47.4 11.2L50 3.6L52.6 11.2L55.8 5.4L58.8 12Q61.6 11.2 65 9.5L63 20Z" />
        <rect x="36" y="19" width="28" height="6.4" rx="1.2" />
      </g>
      <g fill={paper}>
        {[40, 45, 50, 55, 60].map((x) => (
          <circle key={x} cx={x} cy="22.2" r="1.1" />
        ))}
      </g>
    </svg>
  );
}
