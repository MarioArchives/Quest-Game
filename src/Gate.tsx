import look from '@pack';
import { Suspense, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { packMismatch } from '../functions/src/shared/packs/index.ts';
import { Loader } from './components/Loader';
import { PhotoViewerProvider } from './components/PhotoViewer';
import { ToastProvider } from './components/Toast';
import { GameProvider, useGame } from './data/GameProvider';
import { LocationProvider } from './data/LocationProvider';
import { pack, t } from './pack';
import { router } from './routes';
import { RejectedScreen } from './screens/auth/RejectedScreen';
import { SignInScreen } from './screens/auth/SignInScreen';
import { SignUpScreen } from './screens/auth/SignUpScreen';
import { WaitingScreen } from './screens/auth/WaitingScreen';
import { useSession } from './session/SessionProvider';

/** The pack's own signed-out screen, when it has one. */
const PackSignIn = look.screens?.signIn;

/** Blocks the app when the data was seeded for a different game than this build. */
function PackCheck({ children }: { children: ReactNode }) {
  const { state } = useGame();
  if (packMismatch(state.pack, pack.id)) {
    return (
      <main className="gate-block" role="alert" style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <h1>Wrong game</h1>
        <p>
          This site is built for <strong>{pack.id}</strong>, but the game data is for <strong>{state.pack}</strong>.
        </p>
        <p>{t.gm.One}: rebuild the site for the right game, or re-seed the data.</p>
      </main>
    );
  }
  return <>{children}</>;
}

/** Decides what the signed-in state sees: sign in, sign up, waiting, rejected, or the app. */
export function Gate() {
  const session = useSession();

  if (session.phase === 'loading') {
    return <Loader fullScreen size={96} label={`Loading ${pack.name}`} caption={pack.name} />;
  }
  if (session.phase === 'signed-out') {
    return PackSignIn ? (
      <Suspense fallback={<Loader fullScreen size={96} label={`Loading ${pack.name}`} caption={pack.name} />}>
        <PackSignIn />
      </Suspense>
    ) : (
      <SignInScreen />
    );
  }

  if (session.player || session.isAdmin) {
    return (
      <ToastProvider>
        <GameProvider>
          <PackCheck>
            <LocationProvider>
              <PhotoViewerProvider>
                <RouterProvider router={router} />
              </PhotoViewerProvider>
            </LocationProvider>
          </PackCheck>
        </GameProvider>
      </ToastProvider>
    );
  }

  if (session.editingSignup || !session.joinRequest) {
    return <SignUpScreen onCancel={session.joinRequest ? () => session.setEditingSignup(false) : undefined} />;
  }
  if (session.joinRequest.status === 'rejected') return <RejectedScreen />;
  return <WaitingScreen />;
}
