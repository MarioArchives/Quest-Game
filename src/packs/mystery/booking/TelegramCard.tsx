// The police on Telegram (settings.policeTelegram, or just policeTelegramNumber for an account with no username): in place
// of the calling card, the detective's card is dealt with the police's Telegram account on it, so a player knows to expect a Telegram call tonight. First "Got
// Telegram on this phone?": no sends them to their phone's app store (sign up with the mobile they just gave, then come
// back); yes leaves one way on, the test call.
import { useState } from 'react';
import { telegramStore } from '../../../lib/telegram';
import { buzz } from './feel';
import { HoneycombStamp } from './stamps';
import { showCallerId } from './suspect';
import './card.css';

type Have = 'yes' | 'no' | null;

export function TelegramCard({
  name,
  username,
  number,
  mobile,
  onDone,
}: {
  /** Who the police are (settings.policeCallerName). */
  name: string;
  /** The police's Telegram username, if the account has one. */
  username: string | null;
  /** The account's number (E.164): shown on the card, and in place of a username the account doesn't have. */
  number: string | null;
  /** The mobile they gave, to sign up to Telegram with. */
  mobile: string | null;
  /** On to the test call (the card's only way on). */
  onDone(): void;
}) {
  const [have, setHave] = useState<Have>(null);
  const store = telegramStore(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const [line1, line2] = rest.length ? [first, rest.join(' ')] : ['', first];
  // The account as the card shows it: its username, else its number.
  const handle = username ? `@${username}` : number ? showCallerId(number) : '';

  return (
    <div className="ph ph--desk">
      <div className="ph__beam" aria-hidden="true" />
      <header className="ph-head">
        <p className="ph-head__kicker">One more thing</p>
        <h1 className="ph-head__title">We ring on Telegram</h1>
        <p className="ph-head__copy">
          Tonight we call you on Telegram, as {name}. When it rings, answer: it’s us. The more suspicious you look, the more often we’ll ring.
        </p>
      </header>
      <div className="ph-desk">
        <span className="ph-desk__ring" aria-hidden="true" />
        <article className="ph-card" aria-label={`${name}, Telegram ${handle}`}>
          <div className="ph-card__face">
            <header className="ph-card__head">
              <HoneycombStamp className="ph-card__stamp" />
              <div className="ph-card__org">
                <strong className="ph-card__name">
                  {line1 ? <span>{line1}</span> : null} <span>{line2}</span>
                </strong>
                <span className="ph-card__dept">Criminal Investigation Dept.</span>
              </div>
            </header>
            <p className="ph-card__num">
              <span className="ph-card__tel">Telegram</span>
              <span className="ph-card__digits">
                {handle}
                <svg className="ph-card__pen" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d="M2 5C48 2 118 7 198 3" />
                  <path pathLength={1} d="M16 11C74 8 128 12 186 9" />
                </svg>
              </span>
            </p>
            <footer className="ph-card__foot">
              <span>{number && username ? showCallerId(number) : 'Night desk'}</span>
              <span>Day or night · mostly night</span>
            </footer>
          </div>
        </article>
      </div>

      {have === null ? (
        <div className="ph-actions">
          <p className="ph-ask">Got Telegram on this phone?</p>
          <button type="button" className="ph-go" onClick={() => setHave('yes')}>
            Yes, I have it
          </button>
          <button type="button" className="ph-copy" onClick={() => setHave('no')}>
            No, not yet
          </button>
        </div>
      ) : have === 'no' ? (
        <div className="ph-actions">
          <p className="ph-said ph-said--lead">
            It’s free. Install it and sign up with {mobile ? `your mobile, ${mobile},` : 'your mobile'} so we can find you, then come back here.
          </p>
          <a className="ph-go" href={store.href} target="_blank" rel="noopener noreferrer" onClick={() => buzz(14)}>
            <TelegramIcon />
            {store.label}
          </a>
          <button type="button" className="ph-copy" onClick={() => setHave('yes')}>
            I’ve got it now
          </button>
        </div>
      ) : (
        <div className="ph-actions">
          <button
            type="button"
            className="ph-go"
            onClick={() => {
              buzz(30);
              onDone();
            }}
          >
            Next: a test call <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Telegram's paper plane, drawn in the card's line style. */
function TelegramIcon() {
  return (
    <svg className="ph-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 4 3 11.2l6.2 2.3L19 6.5l-7.6 8.6v4.4l3.1-3.4 4 3L21 4Z" />
    </svg>
  );
}
