import look from '@pack';
import { Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { packMismatch } from '../functions/src/shared/packs/index.ts';
import { Loader } from './components/Loader';
import { PhotoViewerProvider } from './components/PhotoViewer';
import { SimulatedPhone } from './components/SimulatedPhone';
import { ToastProvider } from './components/Toast';
import { GameProvider, useGame } from './data/GameProvider';
import { LocationProvider } from './data/LocationProvider';
import { SCREEN_LOADER_SIZE } from './lib/loaderMark';
import { pack, t } from './pack';
import { router } from './routes';
import { RejectedScreen } from './screens/auth/RejectedScreen';
import { SignInScreen } from './screens/auth/SignInScreen';
import { SignUpScreen } from './screens/auth/SignUpScreen';
import { WaitingScreen } from './screens/auth/WaitingScreen';
import { useSession } from './session/SessionProvider';
import { needsBooking } from './shared';

/** The pack's own screens for the way in, where it has them (see PackLook.screens). */
const PackSignIn = look.screens?.signIn;
const PackJoin = look.screens?.join;
const PackWaiting = look.screens?.waiting;
const PackRejected = look.screens?.rejected;
const PackOnboarding = look.screens?.onboarding;

// index.html shows the same loader before the bundle boots (lib/loaderMark.ts), so keep the two alike.
const loading = () => <Loader fullScreen size={SCREEN_LOADER_SIZE} label={`Loading ${pack.name}`} caption={pack.name} />;

/**
 * A pack's screen, lazily loaded. Always the same element shape, so a pack that uses one component for joining, waiting
 * and being turned down keeps its state as the join request moves on.
 */
function packScreen<P extends object>(Screen: ComponentType<P>, props: P) {
  return (
    <Suspense fallback={loading()}>
      <Screen {...props} />
    </Suspense>
  );
}

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

/** Decides what the signed-in state sees: sign in, sign up, waiting, rejected, the pack's onboarding, or the app. */
export function Gate() {
  const session = useSession();
  // Let in, but not booked in yet: the pack's onboarding first. GMs go straight in to run the game, and get it only when
  // they ask for it from their file (and may go back without booking in).
  const booking = Boolean(PackOnboarding && session.player && needsBooking(session.player) && (!session.isAdmin || session.bookingOpen));

  // Meanwhile the app waits on Home, so finishing the onboarding opens it there (where a pack shows what comes next),
  // not on whatever page a link or a notification had opened.
  useEffect(() => {
    if (booking && router.state.location.pathname !== '/') void router.navigate('/', { replace: true });
  }, [booking]);

  if (session.phase === 'loading') return loading();
  if (session.phase === 'signed-out') return PackSignIn ? packScreen(PackSignIn, {}) : <SignInScreen />;

  if (session.player || session.isAdmin) {
    return (
      <ToastProvider>
        <GameProvider>
          <PackCheck>
            {booking && PackOnboarding ? (
              packScreen(PackOnboarding, { onCancel: session.isAdmin ? () => session.setBookingOpen(false) : undefined })
            ) : (
              <LocationProvider>
                <PhotoViewerProvider>
                  <RouterProvider router={router} />
                </PhotoViewerProvider>
              </LocationProvider>
            )}
            <SimulatedPhone />
          </PackCheck>
        </GameProvider>
      </ToastProvider>
    );
  }

  if (session.editingSignup || !session.joinRequest) {
    const onCancel = session.joinRequest ? () => session.setEditingSignup(false) : undefined;
    return PackJoin ? packScreen(PackJoin, { onCancel }) : <SignUpScreen onCancel={onCancel} />;
  }
  if (session.joinRequest.status === 'rejected') return PackRejected ? packScreen(PackRejected, {}) : <RejectedScreen />;
  return PackWaiting ? packScreen(PackWaiting, {}) : <WaitingScreen />;
}
