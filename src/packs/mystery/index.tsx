import { lazy } from 'react';
import { markArt } from '../../components/MarkArt';
import type { PackLook } from '../types';
import { mark } from './mark';
import { CaseTitle } from './screens/CaseTitle';
import './theme.css';

const look: PackLook = {
  // The Manchester bee (mark.ts); brand.ts shows the same bee in index.html before the bundle boots.
  LoaderArt: markArt(mark),
  // The app bar on the board and the log book: your case number, as on your file.
  appTitle: CaseTitle,
  auth: {
    posterLine: 'The last night of Bob · one night only',
    posterTitle: ['Mystery', 'Pub Crawl'],
    sticker: 'Someone did it',
    lead:
      'The murder of Bob, a crawl full of suspects, and a case file with your name on it. Tamper with the evidence, frame a friend and keep your motive quiet.',
    signUpTitle: 'Your alias for the file',
    waitingText: 'Sit tight in the interview room; the Inspector will call you in shortly.',
    rejectedText: 'The Inspector has closed your file and you are free to go. If you think there has been a mistake, ask them in person.',
  },
  screens: {
    // Missions, Feed and My file at the bottom. Missions is a folder with Missions, Map and Standings tabs, so the map
    // lives in it: /map is the same folder opened on its Map tab.
    ...((board) => ({ home: board, map: board }))(lazy(() => import('./screens/Board'))),
    feed: lazy(() => import('./screens/TimelineFeed')),
    account: lazy(() => import('./screens/MyFile')),
    player: lazy(() => import('./screens/PlayerFile')),
    gm: lazy(() => import('./screens/GmLocker')),
    signIn: lazy(() => import('./screens/SignIn')),
    // The records check: one screen for asking to join, waiting on the GM and being turned down, so it keeps its
    // place (and never flashes the loader) as the join request moves on.
    ...((records) => ({ join: records, waiting: records, rejected: records }))(lazy(() => import('./booking/RecordsCheck'))),
    // The booking desk, once the GM has let them in and before the game.
    onboarding: lazy(() => import('./booking/Booking')),
    // A vote that needs you takes over the whole app: polaroids to swipe, then a cork board to choose on.
    vote: lazy(() => import('./screens/PolaroidVote')),
  },
  // The torch tour over the app: a specimen night lit one stop at a time (tour/; offered on Missions, the only way in).
  layer: lazy(() => import('./tour/TourHost')),
  error: { title: 'This page has been tampered with', body: 'Something broke on our side. Reload, or go back to the board.', home: 'Back to the board' },
  reward: { title: 'Evidence secured', clean: 'Destroy', frame: 'Frame', pickTitle: 'Frame who?' },
  // Frame who? as the suspect sheet, with who is close to a line under the two choices.
  rewardFrame: {
    picker: lazy(() => import('./screens/SuspectSheet')),
    hint: lazy(() => import('./screens/SuspectSheet').then((m) => ({ default: m.CloseToALine }))),
  },
};

export default look;
