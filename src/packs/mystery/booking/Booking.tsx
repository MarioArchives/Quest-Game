// The booking desk (the mystery pack's onboarding, from the UI mocks' booking desk): what a player goes through once the
// GM has let them in, before the game. The records check clears them, then the interview room (a lamp swung into their
// face: "Who are you?"), their particulars on a manila booking sheet (their display name; their mobile for the police
// line when phone calls are on; height, relation to the victim and distinguishing marks), a typed letter from the police, their right
// thumb on a livescan machine (press and hold; nothing is read, the print is made up from the player), the file with
// the inked print and the photographer's room for the mugshot (their real profile photo), and, with phone calls on, the
// police's calling card to save and a test call to their mobile; or, with the police on Telegram (settings.policeTelegram),
// their Telegram card instead (TelegramCard: get Telegram if they haven't, then say hello to the police there, and expect
// a Telegram call tonight). The case opens with `bookIn`, which files the particulars and lets them into the game. A
// reload carries on from the desk they were at (kept on this tab only). A GM who joined as a player comes here only from
// their file, and may go back to the game (`onCancel`) without booking in.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { bookIn, friendlyError, setPoliceLine } from '../../../api';
import { backend } from '../../../backend';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useDocument } from '../../../data/hooks';
import { isTelegramPolice, telegramUsername } from '../../../lib/telegram';
import { compressAvatar, uploadAvatar } from '../../../lib/upload';
import { features, pack } from '../../../pack';
import { useSession } from '../../../session/SessionProvider';
import { DISPLAY_NAME_MAX, MARKS_MAX, normalisePhone, type PlayerPhone } from '../../../shared';
import type { OnboardingProps } from '../../types';
import { caseNumber } from '../dossier';
import { CallingCard } from './CallingCard';
import { CaseOpen, Terminal, TestCall } from './Checks';
import { buzz, lessMotion } from './feel';
import { hashText, makePrint, type Print } from './fingerprint';
import { InterviewRoom } from './InterviewRoom';
import { Board, Field, FORCE, Paperclip, SignedInAs, Stamp } from './parts';
import { PhotoRoom } from './PhotoRoom';
import { PrintArt } from './Print';
import { HoneycombStamp, PoliceBadge } from './stamps';
import { TelegramCard } from './TelegramCard';
import {
  cleanUkNumber,
  feetInches,
  forgetSaved,
  isUkMobile,
  keepSaved,
  loadSaved,
  particularsOf,
  sheetNumber,
  showUkNumber,
  typedCountryCode,
  type Draft,
} from './suspect';
import './booking.css';

type Step = 'cleared' | 'room' | 'particulars' | 'letter' | 'prints' | 'booked' | 'photo' | 'number' | 'call' | 'open';

const RELATIONS = pack.booking?.relations ?? [];
/** The step tabs; the letter counts as the start of the prints, the file and the photographer's room as the mugshot, and
 * the police's card as the start of the test call. */
const STEPS: { id: Step; label: string }[] = [
  { id: 'particulars', label: 'Particulars' },
  { id: 'prints', label: 'Prints' },
  { id: 'booked', label: 'Mugshot' },
  { id: 'call', label: 'Test call' },
];
/** Which tab a step lights. */
const TAB_OF: Partial<Record<Step, Step>> = { letter: 'prints', photo: 'booked', number: 'call' };
/** Where a reload carries on from: any desk, never the middle of a scene (the photographer's leads back to the file). */
const RESUME: Partial<Record<string, Step>> = {
  particulars: 'particulars',
  letter: 'letter',
  prints: 'prints',
  booked: 'booked',
  photo: 'booked',
  number: 'number',
  call: 'call',
  open: 'open',
};

