// The tip line on the points chip (packs with police): a phone beside your score in the app bar, so it shows on every
// screen. It glows while a trusted confidant can tip off the police (pulsing, with a one-off toast, when the line
// opens), sits dark with a ring draining round it during the cooldown, and stays unlit for everyone else. Tap it to
// tip (TipOffSheet asks who), or to see when it opens or what it takes.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { signed } from '../../lib/standingBars';
import { clockTime } from '../../lib/time';
import { tipLineState, waitMinutes } from '../../lib/tipLine';
import { features, t, zone } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { TipOffSheet } from './TipOff';
import './tipLine.css';

const MIN_MS = 60_000;
/** The ring's circumference (r = 12 in a 28 box). */
const RING = 2 * Math.PI * 12;
/** How long the line must stay open before it is announced, so a snapshot still arriving can't set it off. */
const SETTLE_MS = 1_000;

const storageKey = (uid: string) => `fq:tip-line:${uid}`;

/** The ready period last announced to this player on this device (see tipLineState's `period`). */
function announcedPeriod(uid: string): string | null {
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

function rememberAnnounced(uid: string, period: string): void {
  try {
    localStorage.setItem(storageKey(uid), period);
  } catch {
    /* private mode: it may be announced again after a reload */
  }
}

/** The phone beside the points chip; nothing for packs without police, GMs who don't play, or outside a running game. */
export function TipLine() {
  const { user } = useSession();
  const { me, settings, state } = useGame();
  const toast = useToast();
  const now = useNow(15_000);
  const { pathname } = useLocation();
  const [sheet, setSheet] = useState(false);
  // The popover is open for one screen and one state: moving on, or the line changing, closes it.
  const [popFor, setPopFor] = useState<string | null>(null);
  const [pulseFor, setPulseFor] = useState<string | null>(null);
  const popId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const line = tipLineState({
    police: Boolean(features.police),
    status: state.status,
    me: me ? { points: me.points ?? 0, left: Boolean(me.left), lastSnitchedMs: me.lastSnitchedAt ? tsMs(me.lastSnitchedAt) : null } : null,
    settings,
    nowMs: now,
  });
  const uid = user?.uid ?? null;
  const period = line.kind === 'ready' ? line.period : null;
  const popKey = `${pathname}|${line.kind}`;
  const popOpen = popFor === popKey;

  // The line opening is announced once per ready period, even across reloads: a toast, and the phone pulses for ~10 s.
  useEffect(() => {
    if (!uid || period == null || announcedPeriod(uid) === period) return;
    const id = window.setTimeout(() => {
      rememberAnnounced(uid, period);
      setPulseFor(period);
      toast('Your tip line is open. Tap the phone to tip off the police.');
    }, SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [uid, period, toast]);

  // A tap outside or Escape closes the popover.
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setPopFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPopFor(null);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popOpen]);

  // Point the popover's arrow at the phone.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!popOpen || !button || !pop) return;
    const b = button.getBoundingClientRect();
    pop.style.setProperty('--tipline-arrow', `${Math.round(pop.getBoundingClientRect().right - (b.left + b.width / 2))}px`);
  }, [popOpen]);

  const sheetEl = sheet ? <TipOffSheet onClose={() => setSheet(false)} /> : null;
  if (line.kind === 'hidden') return sheetEl;

  const label =
    line.kind === 'ready'
      ? 'Tip line open: tip off the police'
      : line.kind === 'cooldown'
        ? `Tip line closed: next tip in ${waitMinutes(line.waitMs)} min`
        : `Tip line: only a ${t.confidant.one} can tip off the police`;

  const onClick = () => {
    if (line.kind === 'ready') setSheet(true);
    else setPopFor(popOpen ? null : popKey);
  };

  const pulse = line.kind === 'ready' && pulseFor === line.period;
  // The minute it opens, rounded up: the line is open by then.
  const opensAt = line.kind === 'cooldown' ? clockTime(Math.ceil(line.opensAtMs / MIN_MS) * MIN_MS, zone) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`tipline tipline--${line.kind}${pulse ? ' tipline--pulse' : ''}`}
        aria-label={label}
        aria-haspopup={line.kind === 'ready' ? 'dialog' : undefined}
        aria-expanded={line.kind === 'ready' ? undefined : popOpen}
        aria-controls={line.kind === 'ready' ? undefined : popId}
        onClick={onClick}
      >
        {line.kind === 'cooldown' ? (
          <svg className="tipline__ring" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
            <circle className="tipline__track" cx="14" cy="14" r="12" />
            <circle
              className="tipline__left"
              cx="14"
              cy="14"
              r="12"
              strokeDasharray={`${(RING * line.remaining).toFixed(2)} ${RING.toFixed(2)}`}
              transform="rotate(-90 14 14)"
            />
          </svg>
        ) : null}
        <Icon name="phone" size={17} className="tipline__icon" />
      </button>
      {/* A toggletip: the live region is always there, so what it shows is read out when it opens. */}
      <div id={popId} role="status" className="tipline-live">
        {popOpen ? (
          <div ref={popRef} className="tipline-pop">
            {line.kind === 'cooldown' ? (
              <>
                <span className="tipline-pop__stamp tipline-pop__stamp--closed">Tip line closed</span>
                <p className="tipline-pop__text">
                  Next tip in <b>{waitMinutes(line.waitMs)} min</b>, at {opensAt}.
                </p>
                <p className="tipline-pop__fine">The phone lights up when the line opens.</p>
              </>
            ) : line.kind === 'locked' ? (
              <>
                <span className="tipline-pop__stamp">{t.confidant.Many} only</span>
                <p className="tipline-pop__text">
                  Reach <b>{signed(line.need)}</b> to become a {t.confidant.one} and tip off the police.
                </p>
                {line.need > line.points ? (
                  <p className="tipline-pop__fine">
                    You&apos;re on {signed(line.points)}: {line.need - line.points} to go.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {sheetEl}
    </>
  );
}
