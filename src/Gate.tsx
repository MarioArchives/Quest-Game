import { RouterProvider } from 'react-router';
import { AshtonLoader } from './components/AshtonLoader';
import { PhotoViewerProvider } from './components/PhotoViewer';
import { ToastProvider } from './components/Toast';
import { GameProvider } from './data/GameProvider';
import { LocationProvider } from './data/LocationProvider';
import { router } from './routes';
import { RejectedScreen } from './screens/auth/RejectedScreen';
import { SignInScreen } from './screens/auth/SignInScreen';
import { SignUpScreen } from './screens/auth/SignUpScreen';
import { WaitingScreen } from './screens/auth/WaitingScreen';
import { useSession } from './session/SessionProvider';

/** Decides what the signed-in state sees: sign in, sign up, waiting, rejected, or the app. */
export function Gate() {
  const session = useSession();

  if (session.phase === 'loading') {
    return <AshtonLoader fullScreen size={96} label="Loading Festival Quest" caption="Festival Quest" />;
  }
  if (session.phase === 'signed-out') return <SignInScreen />;

  if (session.player || session.isAdmin) {
    return (
      <ToastProvider>
        <GameProvider>
          <LocationProvider>
            <PhotoViewerProvider>
              <RouterProvider router={router} />
            </PhotoViewerProvider>
          </LocationProvider>
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
