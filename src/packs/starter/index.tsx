import { markArt } from '../../components/MarkArt';
import type { PackLook } from '../types';
import { mark } from './mark';
import './theme.css';

const look: PackLook = {
  // The ticket stub (mark.ts); brand.ts shows it in index.html before the bundle boots too.
  LoaderArt: markArt(mark),
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
