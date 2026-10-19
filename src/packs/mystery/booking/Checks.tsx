// The checks either side of the booking (from the UI mocks' booking desk): the records check's green screen, which runs
// their name while the GM decides; the police's test call to the mobile they gave (last, once they've saved the
// police's number), with Twilio's real progress and result; and the case opening, which books them in.
import { useEffect, useId, useRef, useState } from 'react';
import { friendlyError, testPoliceLine, toApiError } from '../../../api';
import { Loader } from '../../../components/Loader';
import { describeTestResult, type PhoneTestResult, type PlayerPhone } from '../../../shared';
import { buzz, lessMotion } from './feel';
import { offersApp, testCallWords, type DeskCall } from './telegramDesk';
import { Stamp } from './parts';
import { cleanUkNumber, isUkMobile, showUkNumber, typedCountryCode } from './suspect';

/* ---------------------------------------------------------------- the records check */

export type Verdict = 'reviewing' | 'cleared' | 'closed';

const dots = (label: string, width = 22) => `${label} `.padEnd(width, '.');

/**
 * Their name run through the suspect register on a green screen, line by line (all at once with `typed` off or less
 * motion), ending on the duty inspector (the GM): reviewing, cleared (PERSON OF INTEREST stamped across it) or the file
 * closed. Read out by the sentence under it, not line by line.
 */
