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
const WrapScreen = lazy(() => import('./screens/WrapScreen'));
const JoinScreen = lazy(() => import('./screens/JoinScreen'));
const StandingsScreen = lazy(() => import('./screens/StandingsScreen'));
const PlayerScreen = look.screens?.player ?? lazy(() => import('./screens/PlayerScreen'));

const HomeScreen = look.screens?.home;

export const router = createHashRouter([
  {
    path: '/',
    element: <AppFrame />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: HomeScreen ? <HomeScreen /> : <Dashboard /> },
      { path: 'account', element: <AccountScreen /> },
      // The map only exists in packs that switch it on.
      features.map ? { path: 'map', element: <MapScreen /> } : { path: 'map', element: <Navigate to="/" replace /> },
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
