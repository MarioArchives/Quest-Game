// The simulated line's phone (packs with police; the mock and the emulators, where no real phone may ring). When the
// police ring me on it, my test call or a check-in, a phone screen comes up in the app instead: pick up and it shows
// what the police say, with a keypad for the code or the answer; decline it, leave it ringing or hang up and the game
// hears that just as it would from Twilio (simulateCall). Calls on a real line never show here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { friendlyError, simulateCall } from '../api';
import { useGame } from '../data/GameProvider';
import { useDocument } from '../data/hooks';
import { pressKey, RING_MS, simulatedRing, type SimulatedRing } from '../lib/simulatedPhone';
import { features, pack, t } from '../pack';
import { useSession } from '../session/SessionProvider';
import { formatPhone, type PlayerPhone, type SimulatedAction, type SimulatedTurn } from '../shared';
import { Icon } from './Icon';
import { useModal } from './useModal';
import './SimulatedPhone.css';

/** How long the last words stay up after the police hang up. */
const ENDED_MS = 3500;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** Watches my line and my open check-in, and brings up the phone while one rings on the simulated line. */
export function SimulatedPhone() {
  const { user, isAdmin } = useSession();
  const { settings, myPoliceCall } = useGame();
  const uid = user?.uid ?? null;
  // A GM may test their own phone with phone calls off.
  const on = Boolean(features.police && uid && (settings.policePhone || isAdmin));
  const line = useDocument<PlayerPhone>(on ? `phones/${uid}` : null);
  const ringing = on ? simulatedRing(line.data, myPoliceCall) : null;
  const [shown, setShown] = useState<SimulatedRing | null>(null);
  const seen = useRef<string | null>(null);
  const gone = useCallback(() => setShown(null), []);

  // Each call comes up once: a declined or finished one stays down.
  useEffect(() => {
    if (!ringing || ringing.key === seen.current) return;
    seen.current = ringing.key;
    setShown(ringing);
  }, [ringing]);

  if (!shown) return null;
  return (
    <Handset
      key={shown.key}
      ring={shown}
      live={ringing?.key === shown.key}
      caller={settings.policeCallerName.trim() || 'Police'}
      number={line.data?.callerId ? formatPhone(line.data.callerId, pack.locale) : null}
      onGone={gone}
    />
  );
}

type Phase = 'ringing' | 'on' | 'ended';

function Handset({ ring, live, caller, number, onGone }: { ring: SimulatedRing; live: boolean; caller: string; number: string | null; onGone(): void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('ringing');
  const [said, setSaid] = useState<string[]>([]);
  const [keypad, setKeypad] = useState<SimulatedTurn['keypad']>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One move at a time, in order, as Twilio's requests come.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const rang = useRef(false);

  const send = (action: SimulatedAction, extra: { digits?: string; attempt?: number } = {}): Promise<SimulatedTurn> => {
    const next = queue.current.then(() => simulateCall({ ...ring.target, action, ...extra }));
    queue.current = next.catch(() => undefined);
    return next;
  };

  /** A move the player makes: the police's reply goes on screen; their hang-up ends the call. */
  const move = async (action: SimulatedAction, extra: { digits?: string; attempt?: number } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const turn = await send(action, extra);
      if (action === 'decline' || action === 'no-answer' || action === 'hang-up') return onGone();
      setPhase((p) => (p === 'ringing' ? 'on' : p));
      setSaid((s) => [...s, ...turn.said]);
      setKeypad(turn.keypad);
      if (turn.ended) {
        setPhase('ended');
        // Twilio reports the call completed once the police hang up.
        void send('hang-up').catch(() => undefined);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  useModal(panelRef, () => void move(phase === 'ringing' ? 'decline' : 'hang-up'), busy || phase === 'ended');

  // It rings: the game hears so at once, and after 25 s unanswered it has rung out.
  useEffect(() => {
    if (!rang.current) {
      rang.current = true;
      void send('ring').catch((err: unknown) => setError(friendlyError(err)));
    }
    if (phase !== 'ringing') return;
    const timer = window.setTimeout(() => void move('no-answer'), RING_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Settled elsewhere (the timer gave up, the check-in went to the app) while it rang: it stops ringing.
  useEffect(() => {
    if (!live && phase === 'ringing') onGone();
  }, [live, phase, onGone]);

  // The police hung up (or the line went dead): the last words stay up a moment.
  useEffect(() => {
    if (phase === 'on' && !live && !busy) setPhase('ended');
    if (phase !== 'ended') return;
    const timer = window.setTimeout(onGone, ENDED_MS);
    return () => window.clearTimeout(timer);
  }, [phase, live, busy, onGone]);

  const press = (key: string) => {
    if (!keypad || busy) return;
    const next = pressKey(typed, key, keypad.digits);
    setTyped(next.send ? '' : next.typed);
    if (next.send) void move('keys', { digits: next.typed, attempt: keypad.attempt });
  };

  const what = ring.kind === 'test' ? 'Test call' : t.policeCall.One;
  return createPortal(
    <div className="simphone-root">
      <div className={`simphone is-${phase}`} role="dialog" aria-modal="true" aria-label={`${what} from ${caller}`} ref={panelRef} tabIndex={-1}>
        <p className="simphone__note">Simulated line: no real phone rings here</p>
        <div className="simphone__who">
          <span className="simphone__badge" aria-hidden="true">
            <Icon name="phone" size={34} strokeWidth={2} />
          </span>
          <p className="simphone__what">{phase === 'ringing' ? `Incoming call · ${what}` : phase === 'on' ? 'On the call' : 'Call ended'}</p>
          <h2 className="simphone__caller">{caller}</h2>
          {number ? <p className="simphone__number">{number}</p> : null}
        </div>

        {said.length > 0 ? (
          <div className="simphone__said" aria-live="polite">
            {said.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : null}

        {phase === 'on' && keypad ? (
          <div className="simphone__pad">
            <output className="simphone__typed" aria-label="Keyed in">
              {typed || ' '}
            </output>
            <div className="simphone__keys">
              {KEYS.map((key) => (
                <button key={key} type="button" className="simphone__key" disabled={busy} onClick={() => press(key)}>
                  {key}
                </button>
              ))}
            </div>
            <p className="simphone__hint">{keypad.digits ? `Key in the ${keypad.digits} digits.` : 'Key in your answer, then #.'}</p>
          </div>
        ) : null}

        {error ? (
          <p className="simphone__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="simphone__actions">
          {phase === 'ringing' ? (
            <>
              <button type="button" className="simphone__btn simphone__btn--end" disabled={busy} onClick={() => void move('decline')}>
                Decline
              </button>
              <button type="button" className="simphone__btn simphone__btn--answer" disabled={busy} onClick={() => void move('answer')}>
                Answer
              </button>
            </>
          ) : phase === 'on' ? (
            <button type="button" className="simphone__btn simphone__btn--end" disabled={busy} onClick={() => void move('hang-up')}>
              Hang up
            </button>
          ) : (
            <button type="button" className="simphone__btn" onClick={onGone}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
