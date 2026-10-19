// GM: the police switchboard (packs with police, phone calls on). Line health (the last look at the Twilio account),
// the last error, phone or app, a test call to the GM's own phone, Restore and Switch to the app, and every player's
// line. The server trips it by itself (calls that never connect, or an account error), checks the account every
// 15 min while it is down and restores it when a trial call connects; this panel is the GM's hand on it.
import { useMemo, useState, type FormEvent } from 'react';
import { setPoliceLine, setSwitchboard, testPoliceLine } from '../../api';
import { Button } from '../../components/Button';
import { useGame } from '../../data/GameProvider';
import { tsMs, useDocument, useQuery } from '../../data/hooks';
import { LINE_LABEL, switchboardLabel, testProgress } from '../../lib/policeLine';
import { pack, t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { formatPhone, type PlayerPhone, type Switchboard } from '../../shared';
import { clockTime, useRunner } from './common';

const LINES_UP: Switchboard = {
  mode: 'phone',
  manual: false,
  since: null,
  streak: 0,
  streakUids: [],
  trialCallId: null,
  lastError: null,
  health: null,
};

export function SwitchboardPanel() {
  const { settings, playersById } = useGame();
  const { user } = useSession();
  const { busyKey, run, anyBusy } = useRunner();
  const [number, setNumber] = useState('');
  const doc = useDocument<Switchboard>('game/switchboard');
  const lines = useQuery<PlayerPhone>({ path: 'phones' });
  const sb = doc.data ?? LINES_UP;
  const mine = lines.data.find((l) => l.id === user?.uid) ?? null;
  const players = useMemo(
    () =>
      lines.data
        .filter((l) => playersById.has(l.id))
        .sort((a, b) => (playersById.get(a.id)?.displayName ?? '').localeCompare(playersById.get(b.id)?.displayName ?? '')),
    [lines.data, playersById],
  );

  if (!settings.policePhone) {
    return (
      <section className="gm-card" aria-label="Switchboard">
        <h3 className="gm-h">Switchboard</h3>
        <p className="gm-hint">
          Phone calls are off, so every {t.policeCall.one} is answered in the app. Turn them on in Settings › {t.policeCall.Many} once Twilio is set up.
        </p>
      </section>
    );
  }

  const progress = testProgress(mine?.test);
  const saveMine = (event: FormEvent) => {
    event.preventDefault();
    void run('number', () => setPoliceLine({ number: number.trim() }).then(() => setNumber('')), 'Number saved.');
  };

  return (
    <section className="gm-card switchboard" aria-label="Switchboard">
      <div className="section-head">
        <h3 className="gm-h">Switchboard</h3>
        <span className={`tag${sb.mode === 'phone' ? ' tag--ink' : ' tag--accent'}`}>{switchboardLabel(sb)}</span>
      </div>
      <p className="gm-hint">
        {sb.mode === 'phone'
          ? `${t.policeCall.Many} ring players with a tested number. ${settings.policeBreakerAt} calls in a row that never connect (to 2+ players), or one account error, send everyone to the app.`
          : sb.mode === 'probation'
            ? 'The Twilio account looks fine again: the next check-in due goes by phone as a trial, and the lines are back if it connects.'
            : sb.manual
              ? `You sent every ${t.policeCall.one} to the app. Restore the lines when you want calls again.`
              : `Every ${t.policeCall.one} opens in the app, with no fine for the calls that didn't connect. The account is checked every 15 min; you can test your own phone and restore the lines.`}
        {sb.since && tsMs(sb.since) ? ` Since ${clockTime(tsMs(sb.since))}.` : ''}
      </p>
      {sb.lastError ? (
        <p className={`gm-hint${sb.mode === 'phone' ? '' : ' gm-hint--warn'}`}>
          Last error {tsMs(sb.lastError.at) ? `at ${clockTime(tsMs(sb.lastError.at))}` : ''}: {sb.lastError.message}
          {sb.streak > 0 ? ` · ${sb.streak} in a row didn't connect` : ''}
        </p>
      ) : null}
      {sb.health ? (
        <p className="gm-hint">
          Twilio account {sb.health.ok ? 'OK' : `not OK (${sb.health.message})`}
          {sb.health.balance ? ` · credit ${sb.health.balance}` : ''}
          {tsMs(sb.health.at) ? ` · checked ${clockTime(tsMs(sb.health.at))}` : ''}
        </p>
      ) : null}

      <div className="gm-row switchboard__actions">
        {sb.mode !== 'phone' ? (
          <Button small variant="primary" busy={busyKey === 'restore'} disabled={anyBusy} onClick={() => void run('restore', () => setSwitchboard({ action: 'restore' }), 'Lines restored.')}>
            Restore lines
          </Button>
        ) : null}
        {sb.mode !== 'app' || !sb.manual ? (
          <Button small busy={busyKey === 'app'} disabled={anyBusy} onClick={() => void run('app', () => setSwitchboard({ action: 'app' }), 'Everyone answers in the app.')}>
            Switch to the app
          </Button>
        ) : null}
        <Button small variant="ghost" busy={busyKey === 'check'} disabled={anyBusy} onClick={() => void run('check', () => setSwitchboard({ action: 'check' }))}>
          Check Twilio now
        </Button>
      </div>

      <div className="switchboard__mine">
        <p className="gm-entry__who">
          <strong>Your phone</strong>
          {mine ? <span className={`tag${mine.status === 'verified' ? ' tag--ink' : ' tag--tint'}`}>{LINE_LABEL[mine.status]}</span> : null}
        </p>
        {mine ? (
          <>
            <p className="gm-hint">
              {formatPhone(mine.number, pack.locale)}
              {progress ? ` · ${progress}` : mine.reason && mine.status !== 'verified' ? ` · ${mine.reason}` : ''}
            </p>
            <div className="gm-row">
              <Button small busy={busyKey === 'test' || progress !== null} disabled={anyBusy} onClick={() => void run('test', () => testPoliceLine())}>
                Test call to me
              </Button>
              <Button small variant="ghost" busy={busyKey === 'remove'} disabled={anyBusy} onClick={() => void run('remove', () => setPoliceLine({ number: null }))}>
                Remove my number
              </Button>
            </div>
          </>
        ) : (
          <form className="gm-row" onSubmit={saveMine} noValidate>
            <label className="visually-hidden" htmlFor="switchboard-number">
              Your mobile number
            </label>
            <input
              id="switchboard-number"
              className="input gm-flex1"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Your mobile, for test calls"
              maxLength={40}
              value={number}
              disabled={anyBusy}
              onChange={(e) => setNumber(e.target.value)}
            />
            <Button type="submit" small busy={busyKey === 'number'} disabled={anyBusy || number.trim() === ''}>
              Save
            </Button>
          </form>
        )}
      </div>

      <div>
        <p className="gm-entry__who">
          <strong>Lines on file</strong>
          <span className="section-head__meta">
            {players.filter((l) => l.status === 'verified').length} by phone · {playersById.size - players.filter((l) => l.status === 'verified').length} in the app
          </span>
        </p>
        {players.length === 0 ? (
          <p className="gm-hint">No player has added a number yet. Without one, their {t.policeCall.many} come in the app.</p>
        ) : (
          <ul className="gm-list">
            {players.map((l) => (
              <li key={l.id} className="switchboard__line">
                <span className="gm-flex1">
                  <strong>{playersById.get(l.id)?.displayName ?? 'A player'}</strong>{' '}
                  <span className="gm-entry__meta">
                    {formatPhone(l.number, pack.locale)}
                    {l.reason && l.status !== 'verified' ? ` · ${l.reason}` : ''}
                    {l.failures > 0 && l.status === 'verified' ? ` · ${l.failures} didn't connect` : ''}
                  </span>
                </span>
                <span className={`tag${l.status === 'verified' ? ' tag--ink' : ' tag--tint'}`}>{LINE_LABEL[l.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
