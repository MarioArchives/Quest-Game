// Signed out (the UI mocks' booking desk): a dark room lit only by a police car's red and blue from the left, police tape
// pulled across the top and the bottom as it opens, the title, a sprawled chalk outline with a little blood, and the
// way in as a manila file standing up from the bottom of the screen, the sign-in typed on its label. In the demo the
// label is a list of its people to sign in as.
import { useState } from 'react';
import { Loader } from '../../../components/Loader';
import { t } from '../../../pack';
import type { MockAccount } from '../../../backend/types';
import { useSignIn } from '../../../screens/auth/SignInScreen';
import './signin.css';

/** A demo person on their label, under the file's "Sign in as" tab. */
const who = (account: MockAccount) =>
  account.role === 'gm' ? `The ${t.gm.One}` : account.role === 'guest' ? `${account.label} · not in yet` : account.label;

export default function SignIn() {
  const { accounts, busy, error, signInAs } = useSignIn();
  // The demo label being signed in as, which shows the bee while it works.
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="si">
      <div className="si__siren" aria-hidden="true" />
      <div className="si__cordon si__cordon--top" aria-hidden="true">
        <span className="si__tape" />
        <span className="si__tape si__tape--thin" />
      </div>
      <header className="si__head">
        {/* Three lines, the murder biggest; the spaces between keep the name whole when it's read out. */}
        <h1 className="si__title">
          <span className="si__title-a">A Manchester</span> <span className="si__title-b">Murder:</span>{' '}
          <span className="si__title-c">Pub Crawl</span>
        </h1>
      </header>
      <ChalkOutline />
      <div className="si__cordon si__cordon--bottom" aria-hidden="true">
        <span className="si__tape" />
        <span className="si__tape si__tape--thin" />
      </div>
      <main className="si__main">
        <p className="si__lead">Duck under the tape. Your case file is waiting.</p>
        {error ? (
          <p className="note note--error si__error" role="alert">
            {error}
          </p>
        ) : null}
        {accounts ? (
          // The demo: one file, its label a list of the people in it.
          <div className="si-file si-file--list">
            <span className="si-file__tab" id="si-pick">
              Sign in as
            </span>
            <span className="si-file__back">
              <span className="si-file__papers" aria-hidden="true" />
              <span className="si-file__front">
                <span className="si-file__picks" role="group" aria-labelledby="si-pick">
                  {accounts.map((account) => {
                    const going = busy && picked === account.uid;
                    return (
                      <button
                        key={account.uid}
                        type="button"
                        className="si-file__label si-file__pick"
                        disabled={busy}
                        aria-busy={going || undefined}
                        onClick={() => {
                          setPicked(account.uid);
                          void signInAs(account.uid);
                        }}
                      >
                        {going ? <Loader size={22} label="Signing in" on="paper" /> : null}
                        {who(account)}
                      </button>
                    );
                  })}
                </span>
                <span className="si-file__fine">This is a demo with in-memory data. It resets when you reload the page.</span>
              </span>
            </span>
          </div>
        ) : (
          <button type="button" className="si-file" disabled={busy} aria-busy={busy || undefined} onClick={() => void signInAs()}>
            <span className="si-file__tab" aria-hidden="true">
              Your file
            </span>
            <span className="si-file__back">
              <span className="si-file__papers" aria-hidden="true" />
              <span className="si-file__front">
                <span className="si-file__label">{busy ? <Loader size={22} label="Signing in" on="paper" /> : 'Sign in with Google'}</span>
                <span className="si-file__fine">We only use your name and photo, and your number if you give it. The {t.gm.One} approves everyone before they join.</span>
              </span>
            </span>
          </button>
        )}
      </main>
    </div>
  );
}

/**
 * A chalk outline on the floor, sprawled: one arm flung up past the head, the other out and down, a knee bent out to
 * the side. A spatter of blood by the head and a few drops around, no more.
 */
function ChalkOutline() {
  return (
    <div className="si__scene" aria-hidden="true">
      <svg viewBox="0 0 240 300" preserveAspectRatio="xMidYMid meet">
        <g transform="rotate(-26 120 150)">
          <g className="si__chalk" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="16 3 9 2">
            <circle cx="114" cy="44" r="20" />
            <path d="M104 66L54 58L62 26L60 12L46 8L40 16L32 70L90 96L98 160L46 214L54 276L48 292L76 294L78 268L70 226L118 186L146 236L166 282L170 296L196 292L190 276L174 230L152 166L150 104L186 128L196 164L200 180L212 182L220 164L208 108L144 80L128 70Z" />
          </g>
          <g className="si__blood">
            <path d="M150 28c6-3 12 1 12 7s-5 10-11 9c-5-1-8-5-7-9 1-3 3-6 6-7z" />
            <circle cx="166" cy="24" r="1.8" />
            <circle cx="163" cy="47" r="1.3" />
            <circle cx="143" cy="22" r="1.2" />
            <ellipse cx="62" cy="128" rx="2.6" ry="1.8" transform="rotate(30 62 128)" />
            <circle cx="69" cy="135" r="1.2" />
            <circle cx="226" cy="196" r="2" />
            <circle cx="24" cy="200" r="1.6" />
          </g>
        </g>
      </svg>
    </div>
  );
}
