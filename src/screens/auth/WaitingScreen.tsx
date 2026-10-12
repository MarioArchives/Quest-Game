import look from '@pack';
import { Loader } from '../../components/Loader';
import { Button } from '../../components/Button';
import { t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

/** Join request submitted: live via onSnapshot in the session; flips to the app when approved. */
export function WaitingScreen() {
  const { joinRequest, setEditingSignup, signOut } = useSession();
  const approved = joinRequest?.status === 'approved';
  const status = approved ? `Dealing your ${t.quest.many}` : `Waiting for the ${t.gm.One}`;
  const name = joinRequest?.displayName?.split(' ')[0] ?? 'friend';
  return (
    <div className="auth">
      <PosterHeader compact />
      <main className="auth__main auth__main--centre">
        <Loader size={96} label={status} caption={status} />
        <div className="auth__copy" aria-live="polite">
          {approved ? (
            <>
              <h2>You&apos;re in, {name}</h2>
              <p>Shuffling the deck. Your secret {t.quest.many} will appear in a second.</p>
            </>
          ) : (
            <>
              <h2>You&apos;re on the list, {name}</h2>
              <p>
                Your request is with the {t.gm.One}. This page updates by itself the moment you&apos;re in, so no need to
                refresh. {look.auth.waitingText}
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
