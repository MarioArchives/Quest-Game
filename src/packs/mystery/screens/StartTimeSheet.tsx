// The GM's start-time sheet (Tonight's case strip): a day (today and the next three nights, or any date), a time with
// quarter-hour steps, and whether to tell the suspects when some have already booked in. Also the "Move the start?"
// sheet the quick nudges and Clear open once anyone has booked in.
import { useState } from 'react';
import { setStartTime } from '../../../api';
import { BottomSheet } from '../../../components/BottomSheet';
import { Button } from '../../../components/Button';
import { clockTime, dayChoices, dayDate, zonedMs } from '../../../lib/time';
import { pack, zone } from '../../../pack';
import { useRunner } from '../../../screens/gm/common';
import { startPost } from '../../../shared';
import { askBeforeMove, untilLabel, type Booking } from './lockerLib';

const QUARTER = 15;
const DAY_MIN = 24 * 60;
/** The time the sheet offers when nothing is set: a pub night starts at seven. */
const DEFAULT_TIME = '19:00';

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number) => {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** "GMT" or "BST": the zone's short name at that moment. */
const zoneName = (ms: number) => new Intl.DateTimeFormat(zone.locale, { timeZone: zone.timeZone, timeZoneName: 'short' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? '';

/** The pack's place name for the zone ("London"). */
export const zonePlace = zone.timeZone.split('/').pop()!.replace(/_/g, ' ');

/** The Tell suspects switch and what it sends. */
function TellRow({ tell, onChange, busy, preview }: { tell: boolean; onChange(next: boolean): void; busy: boolean; preview: string }) {
  return (
    <>
      <div className="gl-st__tell">
        <span>
          <b>Tell suspects</b>
          <i>A push and a log book note</i>
        </span>
        <button type="button" role="switch" className="switch" aria-label="Tell suspects" aria-checked={tell} disabled={busy} onClick={() => onChange(!tell)} />
      </div>
      {tell ? (
        <p className="gl-st__push">
          <b>{pack.name}</b>
          {preview}
        </p>
      ) : null}
    </>
  );
}

/** Sets or changes the start time: day chips, the time with −15 / +15, then the button. */
export function StartTimeSheet({ opensAtMs, players, onClose }: { opensAtMs: number | null; players: Booking[]; onClose(): void }) {
  const { busyKey, run } = useRunner();
  const now = Date.now();
  const days = dayChoices(now, zone, 3);
  const [day, setDay] = useState(() => (opensAtMs ? dayChoices(opensAtMs, zone, 0)[0]! : (days.find((d) => (zonedMs(d, DEFAULT_TIME, zone) ?? 0) > now) ?? days[0]!)));
  const [time, setTime] = useState(() => (opensAtMs ? clockTime(opensAtMs, zone) : DEFAULT_TIME));
  const [other, setOther] = useState(() => !days.includes(day));
  // Once anyone has booked in, setting or moving the time offers to tell them (the first time too: it starts their countdown).
  const ask = askBeforeMove(players);
  const [tell, setTell] = useState(true);
  const busy = busyKey !== null;

  const at = zonedMs(day, time, zone);
  const valid = at !== null && at > now;
  const label = at === null ? '' : `${dayDate(at, zone)}, ${time}`;

  const submit = async () => {
    if (at === null || !valid) return;
    const ok = await run('start', () => setStartTime({ at, tell: ask ? tell : false }), `Case opens itself at ${time}.`);
    if (ok) onClose();
  };

  return (
    <BottomSheet title="Start time" subtitle={`${zonePlace} time · the case opens itself at zero`} onClose={onClose} locked={busy}>
      <div className="gl-st">
        <p className="gl-st__h">Day</p>
        <div className="gl-st__days" role="group" aria-label="Day">
          {days.map((d) => {
            const ms = zonedMs(d, '12:00', zone)!;
            const [wd, ...rest] = dayDate(ms, zone).split(' ');
            return (
              <button key={d} type="button" className="gl-st__chip" aria-pressed={!other && day === d} disabled={busy} onClick={() => (setDay(d), setOther(false))}>
                <small>{wd}</small>
                {rest.join(' ')}
              </button>
            );
          })}
          <button type="button" className="gl-st__chip" aria-pressed={other} disabled={busy} onClick={() => setOther(true)}>
            <small>Other</small>…
          </button>
        </div>
        {other ? <input className="input gl-st__date" type="date" aria-label="Date" value={day} min={days[0]} disabled={busy} onChange={(e) => e.target.value && setDay(e.target.value)} /> : null}

        <p className="gl-st__h">Time</p>
        <div className="gl-st__time">
          <button type="button" className="gl-st__step" aria-label="15 minutes earlier" disabled={busy} onClick={() => setTime(toHhmm(toMin(time) - QUARTER))}>
            −{QUARTER}
          </button>
          <b className="gl-st__clock" aria-live="polite">
            {time}
          </b>
          <button type="button" className="gl-st__step" aria-label="15 minutes later" disabled={busy} onClick={() => setTime(toHhmm(toMin(time) + QUARTER))}>
            +{QUARTER}
          </button>
        </div>

        {at === null ? null : valid ? (
          <p className="gl-st__sum">
            Opens itself <b>{dayDate(at, zone)}</b> at <b>{time} {zoneName(at)}</b>, in {untilLabel(at - now)}. Suspects see the countdown from now on.
          </p>
        ) : (
          <p className="note note--error" role="alert">
            That time has passed.
          </p>
        )}
        {ask ? <TellRow tell={tell} onChange={setTell} busy={busy} preview={at ? startPost(at, opensAtMs, pack) : ''} /> : null}
      </div>
      <Button variant="primary" block busy={busyKey === 'start'} disabled={!valid || busy} onClick={() => void submit()}>
        Set for {label}
      </Button>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}

/** "Move the start?": the old time struck through and the new one (or none), and whether to tell the suspects. */
export function MoveStartSheet({ fromMs, toMs, onClose }: { fromMs: number; toMs: number | null; onClose(): void }) {
  const { busyKey, run } = useRunner();
  const [tell, setTell] = useState(true);
  const busy = busyKey !== null;
  const now = Date.now();
  const clearing = toMs === null;
  const newClock = toMs === null ? '' : clockTime(toMs, zone);
  const submit = async () => {
    const ok = await run('move', () => setStartTime({ at: toMs, tell }), clearing ? 'Start time cleared.' : `Start moved to ${newClock}.`);
    if (ok) onClose();
  };
  return (
    <BottomSheet
      title={clearing ? 'Clear the start time?' : 'Move the start?'}
      subtitle={`Suspects have seen ${clockTime(fromMs, zone)} on their countdown.`}
      onClose={onClose}
      locked={busy}
    >
      <div className="gl-st">
        <p className="gl-st__move" aria-label={clearing ? `From ${clockTime(fromMs, zone)} to no time` : `From ${clockTime(fromMs, zone)} to ${newClock}`}>
          <s>{clockTime(fromMs, zone)}</s>
          <span aria-hidden="true">→</span>
          <b>{clearing ? 'Opens when you say' : newClock}</b>
          {toMs !== null ? <em>in {untilLabel(toMs - now)}</em> : null}
        </p>
        <TellRow tell={tell} onChange={setTell} busy={busy} preview={startPost(toMs, fromMs, pack)} />
      </div>
      <Button variant="primary" block busy={busyKey === 'move'} disabled={busy} onClick={() => void submit()}>
        {clearing ? (tell ? 'Clear it and tell them' : 'Clear it') : tell ? `Move to ${newClock} and tell them` : `Move to ${newClock}`}
      </Button>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}
