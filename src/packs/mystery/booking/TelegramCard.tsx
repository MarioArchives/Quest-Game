// The police on Telegram (settings.policeTelegram, or just policeTelegramNumber for an account with no username): in place
// of the calling card and the test call, the detective's card is dealt with the police's Telegram account on it, so a player knows to expect a Telegram call tonight. First "Got
// Telegram on this phone?": no sends them to their phone's app store (sign up with the mobile they just gave, then come
// back); yes opens the police's chat with a hello already typed ("Reporting for duty", their name and case number),
// which also lets the police's account find and ring them. "Add to contacts" saves the account's number where the GM
// gave one, for players whose Telegram only takes calls from contacts. "I've said hello" moves on; they can skip it.
import { useState } from 'react';
import { telegramChatLink, telegramStore } from '../../../lib/telegram';
import { ContactIcon, TickIcon } from './CallingCard';
import { buzz } from './feel';
import { addContact, type Added } from './contact';
import { HoneycombStamp } from './stamps';
import { showCallerId } from './suspect';
import './card.css';

type Have = 'yes' | 'no' | null;

export function TelegramCard({
  name,
  username,
  number,
  hello,
  mobile,
  onDone,
  onSkip,
}: {
  /** Who the police are (settings.policeCallerName). */
  name: string;
  /** The police's Telegram username, if the account has one. */
  username: string | null;
  /** The account's number (E.164): the contact card, and the chat link when it has no username. */
  number: string | null;
  /** The message typed into the chat for them. */
  hello: string;
  /** The mobile they gave, to sign up to Telegram with. */
  mobile: string | null;
  onDone(): void;
  onSkip(): void;
}) {
  const [have, setHave] = useState<Have>(null);
  const [said, setSaid] = useState(false);
  const [saved, setSaved] = useState<Added | 'error' | null>(null);
  const store = telegramStore(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const [line1, line2] = rest.length ? [first, rest.join(' ')] : ['', first];
  // The account as the card shows it and the chat link finds it: its username, else its number.
  const handle = username ? `@${username}` : number ? showCallerId(number) : '';
  const chat = telegramChatLink(username ?? number ?? '', hello);

  const save = async () => {
    if (!number) return;
    buzz(14);
    try {
      setSaved(await addContact(name, number));
    } catch {
      setSaved('error');
    }
  };

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
          <a
            className="ph-go"
            href={chat}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              buzz(14);
              setSaid(true);
            }}
          >
            <TelegramIcon />
            Say hello on Telegram
          </a>
          {number ? (
            <button type="button" className={`ph-copy${saved && saved !== 'error' ? ' is-copied' : ''}`} onClick={() => void save()}>
              {saved && saved !== 'error' ? <TickIcon /> : <ContactIcon />}
              Add us to your contacts
            </button>
          ) : null}
          <p className="ph-said" role="status">
            {saved === 'error'
              ? 'That didn’t work. Save the number on the card by hand.'
              : saved === 'dialler'
                ? `Your phone app opens with our number in. Tap “Create new contact” and call us ${name}.`
                : saved === 'card'
                  ? 'Tap “Create New Contact” to keep us.'
                  : said
                    ? 'Send the message we typed for you, then come back here.'
                    : 'Telegram opens our chat with your hello typed in. Send it, so we can ring you.'}
          </p>
        </div>
      )}

      {/* The way on: quiet until they've said hello, then filled in; or they carry on with the police in the app. */}
      <div className="ph-foot">
        <button
          type="button"
          className={`ph-next${said ? ' is-ready' : ''}`}
          onClick={() => {
            buzz(30);
            if (said) onDone();
            else onSkip();
          }}
        >
          {said ? 'I’ve said hello' : 'Skip: reach me in the app'} <span aria-hidden="true">→</span>
        </button>
      </div>
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
