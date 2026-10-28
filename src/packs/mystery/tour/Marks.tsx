// The tour's red pen, as on the game's map (its "next?" arrow): a curved arrow to where the tour goes next (a folder
// tab, a tab at the foot, a face, a button). It is drawn as if by hand (stroke-dashoffset); with reduced motion it is
// there at once (tour.css). Every stroke is red over a pale halo, so it reads on the dark and on paper alike. Nothing is
// written, and nothing drawn round what's lit: the torch does that. The geometry is marks.ts.
import type { CSSProperties } from 'react';
import { arrowPaths, type Box, type Pt } from './marks';

const at = (delay: number, dur = 0.5) => ({ '--delay': `${delay}s`, '--dur': `${dur}s` }) as CSSProperties;

/** One pen stroke: the halo, then the red, drawn together. */
function Stroke({ d, delay, dur }: { d: string; delay: number; dur?: number }) {
  return (
    <>
      <path d={d} pathLength={1} className="tr-pen__halo tr-pen__draw" style={at(delay, dur)} />
      <path d={d} pathLength={1} className="tr-pen__ink tr-pen__draw" style={at(delay, dur)} />
    </>
  );
}

/** A curved arrow from one box to another (bowed away from `away`, when given); nothing when it would be a stub. */
export function Arrow({ from, to, screen, away, delay = 0 }: { from: Box; to: Box; screen: { w: number; h: number }; away?: Pt; delay?: number }) {
  const a = arrowPaths(from, to, screen, away);
  if (!a) return null;
  return (
    <>
      <Stroke d={a.shaft} delay={delay} dur={0.45} />
      <Stroke d={a.head} delay={delay + 0.42} dur={0.16} />
    </>
  );
}
