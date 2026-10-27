// The Missions folder before the case opens, when the GM has set a start time (option B, "the sealed case file"): a
// case file tied with twine and sealed in red wax, "Not to be opened before 19:00", with the countdown under the seal and
// the meeting point once the GM reveals stop 01. A move of the time is written on the file (the old time struck through,
// the new one in red pen, an AMENDED stamp) and told once in a toast. At zero the seal breaks for a moment, then the
// stack is underneath. With no start time, `fallback` (today's empty folder) shows instead.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useQuery } from '../../../data/hooks';
import { useOpening, type Opening } from '../../../data/useOpening';
import { chipCountdown, countdownParts, spokenCountdown } from '../../../lib/countdown';
import { clockTime, dayDate } from '../../../lib/time';
import { orderStops } from '../../../modules/map/stops';
import { t, zone } from '../../../pack';
import type { Stop } from '../../../shared';
import { Bee, HoneycombStamp } from '../booking/stamps';
import { Paperclip } from './CaseKit';
import './sealed.css';

/** How long the broken seal stays up before the stack shows. */
const OPEN_SHOWN_MS = 2500;
const MOVED_KEY = 'mystery.sealedMoveSeen';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** "Sat 7 Nov 2026" in the pack's zone. */
const dayDateYear = (ms: number) => `${dayDate(ms, zone)} ${new Intl.DateTimeFormat(zone.locale, { year: 'numeric', timeZone: zone.timeZone }).format(ms)}`;

/** A time, with its day when that is not the day of `than`. */
const timeOnDay = (ms: number, than: number) => (dayDate(ms, zone) === dayDate(than, zone) ? clockTime(ms, zone) : `${dayDate(ms, zone)} ${clockTime(ms, zone)}`);

/** The wax seal: the bee in the middle. */
function Wax({ className }: { className?: string }) {
  return (
    <span className={`wax${className ? ` ${className}` : ''}`}>
      <svg viewBox="-30 -30 60 60" aria-hidden="true">
        <Bee x={0} y={0} size={0.9} />
      </svg>
    </span>
  );
}

/** The twine that ties the file: round it, then cut in two when it is open. */
function Twine({ cut }: { cut?: boolean }) {
  return (
    <>
      <span className={`sf__tw sf__tw--h${cut ? ' sf__tw--cut-l' : ''}`} />
      {cut ? <span className="sf__tw sf__tw--h sf__tw--cut-r" /> : null}
      <span className={`sf__tw sf__tw--v${cut ? ' sf__tw--cut-t' : ''}`} />
      {cut ? <span className="sf__tw sf__tw--v sf__tw--cut-b" /> : null}
    </>
  );
}

/** The label stuck on the front: whose file, what case, and when it may be opened (amended, if the GM moved it). */
function Label({ opening, moved }: { opening: Opening; moved: { from: number; at: number } | null }) {
  const { opensAtMs } = opening;
  return (
    <>
      <div className="sf__label">
        <HoneycombStamp className="sf__honey" />
        <p className="sf__force">Manchester Metropolitan Police · C.I.D.</p>
        <p className="sf__case">Case file · Op. Last Orders</p>
        <h3 className="sf__title">The death of Bob</h3>
        <p className="sf__warn">Not to be opened before</p>
        {moved ? (
          <>
            <p className="sf__when">
              <b className="was">{timeOnDay(moved.from, opensAtMs)}</b>
              <span className="sf__pen">{clockTime(opensAtMs, zone)}</span>
            </p>
            <p className="sf__date">
              {dayDateYear(opensAtMs)} · amended {clockTime(moved.at, zone)}
            </p>
          </>
        ) : (
          <p className="sf__when">
            <b>{clockTime(opensAtMs, zone)}</b>
            <span>{dayDateYear(opensAtMs)}</span>
          </p>
        )}
      </div>
      {moved ? (
        <span className="sf__amend">
          Amended
          <br />
          by the {t.gm.One}
          <br />
          {clockTime(moved.at, zone)}
        </span>
      ) : null}
    </>
  );
}

/** The first revealed stop, as the meeting point (or a line saying it is still sealed). */
function Meeting({ final }: { final: boolean }) {
  const stopDocs = useQuery<Stop>({ path: 'stops', where: [['revealed', '==', true]] });
  const first = orderStops(stopDocs.data)[0];
  if (!first) {
    return (
      <p className="sf__meet">
        <b>Meeting point:</b> sealed. The {t.gm.One} reveals stop 01 nearer the night.
      </p>
    );
  }
  const place = first.address ?? first.placeName;
  return (
    <div className={`mtag${final ? ' mtag--final' : ''}`}>
      <span className="mtag__eye" />
      <p className="mtag__k">Stop 01 · revealed by the {t.gm.One}</p>
      <p className="mtag__t">
        {first.name}
        {place ? <span> · {place}</span> : null}
      </p>
    </div>
  );
}

