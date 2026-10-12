import { backend } from '../../backend';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { friendlyError } from '../../api';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { features, t, zone } from '../../pack';
import { RULESETS, type ParamSpec, type Settings } from '../../shared';

type NumKey =
  | 'starterQuestCount'
  | 'rerollLimit'
  | 'questPoints'
  | 'sideQuestPoints'
  | 'exposePenalty'
  | 'correctGuessReward'
  | 'wrongGuessCost'
  | 'guessCooldownMin'
  | 'fraudPenalty'
  | 'rejectPenalty'
  | 'globalIntervalMin'
  | 'globalIntervalMax'
  | 'globalWindowMin'
  | 'voteWindowMin'
  | 'guessLimit'
  | 'sideQuestSkipPenalty'
  | 'cleanPoints'
  | 'framePoints';
type FlagKey = 'refillOnComplete' | 'revealOnComplete' | 'pointsFloorZero';

interface NumField {
  key: NumKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}

interface Group {
  id: 'hands' | 'points' | 'guessing' | 'sideQuests' | 'rewards';
  title: string;
  fields: NumField[];
  /** Hidden when the pack leaves the feature out. */
  on: boolean;
}

const GROUPS: Group[] = [
  {
    id: 'hands',
    on: true,
    title: 'Hands',
    fields: [
      { key: 'starterQuestCount', label: `${t.quest.Many} dealt`, hint: `Secret ${t.quest.many} in each hand`, min: 1, max: 20 },
      { key: 'rerollLimit', label: 'Rerolls per player', hint: `Swaps for a fresh ${t.quest.one}`, min: 0, max: 100 },
    ],
  },
  {
    id: 'points',
    on: true,
    title: 'Points',
    fields: [
      { key: 'questPoints', label: `${t.quest.One} approved`, hint: `Points for an approved ${t.claim.one}`, min: 0, max: 10000 },
      { key: 'sideQuestPoints', label: `${t.sideQuest.One} win`, hint: 'Default bonus for the winner', min: 0, max: 10000 },
      { key: 'rejectPenalty', label: `Rejected ${t.claim.one} fine`, hint: `Lost when a ${t.witness.one} rejects a ${t.claim.one}`, min: 0, max: 10000 },
      { key: 'fraudPenalty', label: 'Fraud fine', hint: `Taken on top of the ${t.claim.one}’s points`, min: 0, max: 10000 },
    ],
  },
  {
    id: 'guessing',
    on: features.guesses,
    title: 'Guessing',
    fields: [
      { key: 'exposePenalty', label: 'Exposed', hint: `Lost when your ${t.quest.one} is guessed`, min: 0, max: 10000 },
      { key: 'correctGuessReward', label: 'Right guess', hint: 'Gained by the guesser', min: 0, max: 10000 },
      { key: 'wrongGuessCost', label: 'Wrong guess', hint: 'Lost by the guesser', min: 0, max: 10000 },
      { key: 'guessCooldownMin', label: 'Cooldown (min)', hint: 'Between guesses at the same player', min: 0, max: 1440 },
      { key: 'guessLimit', label: 'Guesses per player', hint: 'In the whole game; 0 = no limit', min: 0, max: 1000 },
    ],
  },
  {
    id: 'sideQuests',
    on: features.sideQuests,
    title: t.sideQuest.Many,
    fields: [
      { key: 'globalIntervalMin', label: 'Drop every, at least (min)', hint: 'Shortest gap between auto drops', min: 1, max: 1440 },
      { key: 'globalIntervalMax', label: 'Drop every, at most (min)', hint: 'Longest gap', min: 1, max: 1440 },
      { key: 'globalWindowMin', label: 'Open for (min)', hint: 'Then you check the entries; late ones still count until you start the vote', min: 1, max: 180 },
      { key: 'voteWindowMin', label: 'Voting open for (min)', hint: 'How long everyone has to vote', min: 1, max: 180 },
      { key: 'sideQuestSkipPenalty', label: 'Skip fine', hint: `Lost for not entering a ${t.sideQuest.one}; 0 = none`, min: 0, max: 10000 },
    ],
  },
  {
    id: 'rewards',
    on: Boolean(features.rewardChoice),
    title: 'Rewards',
    fields: [
      { key: 'cleanPoints', label: 'Points for you', hint: 'Gained when a player picks the first choice', min: 0, max: 10000 },
      { key: 'framePoints', label: 'Points off someone', hint: 'Taken from the player they pick', min: 0, max: 10000 },
    ],
  },
];

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  {
    key: 'refillOnComplete',
    label: 'Refill hand on completion',
    hint: `Off: five slots for the whole game (new ${t.quest.many} only after a rejection, an exposure or a reroll). On: each completed ${t.quest.one} is replaced`,
  },
  { key: 'revealOnComplete', label: `Reveal ${t.quest.one} on approval`, hint: `The feed names the ${t.quest.one} once approved` },
  { key: 'pointsFloorZero', label: 'Points can’t go below 0', hint: 'Fines and penalties stop at zero' },
];

interface Form {
  numbers: Record<NumKey, string>;
  /** Scoring rule-set id. */
  scoring: string;
  /** Every rule set's params as typed, by param key; only the chosen rule set's are shown and saved. */
  params: Record<string, string>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  flags: Record<FlagKey, boolean>;
}

