import { lazy } from 'react';
import type { PackLook } from '../types';
import './theme.css';

// A magnifying glass in the same two passes as every pack's mark: a solid teal plate (lens and handle) knocked
// off-register, and the ink line drawing in five tiers (handle, lens ring, glint, a fingerprint whorl, a tick).
const PLATE: { shape: 'path' | 'circle'; attrs: Record<string, string | number> }[] = [
  { shape: 'circle', attrs: { cx: 27, cy: 27, r: 17 } },
  { shape: 'path', attrs: { d: 'M38.5 42.5L51 55a3 3 0 0 0 4.2-4.2L42.7 38.3z' } },
];

const TIERS = [
  // 1 the handle
  'M38.5 42.5L51 55a3 3 0 0 0 4.2-4.2L42.7 38.3',
  // 2 the lens ring
  'M44 27a17 17 0 1 1-34 0a17 17 0 0 1 34 0z',
  // 3 the glint on the glass
  'M16.5 22a11 11 0 0 1 7.5-7',
  // 4 a fingerprint whorl inside the lens
  'M24 29v-2a3 3 0 0 1 6 0v2M21 32v-5a6 6 0 0 1 12 0v1M18 33v-6a9 9 0 0 1 18 0',
  // 5 a tick for the evidence logged
  'M8 53l4.5 4.5L22 47',
];

function LoaderArt() {
  return (
    <>
      <g className="loader__plate">
        {PLATE.map(({ shape, attrs }, i) => (shape === 'circle' ? <circle key={i} {...attrs} /> : <path key={i} {...attrs} />))}
      </g>
      <g className="loader__ink" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {TIERS.map((d, i) => (
          <path key={i} className={`loader__tier loader__tier--${i + 1}`} d={d} pathLength={1} />
        ))}
      </g>
    </>
  );
}

const look: PackLook = {
  LoaderArt,
  auth: {
    posterLine: 'Blackwood Manor · one night only',
    posterTitle: ['Mystery', 'Pub Crawl'],
    sticker: 'Someone did it',
    lead:
      'A murder at Blackwood Manor, a crawl full of suspects, and a case file with your name on it. Tamper with the evidence, frame a friend and keep your motive quiet.',
    signUpTitle: 'Your alias for the file',
    waitingText: 'Sit tight in the interview room; the Inspector will call you in shortly.',
    rejectedText: 'The Inspector has closed your file and you are free to go. If you think there has been a mistake, ask them in person.',
  },
  screens: {
    home: lazy(() => import('./screens/Board')),
    account: lazy(() => import('./screens/MyFile')),
  },
  reward: { title: 'Evidence secured', clean: 'Destroy', frame: 'Frame', pickTitle: 'Frame who?' },
};

export default look;
