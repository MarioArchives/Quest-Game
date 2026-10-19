import { markArt } from '../../components/MarkArt';
import type { PackLook } from '../types';
import { mark } from './mark';
import './theme.css';

const look: PackLook = {
  // The Ashton Memorial (mark.ts); brand.ts shows it in index.html before the bundle boots too.
  LoaderArt: markArt(mark),
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
