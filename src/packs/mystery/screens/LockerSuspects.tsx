// The locker's Suspects tab: every suspect with quick nudges (and the way into the full list: ledgers, rerolls,
// characters, leaving), the police check-ins with the switchboard, the guess log and the frames on file.
import { useMemo, useState } from 'react';
import { standingOf } from '../../../../functions/src/shared/standing.ts';
import { adjustPoints } from '../../../api';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useQuery } from '../../../data/hooks';
import { QUICK_POINTS, quickAdjustment } from '../../../lib/gmQuick';
import { switchboardLabel } from '../../../lib/policeLine';
import { features, pack, t } from '../../../pack';
import { clockTime, useRunner } from '../../../screens/gm/common';
import type { Guess, PoliceCall, Reward } from '../../../shared';
import { Folder, Stamp } from './CaseKit';
import { LinesButtons, useStreakLine, type Lines, type LockerNav } from './LockerParts';
import { lockerSummary } from './lockerLib';

export function Suspects({ lines, nav }: { lines: Lines; nav: LockerNav }) {
  return (
    <>
      <SuspectsCard nav={nav} />
      {features.police ? <PoliceFolder lines={lines} nav={nav} /> : null}
      {features.guesses ? <GuessFolder nav={nav} /> : null}
      <FramesCard />
    </>
  );
}

/* ---------- suspects, with the quick nudges ---------- */

/** The quick buttons' step: the pack's own (1 here), else 10. */
const QUICK = pack.gmQuickPoints ?? QUICK_POINTS;

