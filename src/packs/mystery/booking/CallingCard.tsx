// Save our number (from the UI mocks' calling card): after the booking, the detective's card dealt onto the desk under
// the torch, letterpress on cream stock with the force's honeycomb stamp for a crest and the number underlined in pen,
// so a player knows who it is when the police ring during the night. "Add to contacts" saves the caller (the GM's
// settings.policeCallerName and the number calls come from), "Copy number" copies it, and "I've saved it" moves on.
// With no number yet (a server whose phone calls aren't set up), the card says it comes with the first call.
import { useEffect, useRef, useState } from 'react';
import { buzz } from './feel';
import { addContact, copyText, type Added } from './contact';
import { HoneycombStamp } from './stamps';
import { showCallerId } from './suspect';
import './card.css';

type Said = Added | 'copied' | 'failed' | 'error';

/** The line under the actions after each one, read out too. */
const said = (what: Said, name: string): string => {
  switch (what) {
    case 'dialler':
      return `Your phone app opens with our number in. Tap “Create new contact” and call us ${name}.`;
    case 'card':
      return 'Tap “Create New Contact” to keep us. On a computer that’s a contact file. If nothing opened, copy the number.';
    case 'copied':
      return 'Copied. Paste it into a new contact.';
    case 'failed':
      return 'Couldn’t copy it. Write it down, then.';
    case 'error':
      return 'That didn’t work. Copy the number instead.';
  }
};

/** The caller's name across the card's two lines: the first word, then the rest. */
function splitName(name: string): [string, string] {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return rest.length ? [first, rest.join(' ')] : ['', first];
}

export function CallingCard({ name, number, onDone }: { name: string; number: string | null; onDone(): void }) {
  const [what, setWhat] = useState<Said | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(number === null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shown = number === null ? 'To follow' : showCallerId(number);
  const [line1, line2] = splitName(name);

  const save = async () => {
    if (number === null) return;
    buzz(14);
    try {
      setWhat(await addContact(name, number));
      setDone(true);
    } catch {
      setWhat('error');
    }
  };
  const copy = async () => {
    const ok = await copyText(shown);
    buzz(ok ? 10 : [8, 40, 8]);
    setWhat(ok ? 'copied' : 'failed');
    if (!ok) return;
    setDone(true);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="ph ph--desk">
      <div className="ph__beam" aria-hidden="true" />
      <header className="ph-head">
        <p className="ph-head__kicker">One more thing</p>
        <h1 className="ph-head__title">{number === null ? 'Look out for our call' : 'Save this number'}</h1>
        <p className="ph-head__copy">
          {number === null
            ? 'We’ll be in touch tonight. Our number comes with our first call: save it then, so you know it’s us. Don’t ignore us.'
            : 'We’ll be in touch tonight. The more suspicious you look, the more often we’ll ring. Don’t ignore us.'}
        </p>
      </header>
      <div className="ph-desk">
        <span className="ph-desk__ring" aria-hidden="true" />
        <article className="ph-card" aria-label={`${name}, ${shown}`}>
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
              <span className="ph-card__tel">Telephone</span>
              <span className={`ph-card__digits${number === null ? ' ph-card__digits--tbc' : ''}`}>
                {shown}
                {/* Someone at the desk has underlined it twice, in biro. */}
                {number === null ? null : (
                  <svg className="ph-card__pen" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                    <path pathLength={1} d="M2 5C48 2 118 7 198 3" />
                    <path pathLength={1} d="M16 11C74 8 128 12 186 9" />
                  </svg>
                )}
              </span>
            </p>
            <footer className="ph-card__foot">
              <span>Night desk</span>
              <span>Day or night · mostly night</span>
            </footer>
          </div>
        </article>
      </div>
      {number === null ? null : (
        <div className="ph-actions">
          <button type="button" className="ph-go" onClick={() => void save()}>
            <ContactIcon />
            Add to contacts
          </button>
          <button type="button" className={`ph-copy${copied ? ' is-copied' : ''}`} onClick={() => void copy()}>
            {copied ? <TickIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy number'}
          </button>
          <p className="ph-said" role="status">
            {what ? said(what, name) : ''}
          </p>
        </div>
      )}
      {/* The way on: quiet until they've saved or copied the number, then filled in. */}
      <div className="ph-foot">
        <button
          type="button"
          className={`ph-next${done ? ' is-ready' : ''}`}
          onClick={() => {
            buzz(30);
            onDone();
          }}
        >
          {number === null ? 'Got it' : 'I’ve saved it'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export function ContactIcon() {
  return (
    <svg className="ph-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10.8" r="2.3" />
      <path d="M5.8 16.2c.6-1.7 1.7-2.5 3.2-2.5s2.6.8 3.2 2.5M14.6 10h3.8M14.6 13.4h2.6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="ph-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8.5" y="8" width="11.5" height="13" rx="1.5" />
      <path d="M15.5 5V4.5A1.5 1.5 0 0 0 14 3H5.5A1.5 1.5 0 0 0 4 4.5V15A1.5 1.5 0 0 0 5.5 16.5H6" />
    </svg>
  );
}

export function TickIcon() {
  return (
    <svg className="ph-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
