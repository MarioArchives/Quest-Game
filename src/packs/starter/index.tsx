import type { PackLook } from '../types';
import './theme.css';

// A ticket stub in the same two passes as every pack's mark: a solid accent plate knocked off-register, and
// the ink line drawing in five tiers (outline, perforation, star, the star's centre, the stub's lines).
const PLATE: { shape: 'path' | 'rect'; attrs: Record<string, string | number> }[] = [
  { shape: 'rect', attrs: { x: 6, y: 16, width: 52, height: 32 } },
];

const TIERS = [
  // 1 the ticket outline with its two side notches
  'M6 16h52v10a4 4 0 0 0 0 8v14H6V34a4 4 0 0 0 0-8z',
  // 2 the perforation
  'M42 16v4M42 24v4M42 32v4M42 40v4',
  // 3 the star
  'M24 22l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z',
  // 4 text line on the stub
  'M47 24h6',
  // 5 second text line on the stub
  'M47 30h6M47 36h4',
];

function LoaderArt() {
  return (
    <>
      <g className="loader__plate">
        {PLATE.map(({ shape, attrs }, i) => (shape === 'rect' ? <rect key={i} {...attrs} /> : <path key={i} {...attrs} />))}
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
    posterLine: 'Secret challenges for your crew',
    posterTitle: ['Quest', 'Game'],
    sticker: 'Secret challenges',
    lead:
      'A secret challenge game for a group of friends. Everyone gets a hand of private challenges, photos are the proof, and the leaderboard decides who gets the glory.',
    signUpTitle: 'Your player face',
    waitingText: 'Sit tight, it will not be long.',
    rejectedText: 'No hard feelings. If you think this is a mix-up, have a word with them in person.',
  },
};

export default look;
