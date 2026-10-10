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

export const router = createHashRouter([
  {
    path: '/',
    element: <AppFrame />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'account', element: <AccountScreen /> },
      { path: 'map', element: <MapScreen /> },
      // Old links: the hand and profile live on Account, the leaderboard is the strip at the top of Home.
      { path: 'quests', element: <Navigate to="/account" replace /> },
      { path: 'ranks', element: <Navigate to="/" replace /> },
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
