// GM: the story. Random drops (an on/off switch, when the next one is due, which random missions can go out) and the
// pack's story missions in order, each marked done, running or up next, with "Fire next" and a sheet to fire any of
// them with its judging, window, points, fastest bonus and fine changed first. The server checks everything again.
import { useMemo, useState } from 'react';
import { backend } from '../../backend';
import { fireGlobalQuest, friendlyError, type FireGlobalQuestInput } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs } from '../../data/hooks';
import { nextStoryId, storyStates, type StoryState } from '../../../functions/src/shared/story.ts';
import type { StoryQuest } from '../../../functions/src/shared/packs/types.ts';
import { pack, t } from '../../pack';
import type { Judging, Settings } from '../../shared';
import { clockTime, useRunner } from './common';

/** The pack's story missions, in order (none for a pack without a story). */
export const STORY: readonly StoryQuest[] = pack.catalogue.story ?? [];

/** The story with what has been fired so far: each mission's state and which is up next. */
export function useStory() {
  const { globalQuests } = useGame();
  return useMemo(() => {
    const fired = globalQuests.map((g) => ({ storyId: g.storyId ?? null, status: g.status }));
    return { states: storyStates(STORY, fired), nextId: nextStoryId(STORY, fired) };
  }, [globalQuests]);
}

const STATE_LABEL: Record<StoryState, string> = { done: 'Done', running: 'Running', 'not-yet': 'Not yet' };

/** The form's text fields, as typed. */
interface FireDraft {
  title: string;
  description: string;
  judging: Judging;
  windowMin: string;
  points: string;
  fastestBonus: string;
  penalty: string;
}

/** Where the sheet starts: the story's own values, then the settings'. */
function draftFor(story: StoryQuest, settings: Settings): FireDraft {
  return {
    title: story.title,
    description: story.description,
    judging: story.judging,
    windowMin: String(story.windowMin ?? settings.globalWindowMin),
    points: String(story.points ?? settings.sideQuestPoints),
    fastestBonus: String(story.fastestBonus ?? 0),
    penalty: String(story.penalty ?? settings.sideQuestSkipPenalty),
  };
}

/** The first thing to fix, in the server's limits, or null when it can be sent. */
function draftProblem(d: FireDraft): string | null {
  if (!d.title.trim()) return 'Give it a title.';
  if (d.title.trim().length > 80) return 'The title can be 80 characters at most.';
  if (d.description.length > 500) return 'The description can be 500 characters at most.';
  const w = Number(d.windowMin);
  if (!/^\d+$/.test(d.windowMin.trim()) || w < 5 || w > 180) return 'The window is 5 to 180 minutes.';
  for (const [raw, what] of [[d.points, 'Points'], [d.fastestBonus, 'The fastest bonus'], [d.penalty, 'The fine']] as const) {
    if (!/^\d+$/.test(raw.trim())) return `${what} is a whole number, 0 or more.`;
  }
  return null;
}

/** Only what differs from the start, so anything left alone keeps falling back to the story and the settings. */
function changes(d: FireDraft, from: FireDraft): Omit<Extract<FireGlobalQuestInput, { mode: 'story' }>, 'mode' | 'storyId'> {
  const out: Omit<Extract<FireGlobalQuestInput, { mode: 'story' }>, 'mode' | 'storyId'> = {};
  if (d.title.trim() !== from.title.trim()) out.title = d.title.trim();
  if (d.description.trim() !== from.description.trim()) out.description = d.description.trim();
  if (d.judging !== from.judging) out.judging = d.judging;
  if (Number(d.windowMin) !== Number(from.windowMin)) out.windowMin = Number(d.windowMin);
  if (Number(d.points) !== Number(from.points)) out.points = Number(d.points);
  if (Number(d.fastestBonus) !== Number(from.fastestBonus)) out.fastestBonus = Number(d.fastestBonus);
  if (Number(d.penalty) !== Number(from.penalty)) out.penalty = Number(d.penalty);
  return out;
}