export function Terminal({ name, verdict, typed = true }: { name: string; verdict: Verdict; typed?: boolean }) {
  const lines = [
    `QUERY  ${name.toUpperCase()}`,
    `${dots('GUEST LIST')} ${verdict === 'closed' ? 'NOT TONIGHT' : 'ON IT'}`,
    `${dots('PRIOR RECORD')} NONE`,
    `${dots('MOTIVE')} UNKNOWN`,
    `${dots('DUTY INSPECTOR')} ${verdict === 'cleared' ? 'CLEARED' : verdict === 'closed' ? 'FILE CLOSED' : 'REVIEWING'}`,
  ];
  const [shown, setShown] = useState(() => (typed && !lessMotion() ? 0 : lines.length));

  useEffect(() => {
    if (shown >= lines.length) return;
    const timer = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 850);
    return () => window.clearTimeout(timer);
  }, [shown, lines.length]);

  const done = shown >= lines.length;
  return (
    <div className={`bk-term${verdict === 'cleared' ? ' is-cleared' : ''}`} aria-hidden="true">
      <span className="bk-term__head">MMP suspect register</span>
      {lines.slice(0, shown).map((line, i) => (
        <span key={i} className={`bk-term__line${i === lines.length - 1 && verdict === 'reviewing' ? ' is-waiting' : ''}`}>
          {line}
        </span>
      ))}
      {!done || verdict === 'reviewing' ? <span className="bk-term__caret" /> : null}
      {done && verdict === 'cleared' ? <Stamp tone="teal" className="bk-term__stamp">Person of interest</Stamp> : null}
      {done && verdict === 'closed' ? <Stamp tone="red" className="bk-term__stamp bk-term__stamp--closed">Released</Stamp> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- the test call */

/** How the test call is going; 'off' when this server has no phone line to ring with (Twilio not set up). */
type Call = DeskCall;

/** Results that are the player's to put right (the number, the ringer, the keypad), rather than the system's. */
const THEIRS: PhoneTestResult[] = ['wrong-code', 'no-digits', 'no-answer', 'busy', 'voicemail'];

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The last check: with the police's number saved, the police ring the mobile they gave (testPoliceLine), to be sure
 * they can be reached. Dialling, ringing (pick up, key in the code read out), then answered and on; or a miss, with the
 * reason, and a choice of ringing again, fixing the number right here, or carrying on with the police in the app.
 * Where phone calls aren't set up on the server at all, it says so and carries on.
 */
export function TestCall({
  line,
  onDone,
  onSkip,
  onNumber,
  via = 'phone',
}: {
  /** Their line (phones/{uid}), live. */
  line: PlayerPhone | null;
  onDone(): void;
  onSkip(): void;
  /** Saves a new number (the digits); rejects with what was wrong. */
  onNumber(digits: string): Promise<void>;
  /** The line the test rings on; the words follow it. */
  via?: 'phone' | 'telegram';
}) {
  const words = testCallWords(via);
  const [testId, setTestId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [off, setOff] = useState(false);
  const started = useRef(false);

  const ring = async () => {
    setFailure(null);
    setBusy(true);
    try {
      const result = await testPoliceLine();
      setTestId(result.testId);
      if (!result.ringing) setFailure(result.message ?? "The test call didn't go through");
    } catch (err) {
      const e = toApiError(err);
      if (e.reason === 'not-set-up') setOff(true);
      else setFailure(e.message);
    } finally {
      setBusy(false);
    }
  };

  // On arrival: a line already tested is through; a test already on its way is followed; otherwise ring it.
  useEffect(() => {
    if (started.current || !line) return;
    started.current = true;
    if (line.status === 'verified') return;
    if (line.test && line.test.result === null) setTestId(line.test.id);
    else void ring();
  }, [line]);

  const test = line?.test && testId !== null && line.test.id === testId ? line.test : null;
  const call: Call = off
    ? 'off'
    : failure
      ? 'missed'
      : test?.result === 'passed' || (testId === null && !busy && line?.status === 'verified')
        ? 'answered'
        : test?.result
          ? 'missed'
          : busy || !test
            ? 'dialling'
            : test.status === 'ringing'
              ? 'ringing'
              : test.status === 'in-progress'
                ? 'keying'
                : 'dialling';

  useEffect(() => {
    if (call === 'answered') buzz([20, 40, 20]);
    else if (call === 'missed') buzz([8, 40, 8]);
  }, [call]);

  const digits = line ? cleanUkNumber(line.number) : '';
  const number = showUkNumber(digits);
  const why = failure ?? (test?.result && test.result !== 'passed' ? describeTestResult(test.result, test.errorCode) : null);
  const theirs = Boolean(test?.result && THEIRS.includes(test.result));
  const status =
    call === 'dialling'
      ? words.dialling(number)
      : call === 'ringing'
        ? words.ringing
        : call === 'keying'
          ? words.keying
          : call === 'answered'
            ? words.answered
            : call === 'off'
              ? `${via === 'telegram' ? 'The Telegram line' : 'Phone calls'} isn’t set up yet, so the police will reach you in the app for now.`
              : `${sentence(why ?? 'No answer')}${theirs ? words.missedHint : ''}`;

  return (
    <section className="bk-call" aria-labelledby="bk-call-title">
      <h1 id="bk-call-title" className="bk-call__title">
        A test call
      </h1>
      <p className="bk-call__note">
        {call === 'off'
          ? 'One last thing: we’d ring you to be sure we can reach you, but the lines aren’t connected yet.'
          : words.note}
      </p>

      <div className={`bk-call__panel is-${call === 'keying' ? 'ringing' : call}`}>
        <span className="bk-call__plate">MMP switchboard · Line 1</span>
        <div className="bk-call__handset" aria-hidden="true">
          <span className="bk-call__ring" />
          <span className="bk-call__ring bk-call__ring--2" />
          <svg viewBox="0 0 24 24">
            <path d="M6.6 3.5 9 3a1 1 0 0 1 1.1.6l1.2 2.9a1 1 0 0 1-.3 1.2L9.6 8.9a12 12 0 0 0 5.5 5.5l1.2-1.4a1 1 0 0 1 1.2-.3l2.9 1.2a1 1 0 0 1 .6 1.1l-.5 2.4a1.5 1.5 0 0 1-1.5 1.2C10.6 18.6 5.4 13.4 5.4 5a1.5 1.5 0 0 1 1.2-1.5Z" />
          </svg>
        </div>
        <span className="bk-call__number">{number}</span>
        <p className="bk-call__status" role="status" aria-live="polite">
          {status}
        </p>
        {call === 'answered' ? <Stamp tone="teal" className="bk-call__stamp">Reachable</Stamp> : null}
      </div>

      {editing ? (
        <NumberFix
          digits={digits}
          onSave={async (next) => {
            await onNumber(next);
            setEditing(false);
            setTestId(null);
            await ring();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : call === 'answered' ? (
        <button type="button" className="bk-go" onClick={onDone}>
          Next <span aria-hidden="true">→</span>
        </button>
      ) : call === 'off' ? (
        <button type="button" className="bk-go" onClick={onSkip}>
          Carry on <span aria-hidden="true">→</span>
        </button>
      ) : call === 'missed' ? (
        <div className="bk-call__retry">
          <button type="button" className="bk-go" disabled={busy} aria-busy={busy || undefined} onClick={() => void ring()}>
            {busy ? <Loader size={24} label="Ringing you" /> : null}
            Ring me again
          </button>
          <button type="button" className="bk-back bk-back--center" onClick={() => setEditing(true)}>
            Change my number
          </button>
          {offersApp(call) ? (
            <button type="button" className="bk-back bk-back--center" onClick={onSkip}>
              Carry on: the police can reach me in the app
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className="bk-back bk-back--center" onClick={() => setEditing(true)}>
          Wrong number? Change it
        </button>
      )}
    </section>
  );
}

/** Putting the number right without leaving the call: same rules as the booking sheet (07…, no +44). */
function NumberFix({ digits, onSave, onCancel }: { digits: string; onSave(digits: string): Promise<void>; onCancel(): void }) {
  const id = useId();
  const [typed, setTyped] = useState(showUkNumber(digits));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanUkNumber(typed);
  const ok = isUkMobile(clean);
  return (
    <form
      className="bk-call__fix"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!ok || busy) return;
        setBusy(true);
        setError(null);
        onSave(clean).catch((err: unknown) => {
          setError(friendlyError(err));
          setBusy(false);
        });
      }}
    >
      <label className="bk-call__fixlabel" htmlFor={id}>
        Your mobile
        {tried && !ok ? <Stamp tone="red" className="bk-stamp--tiny">Check it</Stamp> : null}
      </label>
      <input
        id={id}
        className="bk-call__input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="07700 900417"
        value={typed}
        aria-invalid={tried && !ok ? true : undefined}
        onChange={(e) => setTyped(e.target.value)}
      />
      <span className="bk-call__fixhint">
        {typedCountryCode(typed) && clean ? `No need for +44: we’ll ring ${showUkNumber(clean)}.` : 'Starting 07, as you’d dial it in the UK. No +44.'}
      </span>
      {error ? (
        <p className="bk-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="bk-go" disabled={busy} aria-busy={busy || undefined}>
        {busy ? <Loader size={24} label="Saving your number" /> : null}
        {busy ? 'Saving…' : 'Ring this number'}
      </button>
      <button type="button" className="bk-back bk-back--center" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- the case opens */

/**
 * Through: their file on top, a welcome, and the way into the game, which books them in (`onOpen` calls bookIn; the
 * game takes over once it's saved). Or sign out.
 */
export function CaseOpen({
  name,
  tel,
  photo,
  onOpen,
  onSignOut,
}: {
  name: string;
  /** Their mobile as shown, or null when they gave none. */
  tel: string | null;
  photo: string | null;
  onOpen(): Promise<void>;
  onSignOut(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = name.trim().split(/\s+/)[0] || 'suspect';
  return (
    <section className="bk-open">
      <div className="bk-open__card">
        {photo ? <img className="bk-open__photo" src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="bk-open__photo" aria-hidden="true" />}
        <div className="bk-open__who">
          <span className="bk-label">Suspect</span>
          <strong>{name}</strong>
          {tel ? <span className="bk-open__tel">{tel}</span> : null}
        </div>
        <Stamp tone="red" className="bk-open__stamp">Booked</Stamp>
      </div>
      <h1 className="bk-open__title">Welcome to the investigation, {first}.</h1>
      {error ? (
        <p className="bk-error bk-error--dark" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="bk-go bk-open__go"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => {
          setBusy(true);
          setError(null);
          onOpen().catch((err: unknown) => {
            setError(friendlyError(err));
            setBusy(false);
          });
        }}
      >
        {busy ? <Loader size={24} label="Opening the case" /> : null}
        {busy ? 'Opening the case…' : 'Open the case'} <span aria-hidden="true">→</span>
      </button>
      <button type="button" className="bk-back bk-back--center" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  );
}
