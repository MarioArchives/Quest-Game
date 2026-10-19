import type { ComponentType } from 'react';
import { markParts } from '../lib/loaderMark';
import type { LoaderMark } from '../packs/types';

/**
 * A pack's LoaderArt drawn from its mark data (src/packs/<id>/mark.ts): the shapes index.html's pre-boot figure is
 * built from too (lib/loaderMark.ts), so the two can't drift apart.
 */
export function markArt(mark: LoaderMark): ComponentType {
  const { plate, tiers } = markParts(mark);
  function LoaderArt() {
    return (
      <>
        <g className="loader__plate">
          {plate.map(({ tag: Shape, className, attrs }, i) => (
            <Shape key={i} className={className} {...attrs} />
          ))}
        </g>
        <g className="loader__ink" fill="none" strokeWidth={mark.strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          {tiers.map(({ className, d }, i) => (
            <path key={i} className={className} d={d} pathLength={1} />
          ))}
        </g>
      </>
    );
  }
  return LoaderArt;
}