function SuspectsCard({ nav }: { nav: LockerNav }) {
  const { players, settings } = useGame();
  const { busyKey, run } = useRunner();
  const list = players.filter((p) => p.left !== 'out');
  const nudge = (uid: string, sign: 1 | -1) => void run(`q:${uid}:${sign}`, () => adjustPoints({ uid, ...quickAdjustment(sign, '', QUICK) }));
  return (
    <Folder tab={`Suspects · ${list.length} playing`} label="Suspects" className="gl-folder gl-sus">
      {list.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">Nobody has joined yet.</p>
      ) : (
        <ul className="gl-sus__list">
          {list.map((p) => {
            const points = p.points ?? 0;
            const standing = p.left ? null : standingOf(points, settings);
            return (
              <li key={p.id} className="gl-sus__row">
                <Avatar name={p.displayName} src={p.photoURL} uid={p.id} size={32} className={`gl-sus__icon${points < 0 ? ' is-neg' : ''}`} />
                <div className="gl-sus__who">
                  <div className="gl-sus__name">
                    <span className="gl-sus__nm">{p.displayName}</span>
                    {standing ? (
                      <span className={`gl-mk gl-mk--${standing}`}>
                        <Icon name={standing === 'confidant' ? 'phone' : 'eye'} size={12} strokeWidth={2.6} />
                        <span className="visually-hidden">, {standing === 'confidant' ? t.confidant.one : t.poi.one}</span>
                      </span>
                    ) : null}
                    {p.left ? <span className="gl-sus__left"> · left</span> : null}
                  </div>
                  {p.character ? <div className="gl-sus__role">{p.character.name}</div> : null}
                </div>
                <span className={`gl-sus__pts${points < 0 ? ' is-neg' : ''}`}>{points < 0 ? `−${Math.abs(points)}` : points}</span>
                <Button
                  className="gl-btn gl-btn--sq"
                  aria-label={`Take ${QUICK} ${QUICK === 1 ? 'point' : 'points'} from ${p.displayName}`}
                  disabled={busyKey !== null}
                  onClick={() => nudge(p.id, -1)}
                >
                  −{QUICK}
                </Button>
                <Button
                  className="gl-btn gl-btn--sq"
                  aria-label={`Give ${p.displayName} ${QUICK} ${QUICK === 1 ? 'point' : 'points'}`}
                  disabled={busyKey !== null}
                  onClick={() => nudge(p.id, 1)}
                >
                  +{QUICK}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="gl-open" onClick={() => nav.open('players')}>
        All {list.length}: rerolls, characters, freeze ›
      </button>
    </Folder>
  );
}

/* ---------- police check-ins, with the switchboard ---------- */

/** Check-ins read for the open count (the log itself is in the full section). */
const CALLS_READ = 100;

function PoliceFolder({ lines, nav }: { lines: Lines; nav: LockerNav }) {
  const calls = useQuery<PoliceCall>({ path: 'policeCalls', orderBy: ['startsAt', 'desc'], limit: CALLS_READ });
  const streak = useStreakLine(lines.sb);
  const open = calls.data.filter((c) => c.status === 'open').length;
  const mode = lines.sb?.mode ?? 'phone';
  const since = tsMs(lines.sb?.since);
  return (
    <Folder tab={t.policeCall.Many} label={t.policeCall.Many} className="gl-folder gl-police">
      <div className="gl-folder__row">
        <h3 className="gl-fd__h">Switchboard</h3>
        <Stamp tone={!lines.on ? 'plain' : lines.alarm ? 'bad' : mode === 'phone' ? 'good' : 'warm'}>
          {lines.on ? switchboardLabel(lines.sb ?? { mode: 'phone', manual: false }) : 'Phones off'}
        </Stamp>
      </div>
      <p className="gl-hint">
        {!lines.on
          ? `Phone calls are off, so every ${t.policeCall.one} is answered in the app.`
          : mode === 'phone'
            ? `${t.policeCall.Many} ring the players with a tested number.`
            : mode === 'probation'
              ? 'The next one due goes by phone as a trial; the lines come back if it connects.'
              : lines.sb?.manual
                ? `You sent every ${t.policeCall.one} to the app.`
                : `${streak ?? 'Calls aren’t getting through.'} Everyone answers in the app.`}
        {lines.on && mode !== 'phone' && since ? ` Since ${clockTime(since)}.` : ''}
      </p>
      {lines.on && mode !== 'phone' ? <LinesButtons lines={lines} onAddNumber={() => nav.open('police')} /> : null}
      <button type="button" className="gl-open" onClick={() => nav.open('police')}>
        {calls.loading ? 'The log' : `The log: ${open} open`} · phone lines ›
      </button>
    </Folder>
  );
}

/* ---------- the guess log ---------- */

/** Guesses read for the count (as many as the full log shows). */
const GUESSES_READ = 200;

function GuessFolder({ nav }: { nav: LockerNav }) {
  const guesses = useQuery<Guess>({ path: 'guesses', orderBy: ['createdAt', 'desc'], limit: GUESSES_READ });
  const hits = guesses.data.filter((g) => g.correct).length;
  const n = guesses.data.length;
  return (
    <Folder tab="Guess log" label="Guess log" className="gl-folder">
      <p className="gl-hint">
        {guesses.error ? (
          'Couldn’t open the log.'
        ) : guesses.loading ? (
          <Loader inline size={20} label="Opening the guess log" caption="Opening…" />
        ) : n === 0 ? (
          'No guesses yet. Every guess, right or wrong, is filed here.'
        ) : (
          `${n >= GUESSES_READ ? `The latest ${n}` : n} ${n === 1 ? 'guess' : 'guesses'} · ${hits} right`
        )}
      </p>
      <button type="button" className="gl-open" onClick={() => nav.open('guesses')}>
        Open the guess log ›
      </button>
    </Folder>
  );
}

/* ---------- frames on file ---------- */

/** Rows shown before "All n". */
const FRAMES_SHOWN = 3;

function FramesCard() {
  const { playersById } = useGame();
  const rewards = useQuery<Reward>({ path: 'rewards' });
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => [...rewards.data].sort((a, b) => tsMs(b.resolvedAt ?? b.createdAt) - tsMs(a.resolvedAt ?? a.createdAt)),
    [rewards.data],
  );
  const name = (uid?: string | null) => (uid ? (playersById.get(uid)?.displayName ?? 'A player') : 'A player');
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  const shown = all ? rows : rows.slice(0, FRAMES_SHOWN);

  return (
    <Folder tab="Frames on file" label="Frames on file" className="gl-folder gl-frames">
      <div className="gl-folder__row">
        <span className="gl-frames__lead">Who framed whom, and who destroyed evidence</span>
        <Stamp tone="bad">GM eyes only</Stamp>
      </div>
      {rewards.error ? (
        <p className="gl-quiet gl-quiet--paper">Couldn&apos;t open the file.</p>
      ) : rewards.loading ? (
        <p className="gl-quiet gl-quiet--paper">
          <Loader inline size={20} label="Opening the frames on file" caption="Opening…" />
        </p>
      ) : rows.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">Nothing yet. Frames and destroyed evidence are filed here, for you only.</p>
      ) : (
        <>
          <p className="gl-frames__sum">{lockerSummary(rows)}</p>
          <ul className="gl-frames__rows">
            {shown.map((r) => {
              const when = tsMs(r.resolvedAt ?? r.createdAt);
              const applied = r.applied ?? 0;
              const used = r.status === 'framed' || r.status === 'cleaned';
              return (
                <li key={r.id}>
                  <span className="gl-frames__at">{when ? clockTime(when) : ''}</span>
                  <span>
                    {r.status === 'framed'
                      ? `${name(r.uid)} framed ${name(r.targetUid)}`
                      : r.status === 'cleaned'
                        ? `${name(r.uid)} destroyed evidence`
                        : r.status === 'pending'
                          ? `${name(r.uid)} has a reward unused`
                          : `${name(r.uid)} · reward voided`}
                  </span>
                  <b className={used ? (r.status === 'framed' ? 'is-neg' : 'is-pos') : ''}>
                    {used ? signed(r.status === 'framed' ? -Math.abs(applied) : applied) : '—'}
                  </b>
                </li>
              );
            })}
          </ul>
          {rows.length > FRAMES_SHOWN ? (
            <button type="button" className="gl-open" aria-expanded={all} onClick={() => setAll((a) => !a)}>
              {all ? 'Show fewer' : `All ${rows.length} ›`}
            </button>
          ) : null}
        </>
      )}
    </Folder>
  );
}
