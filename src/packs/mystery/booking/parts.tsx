// Pieces every desk of the booking uses (from the UI mocks' booking desk): the force's letterboard over the desk, who
// is signed in, the stamps, the paperclip and a labelled field on a manila sheet.
import { useId, type ReactNode } from 'react';
import { backend } from '../../../backend';
import { useSession } from '../../../session/SessionProvider';

/** The force on every letterhead, board and card of the booking. */
export const FORCE = 'Manchester Metropolitan Police';

/** The force's board over the desk, with what this desk is for. */
export function Board({ title }: { title: string }) {
  return (
    <header className="bk-board">
      <span className="bk-board__line">{FORCE}</span>
      <span className="bk-board__title">{title}</span>
    </header>
  );
}

/** Google's "G", for the signed-in chip (the demo's people aren't Google accounts). */
function GoogleG() {
  return (
    <span className="bk-who__g" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
        <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
        <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" />
      </svg>
    </span>
  );
}

/** "Signed in as Sam Rivers · Not you?", which signs out. */
export function SignedInAs() {
  const { user, signOut } = useSession();
  const google = !backend().auth.accounts;
  return (
    <div className="bk-who">
      {google ? <GoogleG /> : null}
      <span>
        Signed in as <strong>{user?.displayName || user?.email || 'you'}</strong>
      </span>
      <button type="button" className="bk-who__out" onClick={() => void signOut()}>
        Not you?
      </button>
    </div>
  );
}

export function Paperclip({ className }: { className?: string }) {
  return (
    <svg className={`bk-clip${className ? ` ${className}` : ''}`} width="16" height="44" viewBox="0 0 16 44" aria-hidden="true">
      <path d="M5 40 V8 a3 3 0 0 1 6 0 V34 a5 5 0 0 1 -10 0 V12" fill="none" stroke="var(--eyelet)" strokeWidth="2" />
    </svg>
  );
}

export function Stamp({ tone, className, children }: { tone: 'red' | 'teal'; className?: string; children: ReactNode }) {
  return <span className={`bk-stamp bk-stamp--${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}

/** A labelled field on a booking sheet; when it's `missing`, a small red stamp on its label says so. */
export function Field({
  label,
  hint,
  missing = false,
  stamp = 'Needed',
  children,
}: {
  label: string;
  hint?: ReactNode;
  missing?: boolean;
  /** What the stamp says when it's missing or wrong. */
  stamp?: string;
  children(id: string, hintId: string | undefined): ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={`bk-field${missing ? ' is-missing' : ''}`}>
      <label className="bk-label" htmlFor={id}>
        {label}
        {missing ? (
          <Stamp tone="red" className="bk-stamp--tiny">
            {stamp}
          </Stamp>
        ) : null}
      </label>
      {children(id, hint ? hintId : undefined)}
      {hint ? (
        <span id={hintId} className="bk-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