const JUDGING: { id: Judging; label: string }[] = [
  { id: 'vote', label: 'Vote' },
  { id: 'submit', label: 'Submit' },
];

/** Fire one story mission: look at it, change what you like, send it out. */
export function StoryFireSheet({ story, liveTitle, onClose }: { story: StoryQuest; liveTitle: string | null; onClose(): void }) {
  const { settings } = useGame();
  const toast = useToast();
  const base = useMemo(() => draftFor(story, settings), [story, settings]);
  const [draft, setDraft] = useState<FireDraft>(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FireDraft) => (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: event.target.value }));

  const send = async () => {
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fireGlobalQuest({ mode: 'story', storyId: story.id, ...changes(draft, base) });
      toast(`${story.title} sent out.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const winner = draft.judging === 'vote' ? 'Winner gets' : 'Each entrant gets';
  return (
    <BottomSheet title={story.title} subtitle="Opens for everyone right now" onClose={onClose} locked={busy}>
      <div className="gm-form">
        <div className="field">
          <label className="field__label" htmlFor="story-title">
            Title
          </label>
          <input id="story-title" className="input" value={draft.title} maxLength={80} disabled={busy} onChange={set('title')} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="story-desc">
            What to do
          </label>
          <textarea id="story-desc" className="textarea" value={draft.description} maxLength={500} disabled={busy} onChange={set('description')} />
        </div>
        <div className="field">
          <span className="field__label" id="story-judging">
            How it is judged
          </span>
          <div className="gm-seg" role="group" aria-labelledby="story-judging">
            {JUDGING.map((j) => (
              <button key={j.id} type="button" className="gm-seg__btn" aria-pressed={draft.judging === j.id} disabled={busy} onClick={() => setDraft((d) => ({ ...d, judging: j.id }))}>
                {j.label}
              </button>
            ))}
          </div>
          <span className="field__hint">
            {draft.judging === 'vote' ? 'Entries go straight to a vote; the winner is paid.' : 'No vote: every entry is paid when time is up.'}
          </span>
        </div>
        <div className="gm-grid2">
          <div className="field">
            <label className="field__label" htmlFor="story-window">
              Open for (minutes)
            </label>
            <input id="story-window" className="input" inputMode="numeric" value={draft.windowMin} disabled={busy} onChange={set('windowMin')} />
            <span className="field__hint">5 to 180</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="story-points">
              {winner}
            </label>
            <input id="story-points" className="input" inputMode="numeric" value={draft.points} disabled={busy} onChange={set('points')} />
            <span className="field__hint">points</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="story-bonus">
              Fastest bonus
            </label>
            <input id="story-bonus" className="input" inputMode="numeric" value={draft.fastestBonus} disabled={busy} onChange={set('fastestBonus')} />
            <span className="field__hint">extra for the first entry</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="story-fine">
              Fine for not entering
            </label>
            <input id="story-fine" className="input" inputMode="numeric" value={draft.penalty} disabled={busy} onChange={set('penalty')} />
            <span className="field__hint">points; 0 = none</span>
          </div>
        </div>
        {liveTitle ? <p className="gm-hint gm-hint--warn">Sending it moves &ldquo;{liveTitle}&rdquo; on. Only one takes entries at a time.</p> : null}
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" block busy={busy} icon={<Icon name="megaphone" size={20} />} onClick={() => void send()}>
          Send it out
        </Button>
        <Button block variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  );
}

/** The random-drop switch, when the next one is due, and which random missions can go out. */
function RandomDrops() {
  const { settings, state, templatesById } = useGame();
  const { busyKey, run } = useRunner();
  const pool = useMemo(
    () => [...templatesById.values()].filter((tpl) => tpl.scope === 'global').sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })),
    [templatesById],
  );
  const next = tsMs(state.nextGlobalQuestAt);
  const auto = settings.autoSideQuests;
  const active = pool.filter((tpl) => tpl.active).length;

  return (
    <section className="gm-card">
      <div className="gm-setting">
        <label className="gm-setting__text" htmlFor="story-auto">
          <span className="gm-setting__label">Random drops</span>
          <span className="gm-setting__hint">
            {auto
              ? state.status === 'active' && next
                ? `On: the next one is due around ${clockTime(next)}`
                : 'On: a random mission goes out every so often'
              : `Off: only you fire ${t.sideQuest.many}`}
          </span>
        </label>
        <button
          id="story-auto"
          type="button"
          role="switch"
          className="switch"
          aria-checked={auto}
          disabled={busyKey !== null}
          onClick={() =>
            void run(
              'auto',
              () => backend().data.set('game/settings', { autoSideQuests: !auto }, { merge: true }),
              auto ? 'Random drops off.' : 'Random drops on.',
            )
          }
        />
      </div>
      <h3 className="gm-h">Random pool</h3>
      <p className="gm-hint">
        {active} of {pool.length} can go out. Retired ones are never drawn.
      </p>
      <ul className="gm-list">
        {pool.map((tpl) => (
          <li key={tpl.id} className="gm-setting">
            <label className="gm-setting__text" htmlFor={`pool-${tpl.id}`}>
              <span className="gm-setting__label">{tpl.title}</span>
            </label>
            <button
              id={`pool-${tpl.id}`}
              type="button"
              role="switch"
              className="switch"
              aria-checked={tpl.active}
              disabled={busyKey !== null}
              onClick={() =>
                void run(
                  `pool:${tpl.id}`,
                  () => backend().data.update(`questTemplates/${tpl.id}`, { active: !tpl.active }),
                  tpl.active ? `“${tpl.title}” retired.` : `“${tpl.title}” can go out again.`,
                )
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StorySection() {
  const { globalQuests, state, settings } = useGame();
  const { states, nextId } = useStory();
  const [firing, setFiring] = useState<StoryQuest | null>(null);
  const { busyKey, run } = useRunner();
  const live = globalQuests.find((g) => g.status === 'live');
  const gameOn = state.status === 'active';

  return (
    <>
      <RandomDrops />
      <div className="section-head">
        <h2>Story missions</h2>
        <span className="section-head__meta">{STORY.filter((s) => states[s.id] === 'done').length} of {STORY.length} done</span>
      </div>
      {STORY.length === 0 ? <p className="gm-hint">This game has no story missions.</p> : null}
      <ol className="gm-list gm-list--cards" aria-label="Story missions in order">
        {STORY.map((s) => {
          const status = states[s.id] ?? 'not-yet';
          const upNext = s.id === nextId;
          return (
            <li key={s.id} className="gm-card">
              <div className="gm-pm__head">
                <h3 className="gm-h">{s.title}</h3>
                <span className={`gm-count${status === 'running' || upNext ? ' gm-count--on' : ''}`}>{upNext ? 'Up next' : STATE_LABEL[status]}</span>
              </div>
              <p className="gm-hint">
                {s.judging === 'vote' ? 'Vote' : 'Submit'} · {s.windowMin ?? settings.globalWindowMin} min
              </p>
              <div className="gm-row">
                {upNext ? (
                  <Button
                    small
                    variant="primary"
                    className="gm-flex1"
                    busy={busyKey === `fire:${s.id}`}
                    disabled={!gameOn || busyKey !== null}
                    title={gameOn ? undefined : 'Only while the game is running'}
                    onClick={() => void run(`fire:${s.id}`, () => fireGlobalQuest({ mode: 'story', storyId: s.id }), `${s.title} sent out.`)}
                  >
                    Fire next
                  </Button>
                ) : null}
                {/* A running one can't be fired again until it closes. */}
                {status === 'running' ? null : (
                  <Button small className="gm-flex1" disabled={!gameOn} onClick={() => setFiring(s)}>
                    {upNext ? 'Change first' : status === 'not-yet' ? 'Open' : 'Fire again'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {firing ? <StoryFireSheet story={firing} liveTitle={live?.title ?? null} onClose={() => setFiring(null)} /> : null}
    </>
  );
}
