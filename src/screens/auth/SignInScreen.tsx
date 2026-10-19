import look from '@pack';
import { useState } from 'react';
import { backend } from '../../backend';
import type { MockAccount } from '../../backend/types';
import { Button } from '../../components/Button';
import { t } from '../../pack';
import { signInErrorMessage, useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

/**
 * What a sign-in screen needs: the mock backend's accounts to sign in as (null on Firebase, which has only the Google
 * pop-up), whether a sign-in is running, its error, and `signInAs` (an account's uid, or nothing for Google). Shared
 * by the engine's screen and a pack's own (`look.screens.signIn`).
 */
export function useSignIn() {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accounts = backend().auth.accounts?.() ?? null;

  const signInAs = async (uid?: string) => {
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

  return { accounts, busy, error, signInAs };
}

/** A mock account's button: the GM, a demo player, or a guest who has yet to ask to join. */
function mockAccountLabel(account: MockAccount): string {
  if (account.role === 'gm') return `Sign in as the ${t.gm.one}`;
  if (account.role === 'guest') return `Sign in as ${account.label}, not in yet`;
  return `Sign in as ${account.label}`;
}

export function SignInScreen() {
  const { accounts, busy, error, signInAs } = useSignIn();

  return (
    <div className="auth">
      <PosterHeader sticker={look.auth.sticker} />
      <main className="auth__main">
        <p className="auth__lead">{look.auth.lead}</p>
        <div className="auth__actions">
          {accounts ? (
            accounts.map((account) => (
              <Button key={account.uid} variant="primary" block busy={busy} onClick={() => signInAs(account.uid)}>
                {mockAccountLabel(account)}
              </Button>
            ))
          ) : (
            <Button variant="primary" block busy={busy} onClick={() => signInAs()}>
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