/** The countdown under the seal: days and hours while days away, then h:mm:ss, then big red minutes. */
function Count({ opening }: { opening: Opening }) {
  const { remainingMs, stage, opensAtMs } = opening;
  const { days, hours, minutes } = countdownParts(remainingMs);
  const clock = clockTime(opensAtMs, zone);
  return (
    <div className="sf__cd" role="timer" aria-label={`${stage === 'zero' ? 'Opening now' : `${spokenCountdown(remainingMs)} to go`}`}>
      {stage === 'days' ? (
        <>
          <p className="sf__count" aria-hidden="true">
            <span className="sf__big">{days}</span>
            <span className="sf__u">{days === 1 ? 'day' : 'days'}</span>
            <span className="sf__big">{hours}</span>
            <span className="sf__u">hrs</span>
          </p>
          <p className="sf__sub" aria-hidden="true">
            and {minutes} min to go
          </p>
        </>
      ) : stage === 'today' ? (
        <>
          <p className="sf__count" aria-hidden="true">
            <span className="sf__big">{chipCountdown(remainingMs)}</span>
          </p>
          <p className="sf__sub" aria-hidden="true">
            to go · tonight
          </p>
        </>
      ) : (
        <>
          <p className="sf__count" aria-hidden="true">
            <span className="sf__huge">{chipCountdown(remainingMs)}</span>
          </p>
          <p className="sf__sub" aria-hidden="true">
            {stage === 'zero' ? 'opening now' : `min to go · ${clock}`}
          </p>
        </>
      )}
    </div>
  );
}

/** What the player sees of the start time: a toast, once per move per device, when the GM has moved it. */
function useMovedToast(opening: Opening | null, moved: { from: number; at: number } | null) {
  const toast = useToast();
  const at = moved?.at ?? 0;
  const opensAtMs = opening?.opensAtMs ?? 0;
  const from = moved?.from ?? 0;
  useEffect(() => {
    if (!at || !opensAtMs) return;
    try {
      if (window.localStorage.getItem(MOVED_KEY) === String(at)) return;
      window.localStorage.setItem(MOVED_KEY, String(at));
    } catch {
      /* no storage: the toast shows each visit, which is harmless */
    }
    toast(`The ${t.gm.One} moved the start to ${timeOnDay(opensAtMs, from)}.`);
  }, [at, opensAtMs, from, toast]);
}

/** The folder with its tab, in the stack's frame (the tab joins the body). */
function Frame({ tab, open, children }: { tab: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <div className="ms1">
      <div className="ms1__tabs">
        <span className="ms1__tab">{tab}</span>
      </div>
      <div className={`sf${open ? ' sf--open' : ''}`}>
        <Paperclip />
        {children}
      </div>
    </div>
  );
}

/** The sealed case file while a start time is set; `fallback` otherwise (and after the case opens). */
export function SealedFile({ fallback }: { fallback: ReactNode }) {
  const { state } = useGame();
  const opening = useOpening();
  const last = useRef<{ opening: Opening; moved: { from: number; at: number } | null } | null>(null);
  const [opened, setOpened] = useState<{ opening: Opening; moved: { from: number; at: number } | null; at: number } | null>(null);

  const moved = state.opensMoved ? { from: tsMs(state.opensMoved.from), at: tsMs(state.opensMoved.at) } : null;
  if (opening) last.current = { opening, moved };
  else if (state.status === 'lobby') last.current = null; // the GM cleared the time: nothing will open by itself
  useMovedToast(opening, moved);

  // The state flips from lobby to active while the file is on screen: the seal breaks, then the stack shows.
  const flipped = !opening && last.current !== null && state.status === 'active';
  useEffect(() => {
    if (!flipped || !last.current) return;
    const seen = last.current;
    last.current = null;
    if (!reducedMotion()) setOpened({ ...seen, at: Date.now() });
  }, [flipped]);
  useEffect(() => {
    if (!opened) return;
    const id = window.setTimeout(() => setOpened(null), OPEN_SHOWN_MS);
    return () => window.clearTimeout(id);
  }, [opened]);

  if (opening) {
    const final = opening.stage === 'final' || opening.stage === 'zero';
    return (
      <Frame tab={<>Sealed · <b>{chipCountdown(opening.remainingMs)}</b></>}>
        <Label opening={opening} moved={moved} />
        <Twine />
        <Wax />
        <div className={`sf__low${final ? ' sf__low--final' : ''}`}>
          <Count opening={opening} />
          <Meeting final={final} />
        </div>
      </Frame>
    );
  }
  if (opened) {
    return (
      <Frame tab={`Opened · ${clockTime(opened.at, zone)}`} open>
        <Label opening={opened.opening} moved={opened.moved} />
        <Twine cut />
        <Wax className="wax--a" />
        <Wax className="wax--b" />
        <div className="sf__opened" role="status">
          <h3>The case is open</h3>
          <p>Missions open from now on, right here.</p>
        </div>
        <span className="sf__open">
          Opened {clockTime(opened.at, zone)}
        </span>
        <span className="sf__lift2" />
        <span className="sf__lift" />
      </Frame>
    );
  }
  return <>{fallback}</>;
}
