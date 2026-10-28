import { lazy } from 'react';
import look from '@pack';
import { createHashRouter, Navigate } from 'react-router';
import { features } from './pack';
import { AppFrame } from './screens/AppFrame';
import Dashboard from './screens/Dashboard';
import { RequireAdmin } from './screens/guards';
import { RouteError } from './screens/RouteError';

// Heavier / rarer screens are split out and show the loader while they load.
const AccountScreen = look.screens?.account ?? lazy(() => import('./screens/AccountScreen'));
const MapScreen = lazy(() => import('./modules/map/MapScreen'));
const GMConsole = look.screens?.gm ?? lazy(() => import('./screens/gm/GMConsole'));
const WrapScreen = look.screens?.wrap ?? lazy(() => import('./screens/WrapScreen'));
const JoinScreen = lazy(() => import('./screens/JoinScreen'));
const StandingsScreen = lazy(() => import('./screens/StandingsScreen'));
const PlayerScreen = look.screens?.player ?? lazy(() => import('./screens/PlayerScreen'));

const HomeScreen = look.screens?.home;
const FeedScreen = look.screens?.feed;
// A pack may host the map in a screen of its own (e.g. a folder tab on its Home); /map then opens that.
const MapHost = look.screens?.map ?? MapScreen;

export const router = createHashRouter([
  {
    path: '/',
    element: <AppFrame />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: HomeScreen ? <HomeScreen /> : <Dashboard /> },
      // A pack's own feed screen, on its own tab (packs without one have the feed on Home).
      { path: 'feed', element: FeedScreen ? <FeedScreen /> : <Navigate to="/" replace /> },
      { path: 'account', element: <AccountScreen /> },
      // The map only exists in packs that switch it on.
      features.map ? { path: 'map', element: <MapHost /> } : { path: 'map', element: <Navigate to="/" replace /> },
      // The full leaderboard, and any player's record (photos, quests done and failed, points history).
      { path: 'standings', element: <StandingsScreen /> },
      { path: 'player/:uid', element: <PlayerScreen /> },
      // Old links: the hand and profile live on Account.
      { path: 'quests', element: <Navigate to="/account" replace /> },
      { path: 'ranks', element: <Navigate to="/standings" replace /> },
      {
        path: 'gm',
        element: (
          <RequireAdmin>
            <GMConsole />
          </RequireAdmin>
        ),
      },
      { path: 'wrap', element: <WrapScreen /> },
      { path: 'join', element: <JoinScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
