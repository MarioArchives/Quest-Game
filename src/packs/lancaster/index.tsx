import type { PackLook } from '../types';
import './theme.css';

// The Ashton Memorial, direction C "Screenprint" (design/ashton-memorial.svg, the master; keep these in sync).
// Two passes, like a two-colour gig-poster print: a solid red plate knocked off-register by (+1.6, +1.4),
// and the 2px round-capped ink line drawing in five tiers, bottom to top.
const PLATE: { shape: 'path' | 'rect'; attrs: Record<string, string | number> }[] = [
  { shape: 'path', attrs: { d: 'M29.6 11V7.2a2.4 2.4 0 0 1 4.8 0V11z' } },
  { shape: 'path', attrs: { d: 'M23 20a9 9.5 0 0 1 18 0z' } },
  { shape: 'rect', attrs: { x: 23.5, y: 20, width: 17, height: 5.5 } },
  { shape: 'rect', attrs: { x: 16.5, y: 23, width: 4.5, height: 14.5 } },
  { shape: 'rect', attrs: { x: 43, y: 23, width: 4.5, height: 14.5 } },
  { shape: 'rect', attrs: { x: 21, y: 25.5, width: 22, height: 12 } },
  { shape: 'rect', attrs: { x: 13, y: 37.5, width: 38, height: 14.5 } },
  { shape: 'rect', attrs: { x: 6, y: 52, width: 52, height: 9 } },
];

const TIERS = [
  // 1 podium with the one central stair
  'M6 52h52M6 61v-9M58 61v-9M27 61v-9M37 61v-9M27 55h10M27 58h10M3 61h58',
  // 2 colonnaded main block with its arched door
  'M11.5 37.5h41M13 52V37.5M51 52V37.5M17.5 52V40.5M22 52V40.5M42 52V40.5M46.5 52V40.5M28.5 52v-6a3.5 3.5 0 0 1 7 0v6',
  // 3 upper storey and the four corner cupolas
  'M16.5 37.5V23h4.5v14.5M43 37.5V23h4.5v14.5M16.5 23a2.25 2.25 0 0 1 4.5 0M43 23a2.25 2.25 0 0 1 4.5 0M18.75 20.75V19M45.25 20.75V19M21 25.5h22M25 37.5V28M29 37.5V28M35 37.5V28M39 37.5V28M30.5 36v-4.5a1.5 1.5 0 0 1 3 0V36',
  // 4 drum and dome
  'M22 20h20M23.5 25.5V20M40.5 25.5V20M28 25.5V20M32 25.5V20M36 25.5V20M23 20a9 9.5 0 0 1 18 0',
  // 5 lantern and finial
  'M32 1.5v3M30 7a2 2 0 0 1 4 0M30 10.5V7h4v3.5',
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
    posterLine: 'Lancaster Music Festival · 8–11 Oct 2026',
    posterTitle: ['Festival', 'Quest'],
    sticker: 'Secret side quests',
    lead:
      'A secret side-quest game for the festival crew. Everyone gets a hand of private quests, photos are the proof, and the leaderboard decides who gets the glory.',
    signUpTitle: 'Your festival face',
    waitingText: 'Go and find a good spot near the stage.',
    rejectedText:
      'No hard feelings, and there is plenty of music to enjoy either way. If you think this is a mix-up, have a word with them in person.',
  },
};

export default look;
