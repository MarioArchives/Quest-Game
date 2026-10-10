import { AshtonLoader } from '../../components/AshtonLoader';
import { Button } from '../../components/Button';
import { useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

/** Join request submitted: live via onSnapshot in the session; flips to the app when approved. */
export function WaitingScreen() {
  const { joinRequest, setEditingSignup, signOut } = useSession();
  const approved = joinRequest?.status === 'approved';
  const name = joinRequest?.displayName?.split(' ')[0] ?? 'friend';
  return (
    <div className="auth">
      <PosterHeader compact />
      <main className="auth__main auth__main--centre">
        <AshtonLoader size={96} label={approved ? 'Dealing your quests' : 'Waiting for the GM'} caption={approved ? 'Dealing your quests' : 'Waiting for the GM'} />
        <div className="auth__copy" aria-live="polite">
          {approved ? (
            <>
              <h2>You&apos;re in, {name}</h2>
              <p>Shuffling the deck. Your secret quests will appear in a second.</p>
            </>
          ) : (
            <>
              <h2>You&apos;re on the list, {name}</h2>
              <p>
                Your request is with the GM. This page updates by itself the moment you&apos;re in, so no need to refresh. Go
                and find a good spot near the stage.
              </p>
            </>
          )}
        </div>
        {approved ? null : (
          <div className="auth__actions auth__actions--row">
            <Button onClick={() => setEditingSignup(true)}>Edit my details</Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
