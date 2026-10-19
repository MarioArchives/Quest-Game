// Police line (packs with police, phone calls on): the number the police ring for this player's check-ins. Add a
// mobile number, ring it with a test call (it reads out a code to key back), and it is verified; or choose the app.
// No number, or an untested, failed or paused one, means check-ins come in the app, with no nagging. Once a call has
// gone out, "Add the police to your contacts" downloads a contact card, so the call shows a name.
import { useState, type FormEvent } from 'react';
import { friendlyError, setPoliceLine, testPoliceLine } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useDocument } from '../../data/hooks';
import { saveContact } from '../../lib/policeContact';
import { LINE_LABEL, testProgress } from '../../lib/policeLine';
import { clockTime } from '../../lib/time';
import { features, pack, t, zone } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { formatPhone, normalisePhone, type PlayerPhone } from '../../shared';

/** The status sentence under the line. */
function statusText(phone: PlayerPhone | null): string {
  const inApp = `your ${t.policeCall.many} come in the app`;
  if (!phone) return `No number, so ${inApp}. Add a mobile and the police ring you instead: you answer on the keypad.`;
  switch (phone.status) {
    case 'unverified':
      return `Not tested yet, so ${inApp}. Ring it to test: answer, and key in the code you hear.`;
    case 'verified':
      return `Tested${phone.verifiedAt ? ` at ${clockTime(tsMs(phone.verifiedAt), zone)}` : ''}. The police ring this number; a call that doesn't get through comes in the app instead, with no fine.`;
    case 'failed':
      return `${phone.reason ?? "The test didn't work"}. Until a test works, ${inApp}.`;
    case 'paused':
      return `${phone.reason ?? "Calls didn't connect"}. No fines for those, and ${inApp} until you test it again.`;
    case 'app-only':
      return `You chose the app: ${inApp}.`;
  }
}

export function PoliceLineCard() {
  const { user, player } = useSession();
  const { settings } = useGame();
  const toast = useToast();
  const uid = user?.uid ?? null;
  const on = Boolean(features.police && settings.policePhone && player && uid);
  const line = useDocument<PlayerPhone>(on ? `phones/${uid}` : null);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | 'mode' | 'contact' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!on || line.loading) return null;
  const phone = line.data;
  const progress = testProgress(phone?.test);
  const showForm = !phone || editing;
  const typed = normalisePhone(number, pack.locale);

  const run = async (what: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!typed) {
      setError('Enter a mobile number, like 07700 900123 or +44 7700 900123.');
      return;
    }
    void run('save', async () => {
      await setPoliceLine({ number: number.trim() });
      setEditing(false);
      setNumber('');
      toast('Number saved. Ring it to test it.', 'success');
    });
  };

  const test = () =>
    run('test', async () => {
      const result = await testPoliceLine();
      if (!result.ringing) setError(result.message ?? "The test call didn't go through.");
    });

  return (
    <section className="locate policeline" aria-labelledby="policeline-title">
      <div className="locate__row">
        <Icon name="phone" size={24} strokeWidth={2.2} />
        <div className="locate__text">
          <h2 id="policeline-title" className="locate__title">
            Police line
          </h2>
          <p className="locate__desc">How the police reach you</p>
        </div>
        <span className={`tag${phone?.status === 'verified' ? ' tag--ink' : phone ? ' tag--tint' : ''}`}>{phone ? LINE_LABEL[phone.status] : 'App'}</span>
      </div>

      {phone && !editing ? <p className="policeline__number">{formatPhone(phone.number, pack.locale)}</p> : null}
      <p className="locate__fine" role="status">
        {progress ?? statusText(phone)}
      </p>

      {showForm ? (
        <form className="policeline__form" onSubmit={save} noValidate>
          <label className="visually-hidden" htmlFor="policeline-number">
            Mobile number
          </label>
          <input
            id="policeline-number"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Mobile number"
            maxLength={40}
            value={number}
            disabled={busy !== null}
            onChange={(e) => setNumber(e.target.value)}
          />
          <div className="policeline__actions">
            <Button type="submit" small variant="primary" busy={busy === 'save'} disabled={number.trim() === ''}>
              Save number
            </Button>
            {editing ? (
              <Button small variant="ghost" disabled={busy !== null} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="policeline__actions">
          <Button
            small
            variant={phone!.status === 'verified' ? 'secondary' : 'primary'}
            busy={busy === 'test'}
            disabled={busy !== null || progress !== null}
            onClick={() => void test()}
          >
            {phone!.status === 'app-only' ? 'Use my phone: ring me' : phone!.status === 'verified' ? 'Test it again' : 'Ring me to test'}
          </Button>
          {phone!.status === 'verified' ? (
            <Button small busy={busy === 'mode'} disabled={busy !== null} onClick={() => void run('mode', async () => void (await setPoliceLine({ appOnly: true })))}>
              Use the app instead
            </Button>
          ) : null}
          <Button small variant="ghost" disabled={busy !== null} onClick={() => setEditing(true)}>
            Change number
          </Button>
          <Button small variant="ghost" busy={busy === 'remove'} disabled={busy !== null} onClick={() => void run('remove', async () => void (await setPoliceLine({ number: null })))}>
            Remove it
          </Button>
        </div>
      )}

      {phone?.callerId && phone.status === 'verified' ? (
        <Button
          small
          block
          icon={<Icon name="user" size={16} strokeWidth={2.4} />}
          busy={busy === 'contact'}
          disabled={busy !== null}
          onClick={() => void run('contact', () => saveContact(settings.policeCallerName || 'Police', phone.callerId!))}
        >
          Add the police to your contacts
        </Button>
      ) : null}

      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
