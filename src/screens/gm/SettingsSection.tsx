import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { friendlyError } from '../../api';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { db } from '../../firebase';
import type { Settings } from '../../shared';

type NumKey =
  | 'starterQuestCount'
  | 'rerollLimit'
  | 'questPoints'
  | 'sideQuestPoints'
  | 'globalEntryPoints'
  | 'exposePenalty'
  | 'correctGuessReward'
  | 'wrongGuessCost'
  | 'guessCooldownMin'
  | 'fraudPenalty'
  | 'rejectPenalty'
  | 'globalIntervalMin'
  | 'globalIntervalMax'
  | 'globalWindowMin'
  | 'voteWindowMin';
type FlagKey = 'refillOnComplete' | 'revealOnComplete' | 'pointsFloorZero';

interface NumField {
  key: NumKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}

const GROUPS: { title: string; fields: NumField[] }[] = [
  {
    title: 'Hands',
    fields: [
      { key: 'starterQuestCount', label: 'Quests dealt', hint: 'Secret quests in each hand', min: 1, max: 20 },
      { key: 'rerollLimit', label: 'Rerolls per player', hint: 'Swaps for a fresh quest', min: 0, max: 100 },
    ],
  },
  {
    title: 'Points',
    fields: [
      { key: 'questPoints', label: 'Quest approved', hint: 'Points for a witnessed claim', min: 0, max: 10000 },
      { key: 'sideQuestPoints', label: 'Side quest win', hint: 'Default bonus for the winner', min: 0, max: 10000 },
      { key: 'globalEntryPoints', label: 'Side quest entry', hint: 'Points just for entering (0 for none)', min: 0, max: 10000 },
      { key: 'rejectPenalty', label: 'Rejected claim fine', hint: 'Lost when a witness rejects a claim', min: 0, max: 10000 },
      { key: 'fraudPenalty', label: 'Fraud fine', hint: 'Taken on top of the claim’s points', min: 0, max: 10000 },
    ],
  },
  {
    title: 'Guessing',
    fields: [
      { key: 'exposePenalty', label: 'Exposed', hint: 'Lost when your quest is guessed', min: 0, max: 10000 },
      { key: 'correctGuessReward', label: 'Right guess', hint: 'Gained by the guesser', min: 0, max: 10000 },
      { key: 'wrongGuessCost', label: 'Wrong guess', hint: 'Lost by the guesser', min: 0, max: 10000 },
      { key: 'guessCooldownMin', label: 'Cooldown (min)', hint: 'Between guesses at the same player', min: 0, max: 1440 },
    ],
  },
  {
    title: 'Side quests',
    fields: [
      { key: 'globalIntervalMin', label: 'Drop every, at least (min)', hint: 'Shortest gap between auto drops', min: 1, max: 1440 },
      { key: 'globalIntervalMax', label: 'Drop every, at most (min)', hint: 'Longest gap', min: 1, max: 1440 },
      { key: 'globalWindowMin', label: 'Open for (min)', hint: 'How long entries stay open', min: 1, max: 180 },
      { key: 'voteWindowMin', label: 'Voting open for (min)', hint: 'How long everyone has to vote', min: 1, max: 180 },
    ],
  },
];

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  { key: 'refillOnComplete', label: 'Refill hand on completion', hint: 'Off: five slots for the whole game (new quests only after a rejection, an exposure or a reroll). On: each completed quest is replaced' },
  { key: 'revealOnComplete', label: 'Reveal quest on approval', hint: 'The feed names the quest once approved' },
  { key: 'pointsFloorZero', label: 'Points can’t go below 0', hint: 'Fines and penalties stop at zero' },
];

interface Form {
  numbers: Record<NumKey, string>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  flags: Record<FlagKey, boolean>;
}

const ALL_NUM_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

function fromSettings(s: Settings): Form {
  const numbers = Object.fromEntries(ALL_NUM_KEYS.map((key) => [key, String(s[key])])) as Record<NumKey, string>;
  return {
    numbers,
    quietOn: s.quietHours !== null,
    quietStart: s.quietHours?.start ?? '01:00',
    quietEnd: s.quietHours?.end ?? '10:00',
    flags: { refillOnComplete: s.refillOnComplete, revealOnComplete: s.revealOnComplete, pointsFloorZero: s.pointsFloorZero },
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(form: Form): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const group of GROUPS) {
    for (const f of group.fields) {
      const raw = form.numbers[f.key].trim();
      if (!/^\d+$/.test(raw)) errors[f.key] = 'Whole number, 0 or more';
      else if (Number(raw) < f.min || Number(raw) > f.max) errors[f.key] = `${f.min} to ${f.max}`;
    }
  }
  if (!errors.globalIntervalMin && !errors.globalIntervalMax && Number(form.numbers.globalIntervalMax) < Number(form.numbers.globalIntervalMin)) {
    errors.globalIntervalMax = 'At least the shortest gap';
  }
  if (form.quietOn) {
    if (!TIME.test(form.quietStart)) errors.quietStart = 'Use HH:MM';
    if (!TIME.test(form.quietEnd)) errors.quietEnd = 'Use HH:MM';
  }
  return errors;
}

