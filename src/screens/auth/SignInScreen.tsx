import { useState } from 'react';
import { Button } from '../../components/Button';
import { signInErrorMessage, useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

export function SignInScreen() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <PosterHeader sticker="Secret side quests" />
      <main className="auth__main">
        <p className="auth__lead">
          A secret side-quest game for the festival crew. Everyone gets a hand of private quests, photos are the proof, and
          the leaderboard decides who gets the glory.
        </p>
        <div className="auth__actions">
          <Button variant="primary" block busy={busy} onClick={onSignIn}>
            Sign in with Google
          </Button>
          {error ? (
            <p className="note note--error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="auth__fine">We only use your name and photo. The GM approves everyone before they join.</p>
        </div>
      </main>
    </div>
  );
}
