import look from '@pack';
import { useState } from 'react';
import { backend } from '../../backend';
import { Button } from '../../components/Button';
import { t } from '../../pack';
import { signInErrorMessage, useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

export function SignInScreen() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The mock backend lists accounts to sign in as; Firebase has only the Google pop-up.
  const accounts = backend().auth.accounts?.() ?? null;

  const onSignIn = async (uid?: string) => {
    setBusy(true);
    setError(null);
    try {
      if (uid) await backend().auth.signIn(uid);
      else await signIn();
    } catch (err) {
      setError(signInErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <PosterHeader sticker={look.auth.sticker} />
      <main className="auth__main">
        <p className="auth__lead">{look.auth.lead}</p>
        <div className="auth__actions">
          {accounts ? (
            accounts.map((account) => (
              <Button key={account.uid} variant="primary" block busy={busy} onClick={() => onSignIn(account.uid)}>
                {account.role === 'gm' ? `Sign in as the ${t.gm.one}` : `Sign in as ${account.label}`}
              </Button>
            ))
          ) : (
            <Button variant="primary" block busy={busy} onClick={() => onSignIn()}>
              Sign in with Google
            </Button>
          )}
          {error ? (
            <p className="note note--error" role="alert">
              {error}
            </p>
          ) : null}
          {accounts ? (
            <p className="auth__fine">This is a demo with in-memory data. It resets when you reload the page.</p>
          ) : (
            <p className="auth__fine">We only use your name and photo. The {t.gm.One} approves everyone before they join.</p>
          )}
        </div>
      </main>
    </div>
  );
}