const ALL_NUM_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const RULESET_LIST = Object.values(RULESETS);
/** The rule set picked in the form; an unknown id shows as the first one, like the server's fallback. */
const rulesFor = (id: string) => RULESETS[id] ?? RULESET_LIST[0]!;
const allParams = (): ParamSpec[] => RULESET_LIST.flatMap((rules) => [...rules.params]);

function fromSettings(s: Settings): Form {
  const numbers = Object.fromEntries(ALL_NUM_KEYS.map((key) => [key, String(s[key])])) as Record<NumKey, string>;
  const params = Object.fromEntries(allParams().map((p) => [p.key, String(s.scoringParams?.[p.key] ?? p.default)]));
  return {
    numbers,
    scoring: rulesFor(s.scoring).id,
    params,
    quietOn: s.quietHours !== null,
    quietStart: s.quietHours?.start ?? '01:00',
    quietEnd: s.quietHours?.end ?? '10:00',
    flags: { refillOnComplete: s.refillOnComplete, revealOnComplete: s.revealOnComplete, pointsFloorZero: s.pointsFloorZero },
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(form: Form): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const group of GROUPS.filter((g) => g.on)) {
    for (const f of group.fields) {
      const raw = form.numbers[f.key].trim();
      if (!/^\d+$/.test(raw)) errors[f.key] = 'Whole number, 0 or more';
      else if (Number(raw) < f.min || Number(raw) > f.max) errors[f.key] = `${f.min} to ${f.max}`;
    }
  }
  for (const p of rulesFor(form.scoring).params) {
    const raw = form.params[p.key]?.trim() ?? '';
    if (!/^\d+$/.test(raw)) errors[`param:${p.key}`] = 'Whole number, 0 or more';
    else if (Number(raw) < p.min || Number(raw) > p.max) errors[`param:${p.key}`] = `${p.min} to ${p.max}`;
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
    quietHours: form.quietOn ? { start: form.quietStart, end: form.quietEnd } : null,
    fraudPenalty: n('fraudPenalty'),
    rejectPenalty: n('rejectPenalty'),
    voteWindowMin: n('voteWindowMin'),
    guessLimit: n('guessLimit'),
    sideQuestSkipPenalty: n('sideQuestSkipPenalty'),
    cleanPoints: n('cleanPoints'),
    framePoints: n('framePoints'),
    refillOnComplete: form.flags.refillOnComplete,
    revealOnComplete: form.flags.revealOnComplete,
    pointsFloorZero: form.flags.pointsFloorZero,
    scoring: form.scoring,
    scoringParams: Object.fromEntries(rulesFor(form.scoring).params.map((p) => [p.key, Number(form.params[p.key]!.trim())])),
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
  const setParam = (key: string, value: string) => setForm((f) => ({ ...f, params: { ...f.params, [key]: value } }));
  const setFlag = (key: FlagKey, value: boolean) => setForm((f) => ({ ...f, flags: { ...f.flags, [key]: value } }));
  const showError = (key: string) => {
    const changed = key.startsWith('param:')
      ? form.params[key.slice(6)]?.trim() !== baseline.params[key.slice(6)]?.trim()
      : form.numbers[key as NumKey]?.trim() !== baseline.numbers[key as NumKey]?.trim();
    return tried || changed ? errors[key] : undefined;
  };
  const rules = rulesFor(form.scoring);

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
      await backend().data.set('game/settings', { ...toSettings(form) }, { merge: true });
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

      {GROUPS.filter((group) => group.on).map((group) => (
        <fieldset key={group.id} className="gm-fields">
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
          {group.id === 'sideQuests' ? (
            <div className="gm-quiet">
              <div className="gm-setting">
                <label className="gm-setting__text" htmlFor="set-quiet">
                  <span className="gm-setting__label">Quiet hours</span>
                  <span className="gm-setting__hint">No {t.sideQuest.many} open in this window ({zone.timeZone})</span>
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
        <legend className="gm-h">Scoring</legend>
        <div className="gm-choice" role="radiogroup" aria-label="Scoring rule set">
          {RULESET_LIST.map((rs) => (
            <label key={rs.id} className={`gm-choice__opt${form.scoring === rs.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="scoring"
                value={rs.id}
                className="visually-hidden"
                checked={form.scoring === rs.id}
                disabled={busy}
                onChange={() => setForm((f) => ({ ...f, scoring: rs.id }))}
              />
              <strong>{rs.name}</strong>
              <span className="gm-setting__hint">{rs.summary}</span>
            </label>
          ))}
        </div>
        {rules.params.map((p) => {
          const err = showError(`param:${p.key}`);
          const id = `set-param-${p.key}`;
          return (
            <div key={p.key} className="gm-setting">
              <label className="gm-setting__text" htmlFor={id}>
                <span className="gm-setting__label">{p.label}</span>
                <span className="gm-setting__hint">{err ? <strong className="gm-err">{err}</strong> : `${p.hint} (${p.min} to ${p.max})`}</span>
              </label>
              <input
                id={id}
                className={`input gm-setting__input${err ? ' is-invalid' : ''}`}
                inputMode="numeric"
                value={form.params[p.key]}
                disabled={busy}
                aria-invalid={err ? true : undefined}
                onChange={(e) => setParam(p.key, e.target.value)}
              />
            </div>
          );
        })}
      </fieldset>

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
