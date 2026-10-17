// Signed out (D3 · Torchlight): a dark room and a torch beam, crime-scene tape across the top and bottom, the title
// and a chalk outline in the light, and the way in as a little manila case file with a tab: sign in with Google (or,
// in the demo, as one of its people).
import look from '@pack';
import type { ReactNode } from 'react';
import { Loader } from '../../../components/Loader';
import { t } from '../../../pack';
import { useSignIn } from '../../../screens/auth/SignInScreen';
import './signin.css';

const TAPE = 'CRIME SCENE · DO NOT CROSS · '.repeat(8);

/** A chalk outline on the floor, with a couple of prints beside it. */
function Scene() {
  return (
    <div className="si__scene" aria-hidden="true">
      <svg viewBox="0 0 240 300" preserveAspectRatio="xMidYMid meet">
        <g transform="rotate(18 120 150)" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="16 3 9 2">
          <path d="M120 18a22 22 0 1 0 .1 0z M112 64 L80 80 L42 138 L58 150 L90 110 L94 182 L70 280 L94 286 L120 198 L146 286 L170 280 L148 182 L152 110 L182 150 L198 138 L160 80 L128 64" />
        </g>
        <g className="si__prints" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <g transform="translate(196 40) scale(1.4) rotate(12 12 12)">
            <Print />
          </g>
          <g transform="translate(8 218) scale(1.1) rotate(-20 12 12)">
            <Print />
          </g>
        </g>
      </svg>
    </div>
  );
}

function Print() {
  return (
    <>
      <path d="M5.5 10.5C6.6 6.6 9 5 12 5s5.4 1.6 6.5 5.5" />
      <path d="M4.8 15c0-1.4.1-2.6.4-3.7M19.2 12.5c.1 2.6-.3 5-1.1 7.2" />
      <path d="M7.4 18.5c-.4-1.5-.5-3-.4-4.5.2-4 2.3-6.6 5-6.6s4.8 2.6 4.9 6.6c0 1.6-.1 3.1-.5 4.6" />
      <path d="M9.9 20.6c-.6-1.7-.9-3.6-.8-5.6.1-3 1.3-4.6 2.9-4.6s2.9 1.6 3 4.6c.1 2-.3 4-1 5.8" />
      <path d="M12 13.8c.5 2.4.4 5-.4 7.6" />
    </>
  );
}

/** Google's "G", on the real sign-in only (the demo's people aren't Google accounts). */
const GOOGLE = (
  <span className="si-file__g">
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" />
    </svg>
  </span>
);

/** The way in: a little manila case file, its tab naming whose file it is. */
function CaseFile({ tab, icon, busy, onClick, children }: { tab: string; icon?: ReactNode; busy: boolean; onClick(): void; children: string }) {
  return (
    <button type="button" className="si-file" disabled={busy} aria-busy={busy || undefined} onClick={onClick}>
      <span className="si-file__tab" aria-hidden="true">
        {tab}
      </span>
      <span className="si-file__body">
        {busy ? <Loader size={24} label="Working" on="paper" /> : icon}
        <span>{children}</span>
      </span>
    </button>
  );
}

export default function SignIn() {
  const { accounts, busy, error, signInAs } = useSignIn();
  const { posterLine, posterTitle, sticker } = look.auth;

  return (
    <div className="si">
      <div className="si__beam" aria-hidden="true" />
      <div className="si__cordon si__cordon--top" aria-hidden="true">
        <span className="si__tape">{TAPE}</span>
        <span className="si__tape si__tape--thin">{TAPE}</span>
      </div>
      <header className="si__head">
        <p className="si__line">{posterLine}</p>
        <h1 className="si__title">
          {posterTitle.map((line, i) => (
            <span key={line}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h1>
        {sticker ? <p className="si__sticker">· {sticker} ·</p> : null}
      </header>
      <Scene />
      <div className="si__cordon si__cordon--bottom" aria-hidden="true">
        <span className="si__tape">{TAPE}</span>
        <span className="si__tape si__tape--thin">{TAPE}</span>
      </div>
      <main className="si__main">
        <p className="si__lead">Duck under the tape. Your case file is waiting.</p>
        {accounts ? (
          accounts.map((account) => (
            <CaseFile key={account.uid} tab={account.role === 'gm' ? `The ${t.gm.one}` : account.label} busy={busy} onClick={() => void signInAs(account.uid)}>
              {account.role === 'gm' ? `Sign in as the ${t.gm.one}` : `Sign in as ${account.label}`}
            </CaseFile>
          ))
        ) : (
          <CaseFile tab="Your file" icon={GOOGLE} busy={busy} onClick={() => void signInAs()}>
            Sign in with Google
          </CaseFile>
        )}
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="si__fine">
          {accounts
            ? 'This is a demo with in-memory data. It resets when you reload the page.'
            : `We only use your name and photo. The ${t.gm.One} approves everyone before they join.`}
        </p>
      </main>
    </div>
  );
}