function toSettings(form: Form): Settings {
  const n = (key: NumKey) => Number(form.numbers[key].trim());
  return {
    starterQuestCount: n('starterQuestCount'),
    rerollLimit: n('rerollLimit'),
    questPoints: n('questPoints'),
    sideQuestPoints: n('sideQuestPoints'),
    exposePenalty: n('exposePenalty'),
    correctGuessReward: n('correctGuessReward'),
    wrongGuessCost: n('wrongGuessCost'),
    guessCooldownMin: n('guessCooldownMin'),
    globalIntervalMin: n('globalIntervalMin'),
    globalIntervalMax: n('globalIntervalMax'),
    globalWindowMin: n('globalWindowMin'),
    globalEntryPoints: n('globalEntryPoints'),
    quietHours: form.quietOn ? { start: form.quietStart, end: form.quietEnd } : null,
    fraudPenalty: n('fraudPenalty'),
    rejectPenalty: n('rejectPenalty'),
    voteWindowMin: n('voteWindowMin'),
    refillOnComplete: form.flags.refillOnComplete,
    revealOnComplete: form.flags.revealOnComplete,
    pointsFloorZero: form.flags.pointsFloorZero,
  };
}

export function SettingsSection() {
  const { settings } = useGame();
  const toast = useToast();
  const settingsKey = JSON.stringify(settings);
  const baseline = useMemo(() => fromSettings(settings), [settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<Form>(baseline);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastBaseline = useRef(JSON.stringify(baseline));

  // A change made elsewhere (another GM) flows in unless this form has unsaved edits.
  useEffect(() => {
    const next = JSON.stringify(baseline);
    if (next === lastBaseline.current) return;
    setForm((prev) => (JSON.stringify(prev) === lastBaseline.current ? baseline : prev));
    lastBaseline.current = next;
  }, [baseline]);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const errors = useMemo(() => validate(form), [form]);
  const errorCount = Object.keys(errors).length;

  const setNumber = (key: NumKey, value: string) => setForm((f) => ({ ...f, numbers: { ...f.numbers, [key]: value } }));
  const setFlag = (key: FlagKey, value: boolean) => setForm((f) => ({ ...f, flags: { ...f.flags, [key]: value } }));
  const showError = (key: string) => (tried || form.numbers[key as NumKey]?.trim() !== baseline.numbers[key as NumKey]?.trim() ? errors[key] : undefined);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (errorCount > 0) {
      setError('Fix the highlighted fields first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Merge so keys this form doesn't know about survive; the doc may not exist on a fresh emulator.
      await setDoc(doc(db, 'game', 'settings'), toSettings(form), { merge: true });
      setTried(false);
      toast('Settings saved. They apply straight away.', 'success');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} noValidate className="gm-settings">
      <div className="section-head">
        <h2>Settings</h2>
        <span className={`gm-count${dirty ? ' gm-count--on' : ''}`}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
      </div>
      <p className="gm-hint">Every number here applies to the live game straight away.</p>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="gm-fields">
          <legend className="gm-h">{group.title}</legend>
          {group.fields.map((f) => {
            const err = showError(f.key);
            const id = `set-${f.key}`;
            return (
              <div key={f.key} className="gm-setting">
                <label className="gm-setting__text" htmlFor={id}>
                  <span className="gm-setting__label">{f.label}</span>
                  <span className="gm-setting__hint">{err ? <strong className="gm-err">{err}</strong> : f.hint}</span>
                </label>
                <input
                  id={id}
                  className={`input gm-setting__input${err ? ' is-invalid' : ''}`}
                  inputMode="numeric"
                  value={form.numbers[f.key]}
                  disabled={busy}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => setNumber(f.key, e.target.value)}
                />
              </div>
            );
          })}
          {group.title === 'Side quests' ? (
            <div className="gm-quiet">
              <div className="gm-setting">
                <label className="gm-setting__text" htmlFor="set-quiet">
                  <span className="gm-setting__label">Quiet hours</span>
                  <span className="gm-setting__hint">No side quests open in this window (UK time)</span>
                </label>
                <button
                  id="set-quiet"
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={form.quietOn}
                  disabled={busy}
                  onClick={() => setForm((f) => ({ ...f, quietOn: !f.quietOn }))}
                />
              </div>
              {form.quietOn ? (
                <div className="gm-grid2">
                  <div className="field">
                    <label className="field__label" htmlFor="set-quiet-start">
                      From
                    </label>
                    <input id="set-quiet-start" className="input" type="time" value={form.quietStart} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, quietStart: e.target.value }))} />
                    {errors.quietStart && tried ? <span className="gm-err">{errors.quietStart}</span> : null}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="set-quiet-end">
                      Until
                    </label>
                    <input id="set-quiet-end" className="input" type="time" value={form.quietEnd} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, quietEnd: e.target.value }))} />
                    {errors.quietEnd && tried ? <span className="gm-err">{errors.quietEnd}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      ))}

      <fieldset className="gm-fields">
        <legend className="gm-h">Rules</legend>
        {FLAGS.map((f) => (
          <div key={f.key} className="gm-setting">
            <label className="gm-setting__text" htmlFor={`set-${f.key}`}>
              <span className="gm-setting__label">{f.label}</span>
              <span className="gm-setting__hint">{f.hint}</span>
            </label>
            <button
              id={`set-${f.key}`}
              type="button"
              role="switch"
              className="switch"
              aria-checked={form.flags[f.key]}
              disabled={busy}
              onClick={() => setFlag(f.key, !form.flags[f.key])}
            />
          </div>
        ))}
      </fieldset>

      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" block busy={busy} disabled={!dirty}>
        {dirty ? 'Save settings' : 'No changes'}
      </Button>
      {dirty ? (
        <Button
          block
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setForm(baseline);
            setTried(false);
            setError(null);
          }}
        >
          Discard changes
        </Button>
      ) : null}
    </form>
  );
}