export default function Booking({ onCancel }: OnboardingProps) {
  const { user, player, signOut } = useSession();
  const { settings, state } = useGame();
  const uid = user?.uid ?? '';
  // The police on Telegram (by username, or by number for an account without one) ask for the mobile too: it's how
  // their account finds the player.
  const telegramName = features.police ? telegramUsername(settings.policeTelegram ?? '') : null;
  const telegramNumber = features.police ? normalisePhone(settings.policeTelegramNumber ?? '', pack.locale) : null;
  const telegram = Boolean(features.police) && isTelegramPolice(settings);
  const phoneOn = Boolean(features.police && (settings.policePhone || telegram));
  const line = useDocument<PlayerPhone>(phoneOn && uid ? `phones/${uid}` : null);
  const since = tsMs(player?.joinedAt);
  const [saved] = useState(() => (uid ? loadSaved(uid, since) : null));
  const [step, setStep] = useState<Step>(() => RESUME[saved?.step ?? ''] ?? 'cleared');
  const [who, setWho] = useState<Draft>(
    () =>
      saved?.draft ?? {
        name: (player?.displayName ?? '').slice(0, DISPLAY_NAME_MAX),
        phone: '',
        noPhone: false,
        heightCm: player?.particulars?.heightCm ?? 175,
        relation: player?.particulars?.relation ?? null,
        marks: player?.particulars?.marks ?? '',
      },
  );
  const [photoDone, setPhotoDone] = useState(saved?.photoDone ?? false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const print = useMemo(() => makePrint(uid), [uid]);

  // Names are locked once the game has started (the rules refuse the change), so then it's the one they have.
  const nameEditable = state.status === 'lobby';
  const name = nameEditable ? who.name : (player?.displayName ?? who.name);
  const usePhone = phoneOn && !who.noPhone;
  const tel = usePhone && line.data ? showUkNumber(cleanUkNumber(line.data.number)) : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    if (uid) keepSaved(uid, { draft: who, step, photoDone, since });
  }, [uid, who, step, photoDone, since]);

  // A UK number already on their police line fills in the mobile.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !line.data) return;
    prefilled.current = true;
    const number = line.data.number;
    if (number.startsWith('+44')) setWho((w) => (w.phone ? w : { ...w, phone: showUkNumber(cleanUkNumber(number)) }));
  }, [line.data]);

  // Cleared at the records check: a moment on the green screen, then into the interview room.
  useEffect(() => {
    if (step !== 'cleared') return;
    buzz([20, 60, 20]);
    const timer = window.setTimeout(() => setStep('room'), 1900);
    return () => window.clearTimeout(timer);
  }, [step]);

  // The calling card and the test call need the line; without one (or with phone calls off) the case opens. The
  // Telegram card doesn't: it only needs a mobile on the sheet, and the test call (which does) comes after it.
  const phoneStep = step === 'number' || step === 'call';
  const noLine = !usePhone || (!line.loading && !line.data && (!telegram || step === 'call'));
  useEffect(() => {
    if (phoneStep && noLine) setStep('open');
  }, [phoneStep, noLine]);

  if (!player || !uid) return null;

  /** Their name, and their mobile as the police line: saved now, so the test call has a number to ring. */
  const saveParticulars = async () => {
    const trimmed = who.name.trim();
    if (nameEditable && trimmed !== player.displayName) await backend().data.update(`players/${uid}`, { displayName: trimmed });
    if (usePhone) {
      const digits = cleanUkNumber(who.phone);
      // Saving it again also picks up the police's number, for a line kept from before the server had one.
      if (line.data?.number !== normalisePhone(digits, pack.locale) || !line.data.callerId) await setPoliceLine({ number: digits });
    }
    setStep('letter');
  };

  /** The mugshot as their profile photo, the way the account screen sets it. */
  const savePhoto = async (photo: Blob) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const avatar = await compressAvatar(photo);
      const url = await uploadAvatar(uid, avatar);
      await backend().data.update(`players/${uid}`, { photoURL: url });
      setPhotoDone(true);
      setStep('booked');
    } catch (err) {
      setPhotoError(err instanceof Error && /photo/i.test(err.message) ? err.message : friendlyError(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const open = async () => {
    await bookIn({ particulars: particularsOf(who) });
    forgetSaved(uid);
  };

  if (step === 'cleared') {
    return (
      <div className="bk">
        <div className="bk__beam" aria-hidden="true" />
        <Board title="Records check" />
        <section className="bk-check">
          <Terminal name={player.displayName} verdict="cleared" typed={false} />
          <p className="bk-lead" role="status">
            You’re a person of interest. Step this way.
          </p>
        </section>
      </div>
    );
  }

  if (step === 'room') {
    return (
      <div className="bk bk--scene">
        <InterviewRoom onDone={() => setStep('particulars')} />
      </div>
    );
  }

  if (step === 'photo') {
    return (
      <div className="bk bk--scene">
        <PhotoRoom
          current={player.photoURL ?? null}
          busy={photoBusy}
          error={photoError}
          onPhoto={(photo) => void savePhoto(photo)}
          onKeep={() => {
            setPhotoDone(true);
            setStep('booked');
          }}
        />
      </div>
    );
  }

  if (step === 'number' && telegram && usePhone) {
    return (
      <TelegramCard
        name={settings.policeCallerName.trim() || 'Police'}
        username={telegramName}
        number={telegramNumber}
        mobile={who.phone.trim() ? showUkNumber(cleanUkNumber(who.phone)) : null}
        onDone={() => setStep('call')}
      />
    );
  }

  // Without a caller ID yet (no phone line on this server), the card says the number comes with the first call.
  if (step === 'number' && !telegram && line.data) {
    return <CallingCard name={settings.policeCallerName.trim() || 'Police'} number={line.data.callerId} onDone={() => setStep('call')} />;
  }

  if (step === 'open' || (phoneStep && noLine)) {
    return (
      <div className="bk">
        <div className="bk__beam" aria-hidden="true" />
        <Board title="Case open" />
        <CaseOpen name={name} tel={tel} photo={player.photoURL ?? null} onOpen={open} onSignOut={() => void signOut()} />
      </div>
    );
  }

  return (
    <div className="bk">
      <div className="bk__beam" aria-hidden="true" />
      <Board title="Booking desk" />
      <SignedInAs onBack={onCancel} />
      <Steps step={step} />
      <div key={step} className="bk-step">
        {step === 'particulars' ? (
          <ParticularsSheet
            uid={uid}
            who={who}
            onChange={setWho}
            nameEditable={nameEditable}
            lockedName={player.displayName}
            phoneOn={phoneOn}
            telegram={telegram}
            onDone={saveParticulars}
          />
        ) : step === 'letter' ? (
          <Letter uid={uid} name={name} tel={usePhone ? showUkNumber(cleanUkNumber(who.phone)) : null} onDone={() => setStep('prints')} onBack={() => setStep('particulars')} />
        ) : step === 'prints' ? (
          <Livescan print={print} onDone={() => setStep('booked')} onBack={() => setStep('particulars')} />
        ) : step === 'call' || step === 'number' ? (
          <TestCall
            via={telegram ? 'telegram' : 'phone'}
            line={line.data}
            onDone={() => setStep('open')}
            onSkip={() => setStep('open')}
            onNumber={async (digits) => {
              await setPoliceLine({ number: digits });
              setWho((w) => ({ ...w, phone: showUkNumber(digits) }));
            }}
          />
        ) : (
          <BookedFile
            uid={uid}
            who={who}
            name={name}
            tel={tel}
            print={print}
            photo={player.photoURL ?? null}
            photoDone={photoDone}
            phoneNext={usePhone}
            onPhoto={() => setStep('photo')}
            onNext={() => setStep(usePhone ? 'number' : 'open')}
          />
        )}
      </div>
    </div>
  );
}

/** The steps as file tabs: done ones ticked, this one lifted out in manila. */
function Steps({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.id === (TAB_OF[step] ?? step));
  return (
    <ol className="bk-steps" aria-label="Booking steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className={`bk-steps__tab${i === at ? ' is-now' : i < at ? ' is-done' : ''}`} aria-current={i === at ? 'step' : undefined}>
          <span className="bk-steps__n">{i < at ? '✓' : i + 1}</span> {s.label}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- 1 · particulars */

function ParticularsSheet({
  uid,
  who,
  onChange,
  nameEditable,
  lockedName,
  phoneOn,
  telegram,
  onDone,
}: {
  uid: string;
  who: Draft;
  onChange(next: Draft): void;
  nameEditable: boolean;
  lockedName: string;
  phoneOn: boolean;
  /** The police ring on Telegram (the mobile is how they find the player there). */
  telegram: boolean;
  /** Saves the name and the police line, then moves on; rejects with what went wrong. */
  onDone(): Promise<void>;
}) {
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const relationRef = useRef<HTMLFieldSetElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...who, [key]: value });
  const missingName = nameEditable && !who.name.trim();
  // The police ask about it later, so there's no booking in without one.
  const missingRelation = RELATIONS.length > 0 && !who.relation;
  const digits = cleanUkNumber(who.phone);
  const askPhone = phoneOn && !who.noPhone;
  const phoneOk = !askPhone || isUkMobile(digits);

  const submit = () => {
    setTried(true);
    if (busy) return;
    if (missingName) return nameRef.current?.focus();
    if (!phoneOk) return phoneRef.current?.focus();
    if (missingRelation) {
      relationRef.current?.scrollIntoView({ block: 'center', behavior: lessMotion() ? 'auto' : 'smooth' });
      return relationRef.current?.querySelector('input')?.focus({ preventScroll: true });
    }
    // Tidy what they typed into the number we'll ring.
    if (askPhone) set('phone', showUkNumber(digits));
    buzz(12);
    setBusy(true);
    setError(null);
    onDone().catch((err: unknown) => {
      setError(friendlyError(err));
      setBusy(false);
    });
  };

  return (
    <form
      className="bk-folder"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="bk-folder__tab">
        Booking sheet · No. {sheetNumber(uid)}
        <Paperclip className="bk-clip--tab" />
      </span>
      <div className="bk-folder__body">
        <h1 className="bk-title">Your particulars</h1>
        <p className="bk-note">The desk sergeant needs a few details before your prints. Lies will be noted.</p>

        <Field
          label="Full name"
          hint={nameEditable ? 'From your Google account. Everyone in the game sees it.' : 'Names are locked once the game starts.'}
          missing={tried && missingName}
        >
          {(id, hintId) => (
            <input
              ref={nameRef}
              id={id}
              className="bk-input"
              value={nameEditable ? who.name : lockedName}
              readOnly={!nameEditable}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              aria-describedby={hintId}
              aria-invalid={tried && missingName ? true : undefined}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>

        {!phoneOn ? null : who.noPhone ? (
          <div className="bk-field">
            <span className="bk-label">Mobile number</span>
            <p className="bk-hint bk-hint--line">No mobile on file: the police will reach you in the app.</p>
            <button type="button" className="bk-link" onClick={() => set('noPhone', false)}>
              Give my mobile after all
            </button>
          </div>
        ) : (
          <>
            <Field
              label="Mobile number"
              hint={
                typedCountryCode(who.phone) && digits
                  ? `No need for +44: we’ll ring ${showUkNumber(digits)}.`
                  : telegram
                    ? 'As you’d dial it in the UK, starting 07. Leave off the +44. The one your Telegram uses: it’s how we find you.'
                    : 'As you’d dial it in the UK, starting 07. Leave off the +44. The police will ring it to check.'
              }
              missing={tried && !phoneOk}
              stamp={who.phone.trim() ? 'Check it' : 'Needed'}
            >
              {(id, hintId) => (
                <input
                  ref={phoneRef}
                  id={id}
                  className="bk-input"
                  type="tel"
                  inputMode="tel"
                  value={who.phone}
                  placeholder="07700 900417"
                  autoComplete="tel-national"
                  enterKeyHint="next"
                  maxLength={40}
                  aria-describedby={hintId}
                  aria-invalid={tried && !phoneOk ? true : undefined}
                  onChange={(e) => set('phone', e.target.value)}
                  onBlur={() => {
                    if (digits) set('phone', showUkNumber(digits));
                  }}
                />
              )}
            </Field>
            <button type="button" className="bk-link bk-link--under" onClick={() => onChange({ ...who, noPhone: true })}>
              No UK mobile? Take the police’s calls in the app
            </button>
          </>
        )}

        <Field label="Height" hint={`${who.heightCm} cm · ${feetInches(who.heightCm)}`}>
          {(id, hintId) => (
            <div className="bk-ruler">
              <input
                id={id}
                className="bk-range"
                type="range"
                min={140}
                max={210}
                step={1}
                value={who.heightCm}
                aria-describedby={hintId}
                aria-valuetext={`${who.heightCm} centimetres, ${feetInches(who.heightCm)}`}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (next % 5 === 0) buzz(4);
                  set('heightCm', next);
                }}
              />
              <div className="bk-ruler__ticks" aria-hidden="true">
                {[140, 150, 160, 170, 180, 190, 200, 210].map((cm) => (
                  <span key={cm}>{cm}</span>
                ))}
              </div>
            </div>
          )}
        </Field>

        <fieldset ref={relationRef} className={`bk-field${tried && missingRelation ? ' is-missing' : ''}`} aria-describedby={`relation-hint-${uid}`}>
          <legend className="bk-label">
            Relation to the victim
            {tried && missingRelation ? (
              <Stamp tone="red" className="bk-stamp--tiny">
                Needed
              </Stamp>
            ) : null}
          </legend>
          <div className="bk-chips">
            {RELATIONS.map((r) => (
              <label key={r.id} className={`bk-chip${who.relation === r.id ? ' is-on' : ''}`}>
                <input
                  className="bk-sr"
                  type="radio"
                  name={`relation-${uid}`}
                  value={r.id}
                  checked={who.relation === r.id}
                  required
                  onChange={() => {
                    buzz(6);
                    set('relation', r.id);
                  }}
                />
                {r.label}
              </label>
            ))}
          </div>
          <span id={`relation-hint-${uid}`} className="bk-hint">
            Pick one
          </span>
        </fieldset>

        <Field label="Distinguishing marks" hint="Optional">
          {(id, hintId) => (
            <textarea
              id={id}
              className="bk-input bk-input--area"
              rows={2}
              maxLength={MARKS_MAX}
              value={who.marks}
              placeholder="A dragon tattoo, a laugh you'd know anywhere…"
              aria-describedby={hintId}
              onChange={(e) => set('marks', e.target.value)}
            />
          )}
        </Field>

        {error ? (
          <p className="bk-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="bk-go" disabled={busy} aria-busy={busy || undefined}>
          {busy ? <Loader size={24} label="Filing your particulars" /> : null}
          {busy ? 'Filing it…' : 'Take my prints'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- 1½ · the letter */

const LETTER = [
  'Thank you for your cooperation.',
  'We will now proceed to take your fingerprints for the purposes of the investigation.',
  'When asked, place your right thumb on the glass and keep it there until the machine has finished.',
];
const TYPE_MS = 18;

/** A letter from the police, typed out as you watch (tap it to skip), then signed and sealed. */
function Letter({ uid, name, tel, onDone, onBack }: { uid: string; name: string; tel: string | null; onDone(): void; onBack(): void }) {
  const total = LETTER.reduce((n, line) => n + line.length, 0);
  const [typed, setTyped] = useState(() => (lessMotion() ? total : 0));
  const signed = typed >= total;

  useEffect(() => {
    if (signed) return;
    const id = window.setInterval(() => setTyped((n) => Math.min(total, n + 1)), TYPE_MS);
    return () => window.clearInterval(id);
  }, [signed, total]);

  // The seal lands just after the signature is drawn.
  useEffect(() => {
    if (!signed) return;
    const id = window.setTimeout(() => buzz(30), 1050);
    return () => window.clearTimeout(id);
  }, [signed]);

  const today = new Date().toLocaleDateString(pack.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: pack.timeZone });
  let left = typed;
  let caretPlaced = false;
  const lines = LETTER.map((line) => {
    const shown = Math.max(0, Math.min(line.length, left));
    left -= line.length;
    const caret = !caretPlaced && shown < line.length;
    if (caret) caretPlaced = true;
    return { line, shown, caret };
  });

  return (
    <>
      <div className="bk-folder">
        <span className="bk-folder__tab">From the desk sergeant</span>
        <div className="bk-folder__body">
          <article className={`bk-letter${signed ? ' is-signed' : ''}`} onClick={() => setTyped(total)}>
            <Paperclip className="bk-clip--letter" />
            <header className="bk-letter__head">
              <PoliceBadge className="bk-letter__crest" />
              <div className="bk-letter__org">
                <strong>{FORCE}</strong>
                <span>Criminal Investigation Dept.</span>
              </div>
            </header>
            <dl className="bk-letter__meta">
              <dt>Ref</dt>
              <dd>MMP/CID/{sheetNumber(uid)}</dd>
              <dt>Date</dt>
              <dd>{today}</dd>
              <dt>Re</dt>
              <dd>{tel ? `${name}, tel. ${tel}` : name}</dd>
            </dl>
            <div className="bk-letter__body">
              <p>Dear {name},</p>
              {lines.map(({ line, shown, caret }) => (
                <p key={line}>
                  <span className="bk-sr">{line}</span>
                  <span aria-hidden="true">
                    {line.slice(0, shown)}
                    {caret ? <span className="bk-caret" /> : null}
                    <span className="bk-rest">{line.slice(shown)}</span>
                  </span>
                </p>
              ))}
            </div>
            <footer className="bk-letter__sign">
              <span>Yours faithfully,</span>
              <svg className="bk-letter__sig" viewBox="0 0 130 44" aria-hidden="true">
                <path
                  pathLength={1}
                  d="M4 32C12 10 20 4 22 14S16 38 26 30 36 10 40 18 38 34 48 26 58 12 62 20 60 32 70 26 80 14 86 18 84 30 94 26 104 18 110 22M30 38C56 34 90 34 126 30"
                />
              </svg>
              <span className="bk-letter__who">
                Desk Sergeant
                <br />
                {FORCE}
              </span>
              <HoneycombStamp className="bk-seal" />
            </footer>
          </article>
          <button type="button" className="bk-go" onClick={onDone}>
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <button type="button" className="bk-back bk-back--center" onClick={onBack}>
        ← Back to particulars
      </button>
    </>
  );
}

/* ---------------------------------------------------------------- 2 · prints */

const HOLD_MS = 2800;
const SEARCH_LINES = ['Searching county records', 'Cross-checking Manchester records', 'Checking the bar tabs', 'Asking the barmaid'];

type ScanPhase = 'idle' | 'reading' | 'lifted' | 'searching' | 'done';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * The livescan: press and hold the glass (or hold Space or Enter on it) while the reading climbs; lift too soon and it
 * slips back. Can't hold? One tap on "Scan it for me" reads it without. Then a records search, and no prior record.
 */
function Livescan({ print, onDone, onBack }: { print: Print; onDone(): void; onBack(): void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [touch, setTouch] = useState({ x: 50, y: 50 });
  const [search, setSearch] = useState(0);
  const holding = useRef(false);
  /** The one-tap way: the reading climbs as if held. */
  const auto = useRef(false);
  const progressRef = useRef(0);
  const lastBuzz = useRef(0);

  // While a thumb is down the reading climbs; lifted, it slips back a little at a time.
  useEffect(() => {
    if (phase === 'searching' || phase === 'done') return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const down = holding.current || auto.current;
      const before = progressRef.current;
      const next = down ? Math.min(1, before + dt / HOLD_MS) : Math.max(0, before - dt / (HOLD_MS * 1.6));
      if (next !== before) {
        progressRef.current = next;
        setProgress(next);
      }
      if (holding.current && now - lastBuzz.current > 240) {
        lastBuzz.current = now;
        buzz(5);
      }
      if (next >= 1) {
        holding.current = false;
        auto.current = false;
        buzz([18, 50, 30]);
        setPhase('searching');
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // The records search: a few lines, then no prior record.
  useEffect(() => {
    if (phase !== 'searching') return;
    if (search >= SEARCH_LINES.length) {
      setPhase('done');
      buzz(30);
      return;
    }
    const id = window.setTimeout(() => setSearch((n) => n + 1), 650);
    return () => window.clearTimeout(id);
  }, [phase, search]);

  const press = (x: number, y: number) => {
    if (phase === 'searching' || phase === 'done') return;
    holding.current = true;
    setTouch({ x, y });
    setPhase('reading');
  };
  const lift = () => {
    if (!holding.current) return;
    holding.current = false;
    if (progressRef.current < 1 && !auto.current) setPhase('lifted');
  };
  const scanForMe = () => {
    if (phase === 'searching' || phase === 'done') return;
    auto.current = true;
    setTouch({ x: 50, y: 50 });
    setPhase('reading');
  };

  const pct = Math.round(progress * 100);
  const reading = phase === 'reading';
  const status =
    phase === 'idle'
      ? 'Ready. Right thumb on the glass.'
      : phase === 'reading'
        ? pct < 35
          ? 'Reading… hold still.'
          : pct < 75
            ? 'Reading ridges… keep it there.'
            : 'Nearly… don’t move.'
        : phase === 'lifted'
          ? 'Lifted too soon. Press and hold.'
          : phase === 'searching'
            ? `${SEARCH_LINES[Math.min(search, SEARCH_LINES.length - 1)]}…`
            : 'No prior record. Yet.';

  return (
    <section className="bk-scan" aria-labelledby="bk-scan-title">
      <div className="bk-scan__plate">
        <span id="bk-scan-title">Livescan · MMP-2</span>
        <span className={`bk-scan__led${reading ? ' is-on' : phase === 'done' ? ' is-done' : ''}`} aria-hidden="true" />
      </div>

      <div className={`bk-screen${phase === 'searching' ? ' is-searching' : ''}${phase === 'done' ? ' is-done' : ''}`}>
        <div className="bk-screen__grid" aria-hidden="true" />
        <span className="bk-screen__corner bk-screen__corner--tl" aria-hidden="true" />
        <span className="bk-screen__corner bk-screen__corner--tr" aria-hidden="true" />
        <span className="bk-screen__corner bk-screen__corner--bl" aria-hidden="true" />
        <span className="bk-screen__corner bk-screen__corner--br" aria-hidden="true" />
        <div className="bk-screen__hud" aria-hidden="true">
          <span>R. thumb</span>
          <span>{phase === 'done' ? 'On file' : `${pct}%`}</span>
        </div>
        <PrintArt print={print} tone="glow" reveal={progress} className="bk-screen__print" />
        {phase === 'searching' ? <Records seed={search} /> : null}
        {phase === 'done' ? (
          <Stamp tone="teal" className="bk-screen__stamp">
            Print on file
          </Stamp>
        ) : null}
      </div>

      <dl className="bk-readout" aria-hidden="true">
        <div>
          <dt>Ridges</dt>
          <dd>{Math.round(progress * print.ridgeCount)}</dd>
        </div>
        <div>
          <dt>Minutiae</dt>
          <dd>{Math.round(progress * print.minutiae)}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>{progress >= 1 ? print.quality : Math.round(progress * 88)}%</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{progress > 0.6 ? print.pattern : '—'}</dd>
        </div>
      </dl>

      <p className={`bk-status${phase === 'lifted' ? ' is-warn' : ''}${phase === 'done' ? ' is-good' : ''}`} role="status" aria-live="polite">
        {status}
      </p>

      {phase === 'done' ? (
        <button type="button" className="bk-go bk-go--dark" onClick={onDone}>
          File my prints <span aria-hidden="true">→</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            className={`bk-pad${reading ? ' is-pressed' : ''}${phase === 'lifted' ? ' is-lifted' : ''}`}
            aria-label="Fingerprint glass: press and hold, or hold Space"
            disabled={phase === 'searching'}
            style={{ '--x': `${touch.x}%`, '--y': `${touch.y}%`, '--p': progress } as CSSProperties}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* a synthetic pointer: no capture, pointerup still lifts */
              }
              const box = e.currentTarget.getBoundingClientRect();
              press(((e.clientX - box.left) / box.width) * 100, ((e.clientY - box.top) / box.height) * 100);
            }}
            onPointerUp={lift}
            onPointerCancel={lift}
            onLostPointerCapture={lift}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                press(50, 50);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') lift();
            }}
            onBlur={lift}
          >
            <span className="bk-pad__ring" aria-hidden="true" />
            <span className="bk-pad__ripple" aria-hidden="true" />
            <svg className="bk-pad__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.5 10.5C6.6 6.6 9 5 12 5s5.4 1.6 6.5 5.5" />
              <path d="M4.8 15c0-1.4.1-2.6.4-3.7M19.2 12.5c.1 2.6-.3 5-1.1 7.2" />
              <path d="M7.4 18.5c-.4-1.5-.5-3-.4-4.5.2-4 2.3-6.6 5-6.6s4.8 2.6 4.9 6.6c0 1.6-.1 3.1-.5 4.6" />
              <path d="M9.9 20.6c-.6-1.7-.9-3.6-.8-5.6.1-3 1.3-4.6 2.9-4.6s2.9 1.6 3 4.6c.1 2-.3 4-1 5.8" />
              <path d="M12 13.8c.5 2.4.4 5-.4 7.6" />
            </svg>
            <span className="bk-pad__label">{phase === 'searching' ? 'Got it' : reading ? 'Hold…' : 'Press & hold'}</span>
          </button>
          {phase === 'searching' ? null : (
            <button type="button" className="bk-back" onClick={scanForMe}>
              Can’t hold it? Scan it for me
            </button>
          )}
        </>
      )}

      {phase === 'done' ? null : (
        <button type="button" className="bk-back" onClick={onBack}>
          ← Back to particulars
        </button>
      )}
    </section>
  );
}

/** Record numbers flickering past while the "search" runs. */
function Records({ seed }: { seed: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 90);
    return () => window.clearInterval(id);
  }, []);
  const lines = Array.from({ length: 6 }, (_, i) => {
    const h = hashText(`${seed}:${tick}:${i}`);
    return `MMP-${pad(h % 10_000, 4)}  ${pad((h >>> 8) % 100, 2)}/${pad((h >>> 16) % 100, 2)}  ${h % 3 === 0 ? 'NO MATCH' : '····'}`;
  });
  return (
    <div className="bk-records" aria-hidden="true">
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- 3 · booked */

/**
 * The file, twice. First with the print in and an empty slot for the photo, and a Next to the photographer; back from
 * there, the photo pasted in and the file stamped BOOKED, and a Next to the police's number (or the case).
 */
function BookedFile({
  uid,
  who,
  name,
  tel,
  print,
  photo,
  photoDone,
  phoneNext,
  onPhoto,
  onNext,
}: {
  uid: string;
  who: Draft;
  name: string;
  tel: string | null;
  print: Print;
  photo: string | null;
  /** Back from the photographer's (with a new photo, the one they had, or none). */
  photoDone: boolean;
  /** The police's number and the test call come next. */
  phoneNext: boolean;
  onPhoto(): void;
  onNext(): void;
}) {
  useEffect(() => {
    if (!photoDone) return;
    const id = window.setTimeout(() => buzz(35), 1150);
    return () => window.clearTimeout(id);
  }, [photoDone]);
  const number = caseNumber(uid);
  return (
    <>
      <article className={`bk-folder bk-file${photoDone ? ' has-photo' : ''}`}>
        <span className="bk-folder__tab">
          Case {number}
          <Paperclip className="bk-clip--tab" />
        </span>
        <div className="bk-folder__body">
          <div className="bk-file__top">
            {photoDone ? (
              <Mugshot label={name} number={number} photo={photo} />
            ) : (
              <button type="button" className="bk-mug-slot" onClick={onPhoto}>
                [paste photo here]
              </button>
            )}
            <dl className="bk-facts">
              <Fact label="Name">{name}</Fact>
              {tel ? <Fact label="Mobile">{tel}</Fact> : null}
              <Fact label="Height">
                {who.heightCm} cm · {feetInches(who.heightCm)}
              </Fact>
              <Fact label="Relation">{RELATIONS.find((r) => r.id === who.relation)?.label ?? 'Won’t say'}</Fact>
            </dl>
          </div>
          {who.marks.trim() ? (
            <p className="bk-marks">
              <span className="bk-label">Distinguishing marks</span>
              {who.marks.trim()}
            </p>
          ) : null}
          <div className="bk-prints">
            <span className="bk-label">Prints · right hand</span>
            <ol className="bk-prints__row">
              <li className="bk-prints__box is-taken">
                <PrintArt print={print} tone="ink" className="bk-prints__ink" />
                <span>Thumb</span>
              </li>
              {['Index', 'Middle', 'Ring', 'Little'].map((finger) => (
                <li key={finger} className="bk-prints__box">
                  <span className="bk-prints__none" aria-hidden="true" />
                  <span>{finger}</span>
                </li>
              ))}
            </ol>
          </div>
          {photoDone ? (
            <Stamp tone="red" className="bk-file__booked">
              Booked
            </Stamp>
          ) : null}
        </div>
      </article>
      <p className="bk-lead">
        {!photoDone
          ? 'One more thing for your file: your photograph.'
          : phoneNext
            ? 'Booked. One last thing before we let you go: our number.'
            : 'Booked. That’s all we need for now.'}
      </p>
      <div className="bk-next">
        <button type="button" className="bk-go" onClick={photoDone ? onNext : onPhoto}>
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bk-fact">
      <dt className="bk-label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Their photo against a height chart (in old black and white), holding a placard with their name and case number. */
function Mugshot({ label, number, photo }: { label: string; number: string; photo: string | null }) {
  return (
    <div className="bk-mug" aria-label="Your mugshot" role="img">
      {photo ? <img className="bk-mug__photo" src={photo} alt="" referrerPolicy="no-referrer" /> : <Silhouette />}
      <div className="bk-mug__chart" aria-hidden="true">
        {[200, 190, 180, 170, 160, 150].map((cm) => (
          <span key={cm} style={{ top: `${((210 - cm) / 70) * 100}%` }}>
            {cm}
          </span>
        ))}
      </div>
      <div className="bk-mug__placard" aria-hidden="true">
        <span>{label || 'Unknown'}</span>
        <span>{number}</span>
      </div>
    </div>
  );
}

/** No photo: a plain head and shoulders where it would go. */
function Silhouette() {
  return (
    <svg className="bk-mug__photo bk-mug__photo--none" viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="160" height="200" fill="#c9c5ba" />
      <circle cx="80" cy="78" r="34" fill="#55595c" />
      <path d="M14 200C14 140 44 118 80 118S146 140 146 200Z" fill="#55595c" />
    </svg>
  );
}
