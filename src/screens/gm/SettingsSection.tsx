import { backend } from '../../backend';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { friendlyError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { features, reactionStyle, t, zone } from '../../pack';
import { RULESETS, type VoteStyle } from '../../shared';
import {
  foldSummary,
  fromSettings,
  rulesFor,
  toSettings,
  validateSettingsForm,
  type FlagKey,
  type FoldId,
  type NumKey,
  type SettingsForm,
  type StandingKey,
} from './settingsForm';

const VOTE_STYLES: { id: VoteStyle; name: string; hint: string }[] = [
  { id: 'pick', name: 'Pick one', hint: 'Each player votes for one entry. Most votes wins.' },
  { id: 'yesno', name: 'Yes or no', hint: 'A yes or a no on every entry. Most yeses (less the noes) wins; points per vote are paid per yes.' },
];

interface NumField {
  key: NumKey;
  label: string;
  hint: string;
}

interface Group {
  id: 'hands' | 'points' | 'guessing' | 'sideQuests' | 'rewards' | 'police';
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
      { key: 'starterQuestCount', label: `${t.quest.Many} dealt`, hint: `Secret ${t.quest.many} in each hand` },
      { key: 'rerollLimit', label: 'Rerolls per player', hint: `Swaps for a fresh ${t.quest.one}` },
    ],
  },
  {
    id: 'points',
    on: true,
    title: 'Points',
    fields: [
      { key: 'questPoints', label: `${t.quest.One} approved`, hint: `Points for an approved ${t.claim.one}` },
      { key: 'sideQuestPoints', label: `${t.sideQuest.One} win`, hint: 'Default bonus for the winner' },
      { key: 'rejectPenalty', label: `Rejected ${t.claim.one} fine`, hint: `Lost when a ${t.witness.one} rejects a ${t.claim.one}` },
      { key: 'fraudPenalty', label: 'Fraud fine', hint: `Taken on top of the ${t.claim.one}’s points` },
      ...(reactionStyle === 'votes'
        ? [
            { key: 'topEntryPoints' as const, label: `Top of the ${t.feed.one}`, hint: `While a player’s own entry is on top of the ${t.feed.one}` },
            { key: 'verdictPoints' as const, label: 'Agree with the room', hint: 'For an eye or heart that matches the verdict; 0 = off' },
            { key: 'verdictWindowMin' as const, label: 'Verdict after (min)', hint: 'From when an entry is posted' },
            { key: 'verdictMinVotes' as const, label: 'Votes for a verdict', hint: 'Fewer, and there is no verdict' },
          ]
        : []),
    ],
  },
  {
    id: 'guessing',
    on: features.guesses,
    title: 'Guessing',
    fields: [
      { key: 'exposePenalty', label: 'Exposed', hint: `Lost when your ${t.quest.one} is guessed` },
      { key: 'correctGuessReward', label: 'Right guess', hint: 'Gained by the guesser' },
      { key: 'wrongGuessCost', label: 'Wrong guess', hint: 'Lost by the guesser' },
      { key: 'guessCooldownMin', label: 'Cooldown (min)', hint: 'Between guesses at the same player' },
      { key: 'guessLimit', label: 'Guesses per player', hint: 'In the whole game; 0 = no limit' },
    ],
  },
  {
    id: 'sideQuests',
    on: features.sideQuests,
    title: t.sideQuest.Many,
    fields: [
      { key: 'globalIntervalMin', label: 'Drop every, at least (min)', hint: 'Shortest gap between auto drops' },
      { key: 'globalIntervalMax', label: 'Drop every, at most (min)', hint: 'Longest gap' },
      { key: 'globalWindowMin', label: 'Open for (min)', hint: 'Then you check the entries; late ones still count until you start the vote' },
      { key: 'voteWindowMin', label: 'Voting open for (min)', hint: 'How long everyone has to vote' },
      { key: 'sideQuestSkipPenalty', label: 'Skip fine', hint: `Lost for not entering a ${t.sideQuest.one}; 0 = none` },
    ],
  },
  {
    id: 'rewards',
    on: Boolean(features.rewardChoice),
    title: 'Rewards',
    fields: [
      { key: 'cleanPoints', label: 'Points for you', hint: 'Gained when a player picks the first choice' },
      { key: 'framePoints', label: 'Points off someone', hint: 'Taken from the player they pick' },
    ],
  },
  {
    id: 'police',
    on: Boolean(features.police),
    title: t.policeCall.Many,
    fields: [
      { key: 'policeEveryMin', label: `${t.poi.One} checked every (min)`, hint: `Gap between ${t.policeCall.many} for a ${t.poi.one}` },
      { key: 'policeTipEveryMin', label: 'Tip-off cooldown (min)', hint: `How often a ${t.confidant.one} can tip off the police` },
      { key: 'policeWindowMin', label: 'Time to answer (min)', hint: 'Then it counts as missed' },
      { key: 'policePassPoints', label: 'Pass', hint: 'Points for a right answer' },
      { key: 'policeFailPenalty', label: 'Fail or miss', hint: 'Points lost for a wrong or missing answer' },
      { key: 'policeHeardPenalty', label: 'Fine when they pick up but get it wrong', hint: 'Telegram calls: a wrong reply, or none' },
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

const RULESET_LIST = Object.values(RULESETS);

/** The standing lines (any pack): blank means off. */
const STANDING_FIELDS: { key: StandingKey; label: string; hint: string }[] = [
  { key: 'confidantAbove', label: `${t.confidant.One} above`, hint: 'Points above this line; blank = off' },
  { key: 'poiBelow', label: `${t.poi.One} below`, hint: 'Points below this line; blank = off' },
];

/** The form as compared for unsaved changes: the random-drop switch is edited elsewhere and doesn't count. */
const comparable = (f: SettingsForm, auto: boolean) => JSON.stringify({ ...f, autoSideQuests: auto });

/** The fold a field's error belongs to (the errors are keyed as in validateSettingsForm). */
function foldOf(key: string): FoldId {
  if (key.startsWith('param:')) return 'scoring';
  if (key === 'confidantAbove' || key === 'poiBelow') return 'standings';
  if (key === 'quietStart' || key === 'quietEnd') return 'sideQuests';
  if (key === 'callerName' || key === 'policeBreakerAt') return 'police';
  return GROUPS.find((g) => g.fields.some((f) => f.key === key))?.id ?? 'hands';
}

/** The folds in the order they are shown. */
const FOLD_ORDER: FoldId[] = [...GROUPS.filter((g) => g.on).map((g) => g.id), 'standings', 'scoring', 'rules'];

/**
 * The GM's settings form. `folds` (a pack's own GM screen) shows each group as a fold with a one-line summary, one
 * open at a time; without it every group is laid out in full.
 */
export function SettingsSection({ folds = false }: { folds?: boolean } = {}) {
  const { settings } = useGame();
  const toast = useToast();
  const settingsKey = JSON.stringify(settings);
  const baseline = useMemo(() => fromSettings(settings), [settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<SettingsForm>(baseline);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastBaseline = useRef(JSON.stringify(baseline));
  const [openFold, setOpenFold] = useState<FoldId | null>(null);

  // A change made elsewhere (another GM) flows in unless this form has unsaved edits.
  useEffect(() => {
    const next = JSON.stringify(baseline);
    if (next === lastBaseline.current) return;
    setForm((prev) => (JSON.stringify(prev) === lastBaseline.current ? baseline : prev));
    lastBaseline.current = next;
  }, [baseline]);

  const dirty = comparable(form, baseline.autoSideQuests) !== JSON.stringify(baseline);
  const errors = useMemo(() => validateSettingsForm(form), [form]);
  const errorCount = Object.keys(errors).length;

  const setNumber = (key: NumKey, value: string) => setForm((f) => ({ ...f, numbers: { ...f.numbers, [key]: value } }));
  const setParam = (key: string, value: string) => setForm((f) => ({ ...f, params: { ...f.params, [key]: value } }));
  const setStanding = (key: StandingKey, value: string) => setForm((f) => ({ ...f, standing: { ...f.standing, [key]: value } }));
  const setFlag = (key: FlagKey, value: boolean) => setForm((f) => ({ ...f, flags: { ...f.flags, [key]: value } }));
  const showError = (key: string) => {
    const changed = key.startsWith('param:')
      ? form.params[key.slice(6)]?.trim() !== baseline.params[key.slice(6)]?.trim()
      : key === 'confidantAbove' || key === 'poiBelow'
        ? form.standing.confidantAbove.trim() !== baseline.standing.confidantAbove.trim() || form.standing.poiBelow.trim() !== baseline.standing.poiBelow.trim()
        : form.numbers[key as NumKey]?.trim() !== baseline.numbers[key as NumKey]?.trim();
    return tried || changed ? errors[key] : undefined;
  };
  const rules = rulesFor(form.scoring);
  // The in-browser demo never rings anyone.
  const phoneCallsHere = backend().kind !== 'mock';

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (errorCount > 0) {
      setError('Fix the highlighted fields first.');
      // Folded, open the first group with a problem so it can be seen.
      if (folds) {
        const flagged = new Set(Object.keys(errors).map(foldOf));
        setOpenFold(FOLD_ORDER.find((id) => flagged.has(id)) ?? null);
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Merge so keys this form doesn't know about survive; the doc may not exist on a fresh emulator.
      await backend().data.set('game/settings', { ...toSettings(form), autoSideQuests: settings.autoSideQuests }, { merge: true });
      setTried(false);
      toast('Settings saved. They apply straight away.', 'success');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  // A fold is flagged when one of its fields shows an error.
  const flaggedFolds = new Set(Object.keys(errors).filter((key) => showError(key)).map(foldOf));
  const fold = (id: FoldId) => ({
    id,
    folds,
    open: openFold === id,
    summary: foldSummary(id, form),
    flagged: flaggedFolds.has(id),
    onToggle: () => setOpenFold((current) => (current === id ? null : id)),
  });

  return (
    <form onSubmit={(event) => void save(event)} noValidate className={`gm-settings${folds ? ' gm-settings--folds' : ''}`}>
      <div className="section-head">
        <h2>Settings</h2>
        <span className={`gm-count${dirty ? ' gm-count--on' : ''}`}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
      </div>
      <p className="gm-hint">Every number here applies to the live game straight away.</p>

      {GROUPS.filter((group) => group.on).map((group) => (
        <Fold key={group.id} title={group.title} {...fold(group.id)}>
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
          {group.id === 'sideQuests' ? (
            <div className="gm-quiet">
              <span className="gm-setting__label">How everyone votes</span>
              <div className="gm-choice" role="radiogroup" aria-label="How everyone votes">
                {VOTE_STYLES.map((v) => (
                  <label key={v.id} className={`gm-choice__opt${form.voteStyle === v.id ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="voteStyle"
                      value={v.id}
                      className="visually-hidden"
                      checked={form.voteStyle === v.id}
                      disabled={busy}
                      onChange={() => setForm((f) => ({ ...f, voteStyle: v.id }))}
                    />
                    <strong>{v.name}</strong>
                    <span className="gm-setting__hint">{v.hint}</span>
                  </label>
                ))}
              </div>
              <span className="gm-setting__hint">An open vote keeps its way.</span>
            </div>
          ) : null}
          {group.id === 'police' ? (
            <div className="gm-quiet">
              <div className="gm-setting">
                <label className="gm-setting__text" htmlFor="set-police-phone">
                  <span className="gm-setting__label">Ring their phones</span>
                  <span className="gm-setting__hint">
                    {phoneCallsHere
                      ? `Players with a tested number get a call and answer on the keypad; everyone else answers in the app`
                      : 'Not in this demo: phone calls need Twilio and the live game'}
                  </span>
                </label>
                <button
                  id="set-police-phone"
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={form.policePhone}
                  disabled={busy || !phoneCallsHere}
                  onClick={() => setForm((f) => ({ ...f, policePhone: !f.policePhone }))}
                />
              </div>
              {form.policePhone ? (
                <>
                  <div className="gm-setting">
                    <label className="gm-setting__text" htmlFor="set-policeBreakerAt">
                      <span className="gm-setting__label">Switch to the app after</span>
                      <span className="gm-setting__hint">
                        {showError('policeBreakerAt') ? <strong className="gm-err">{showError('policeBreakerAt')}</strong> : 'Calls in a row that never connect (to 2+ players)'}
                      </span>
                    </label>
                    <input
                      id="set-policeBreakerAt"
                      className={`input gm-setting__input${showError('policeBreakerAt') ? ' is-invalid' : ''}`}
                      inputMode="numeric"
                      value={form.numbers.policeBreakerAt}
                      disabled={busy}
                      onChange={(e) => setNumber('policeBreakerAt', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="set-caller-name">
                      Calls come from
                    </label>
                    <input
                      id="set-caller-name"
                      className={`input${errors.callerName ? ' is-invalid' : ''}`}
                      value={form.callerName}
                      maxLength={60}
                      disabled={busy}
                      onChange={(e) => setForm((f) => ({ ...f, callerName: e.target.value }))}
                    />
                    {errors.callerName ? <span className="gm-err">{errors.callerName}</span> : <span className="gm-setting__hint">Said on every call, and the name on the players&apos; contact card</span>}
                  </div>
                </>
              ) : null}
              <div className="field">
                <label className="field__label" htmlFor="set-telegram">
                  Police on Telegram
                </label>
                <input
                  id="set-telegram"
                  className={`input${errors.telegram ? ' is-invalid' : ''}`}
                  value={form.telegram}
                  placeholder="@username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={80}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                />
                {errors.telegram ? (
                  <span className="gm-err">{errors.telegram}</span>
                ) : (
                  <span className="gm-setting__hint">The @username of the account that rings players on Telegram; joining players are sent to it. Blank if it has none</span>
                )}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="set-telegram-number">
                  Its phone number
                </label>
                <input
                  id="set-telegram-number"
                  className={`input${errors.telegramNumber ? ' is-invalid' : ''}`}
                  type="tel"
                  inputMode="tel"
                  value={form.telegramNumber}
                  placeholder="+44 7700 900123"
                  maxLength={40}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, telegramNumber: e.target.value }))}
                />
                {errors.telegramNumber ? (
                  <span className="gm-err">{errors.telegramNumber}</span>
                ) : (
                  <span className="gm-setting__hint">The police on Telegram by number, for an account without a username; and on the contact card players save. Blank for none</span>
              )}
              </div>
              <div className="gm-setting">
                <label className="gm-setting__text" htmlFor="set-police-notices">
                  <span className="gm-setting__label">Case updates in the police chat</span>
                  <span className="gm-setting__hint">Players with a Telegram line get their notifications there instead of push</span>
                </label>
                <button
                  id="set-police-notices"
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={form.policeNotices}
                  disabled={busy}
                  onClick={() => setForm((f) => ({ ...f, policeNotices: !f.policeNotices }))}
                />
              </div>
            </div>
          ) : null}
        </Fold>
      ))}

      <Fold title="Standings" {...fold('standings')}>
        {STANDING_FIELDS.map((f) => {
          const err = showError(f.key) ? errors[f.key] : undefined;
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
                inputMode="text"
                placeholder="Off"
                value={form.standing[f.key]}
                disabled={busy}
                aria-invalid={err ? true : undefined}
                onChange={(e) => setStanding(f.key, e.target.value)}
              />
            </div>
          );
        })}
      </Fold>

      <Fold title="Scoring" {...fold('scoring')}>
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
      </Fold>

      <Fold title="Rules" {...fold('rules')}>
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
      </Fold>

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

/**
 * One group of the form: a fieldset with its legend, or (folds) a heading whose button opens it, showing a summary of
 * what is in it while it is shut. The fields stay mounted (hidden) while shut, so nothing typed is lost.
 */
function Fold({
  id,
  title,
  folds,
  open,
  summary,
  flagged,
  onToggle,
  children,
}: {
  id: FoldId;
  title: string;
  folds: boolean;
  open: boolean;
  summary: string;
  flagged: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  if (!folds) {
    return (
      <fieldset className="gm-fields">
        <legend className="gm-h">{title}</legend>
        {children}
      </fieldset>
    );
  }
  const bodyId = `gm-fold-${id}`;
  return (
    <div className={`gm-fold${open ? ' is-open' : ''}`}>
      <h3 className="gm-fold__h">
        <button type="button" className="gm-fold__btn" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="gm-fold__title">{title}</span>
          <span className={`gm-fold__sum${flagged ? ' is-flagged' : ''}`}>{open ? 'Open' : flagged ? 'Needs fixing' : summary}</span>
          <Icon name="chevronDown" size={16} strokeWidth={2.4} className="gm-fold__chev" />
        </button>
      </h3>
      <fieldset id={bodyId} className="gm-fold__body" hidden={!open}>
        <legend className="visually-hidden">{title}</legend>
        {children}
      </fieldset>
    </div>
  );
}
