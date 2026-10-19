// The records check (the Gate's join, waiting and rejected screens, from the UI mocks' booking desk): signed in, their
// name goes to the GM at once as a join request (their Google name and photo; they can change both at the booking), and
// a green screen runs it through the suspect register while the duty inspector decides. Once the GM lets them in the
// Gate moves on to the booking, which opens on the same screen, cleared; turned down, the file is closed.
import look from '@pack';
import { useEffect, useRef, useState } from 'react';
import { friendlyError, requestJoin } from '../../../api';
import { Loader } from '../../../components/Loader';
import type { JoinScreenProps } from '../../types';
import { useSession } from '../../../session/SessionProvider';
import { DISPLAY_NAME_MAX } from '../../../shared';
import { Terminal } from './Checks';
import { Board } from './parts';
import './booking.css';

/** The name the request goes in under: their Google name, or the front of their email. */
export function nameFromAccount(user: { displayName: string | null; email: string | null } | null): string {
  const name = (user?.displayName ?? '').trim() || (user?.email ?? '').split('@')[0]!.trim();
  return name.slice(0, DISPLAY_NAME_MAX).trim() || 'Unknown';
}

export default function RecordsCheck(_props: JoinScreenProps) {
  const { user, joinRequest, signOut } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestJoin({ displayName: nameFromAccount(user), photoURL: user?.photoURL ?? null });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  // No request yet: send it straight away, once.
  useEffect(() => {
    if (joinRequest || asked.current) return;
    asked.current = true;
    void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRequest]);

  const closed = joinRequest?.status === 'rejected';
  const name = joinRequest?.displayName ?? nameFromAccount(user);
  return (
    <div className="bk">
      <div className="bk__beam" aria-hidden="true" />
      <Board title="Records check" />
      <section className="bk-check">
        <Terminal name={name} verdict={closed ? 'closed' : 'reviewing'} />
        <p className="bk-lead" role="status">
          {closed
            ? look.auth.rejectedText
            : error
              ? `The desk couldn’t send your name in: ${error}`
              : 'Hold tight. The duty inspector is deciding whether you’re a person of interest. This page moves on by itself.'}
        </p>
        {closed ? null : error ? (
          <div className="bk-next">
            <button type="button" className="bk-go" disabled={busy} aria-busy={busy || undefined} onClick={() => void ask()}>
              {busy ? <Loader size={24} label="Sending your name in" /> : null}
              Try again
            </button>
          </div>
        ) : (
          <div className="bk-wait">
            <span className="bk-wait__dot" aria-hidden="true" />
            {joinRequest ? 'Under review' : 'Sending your name in'}
          </div>
        )}
        <button type="button" className="bk-back bk-back--center" onClick={() => void signOut()}>
          {closed ? 'Sign out' : 'Not you? Sign out'}
        </button>
      </section>
    </div>
  );
}
