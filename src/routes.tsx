import { lazy } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { AppFrame } from './screens/AppFrame';
import Dashboard from './screens/Dashboard';
import { RequireAdmin } from './screens/guards';
import { RouteError } from './screens/RouteError';

// Heavier / rarer screens are split out and show the Ashton loader while they load.
const AccountScreen = lazy(() => import('./screens/AccountScreen'));
const MapScreen = lazy(() => import('./screens/MapScreen'));
const GMConsole = lazy(() => import('./screens/gm/GMConsole'));
const WrapScreen = lazy(() => import('./screens/WrapScreen'));
const JoinScreen = lazy(() => import('./screens/JoinScreen'));
const StandingsScreen = lazy(() => import('./screens/StandingsScreen'));
const PlayerScreen = lazy(() => import('./screens/PlayerScreen'));

export const router = createHashRouter([
  {
    path: '/',
    element: <AppFrame />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'account', element: <AccountScreen /> },
      { path: 'map', element: <MapScreen /> },
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
