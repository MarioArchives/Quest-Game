// GM: periodic missions (packs with checkins). Any number of series, each sending everyone a request for a photo or
// a comment every so often, with its own prompts, timing, fine and count. Start, stop, send one now, end an open one
// early (with or without fines), edit and delete. The server checks everything again (managePeriodic).
import { useMemo, useState, type FormEvent } from 'react';
import { friendlyError, managePeriodic, type PeriodicFieldsInput } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Icon } from '../../components/Icon';
import { Loader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { formatCountdown } from '../../lib/time';
import { t } from '../../pack';
import { PERIODIC_LIMITS, periodicDone, periodicProblems, type Checkin, type Doc, type Periodic } from '../../shared';
import { useAnswers, useOpenCheckins } from '../home/CheckinCard';
import { clockTime, useRunner } from './common';

/** Every series, oldest first. */
export const usePeriodics = () => {
  const q = useQuery<Periodic>({ path: 'periodics' });
  const sorted = useMemo(() => [...q.data].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt)), [q.data]);
  return { list: sorted, loading: q.loading, error: q.error };
};

/** How many series are still sending (running and not finished). */
export const runningCount = (list: Periodic[]): number => list.filter((p) => p.status === 'running' && !periodicDone(p)).length;

/** "Every 60 min · 15 min to answer · −5 · 2 of 4 sent". */
function facts(p: Periodic): string {
  const sent = p.count > 0 ? `${p.sent} of ${p.count} sent` : `${p.sent} sent, no limit`;
  return `Every ${p.intervalMin} min · ${p.windowMin} min to answer · ${p.penalty > 0 ? `−${p.penalty} if missed` : 'no fine'} · ${sent}`;
}

export function PeriodicsSection() {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <section className="gm-card">
        <p className="gm-intro">
          Each {t.checkin.one} asks everyone for a photo or a comment every so often, with a time limit. No points for answering; missing one
          costs its fine. Run as many as you like.
        </p>
        <Button variant="primary" block icon={<Icon name="edit" size={20} />} onClick={() => setCreating(true)}>
          New {t.checkin.one}
        </Button>
      </section>
      <PeriodicCards emptyHint="None yet. Make one above." />
      {creating ? <PeriodicSheet periodic={null} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

/**
 * Every series as a card: its state, timing, the open one (who is still to answer, end it now), send one now, start or
 * stop, edit and delete. A pack's own GM screen can show these inline.
 */
export function PeriodicCards({ emptyHint = 'None yet.' }: { emptyHint?: string }) {
  const { list, loading, error } = usePeriodics();
  const open = useOpenCheckins();
  const [editing, setEditing] = useState<Doc<Periodic> | null>(null);

  return (
    <>
      {error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load them.
        </p>
      ) : loading ? (
        <Loader size={48} />
      ) : list.length === 0 ? (
        <p className="gm-hint">{emptyHint}</p>
      ) : (
        <ul className="gm-list gm-list--cards">
          {list.map((p) => (
            <li key={p.id} className="gm-card">
              <PeriodicCard periodic={p} open={open.find((c) => c.periodicId === p.id) ?? null} onEdit={() => setEditing(p)} />
            </li>
          ))}
        </ul>
      )}
      {editing ? <PeriodicSheet periodic={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function PeriodicCard({ periodic: p, open, onEdit }: { periodic: Doc<Periodic>; open: Doc<Checkin> | null; onEdit(): void }) {
  const { state } = useGame();
  const { busyKey, run } = useRunner();
  const [firing, setFiring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const done = periodicDone(p);
  const nextAt = tsMs(p.nextAt);
  const status = done ? 'All sent' : p.status === 'running' ? 'Running' : 'Stopped';
  const active = state.status === 'active';

  return (
    <>
      <div className="gm-pm__head">
        <h3 className="gm-h">{p.name}</h3>
        <span className={`gm-count${p.status === 'running' && !done ? ' gm-count--on' : ''}`}>{status}</span>
      </div>
      <p className="gm-hint">
        {facts(p)}
        {p.status === 'running' && nextAt && !done ? ` · next around ${clockTime(nextAt)}` : ''}
      </p>
      {open ? <OpenCheckin checkin={open} /> : null}
      <div className="gm-row gm-pm__actions">
        <Button
          small
          variant="primary"
          className="gm-flex1"
          disabled={!active || Boolean(open) || done || busyKey !== null}
          title={open ? 'One is open already' : done ? 'All have been sent' : !active ? 'Only while the game is running' : undefined}
          onClick={() => setFiring(true)}
        >
          Send one now
        </Button>
        {p.status === 'running' ? (
          <Button small className="gm-flex1" busy={busyKey === 'stop'} disabled={busyKey !== null} onClick={() => void run('stop', () => managePeriodic({ action: 'stop', id: p.id }), `${p.name} stopped.`)}>
            Stop
          </Button>
        ) : (
          <Button
            small
            className="gm-flex1"
            busy={busyKey === 'start'}
            disabled={done || busyKey !== null}
            onClick={() => void run('start', () => managePeriodic({ action: 'start', id: p.id }), `${p.name} running: the next one in ${p.intervalMin} min.`)}
          >
            Start
          </Button>
        )}
      </div>
      <div className="gm-row gm-pm__actions">
        <Button small variant="ghost" className="gm-flex1" disabled={busyKey !== null} onClick={onEdit}>
          Edit
        </Button>
        <Button small variant="ghost" className="gm-flex1" disabled={Boolean(open) || busyKey !== null} onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </div>
      {firing ? <FireSheet periodic={p} onClose={() => setFiring(false)} /> : null}
      {deleting ? (
        <ConfirmSheet
          title={`Delete “${p.name}”?`}
          confirmLabel="Delete it"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await managePeriodic({ action: 'delete', id: p.id });
          }}
        >
          <p>No more of these go out. The ones already sent stay in the feed, with their fines.</p>
        </ConfirmSheet>
      ) : null}
    </>
  );
}

/** The open one: time left, who has answered, and ending it early. */
function OpenCheckin({ checkin }: { checkin: Doc<Checkin> }) {
  const { activePlayers } = useGame();
  const answers = useAnswers(checkin.id);
  const now = useNow(1000);
  const [ending, setEnding] = useState(false);
  const answered = new Set(answers.map((a) => a.uid));
  const waiting = activePlayers.filter((p) => !answered.has(p.id));
  const endsAt = tsMs(checkin.endsAt);
  return (
    <div className="gm-current">
      <p className="eyebrow">
        Open · {endsAt > now ? `${formatCountdown(endsAt, now)} left` : 'closing'} · {answered.size} of {Math.max(activePlayers.length, answered.size)} answered
      </p>
      <p>{checkin.prompt}</p>
      <p className="gm-hint">{waiting.length > 0 ? `Still to answer: ${waiting.map((p) => p.displayName).join(', ')}` : 'Everyone has answered.'}</p>
      <Button small onClick={() => setEnding(true)}>
        End it now
      </Button>
      {ending ? <EndSheet checkin={checkin} waiting={waiting.length} onClose={() => setEnding(false)} /> : null}
    </div>
  );
}

function EndSheet({ checkin, waiting, onClose }: { checkin: Doc<Checkin>; waiting: number; onClose(): void }) {
  const { busyKey, run } = useRunner();
  const end = (charge: boolean) =>
    void run(charge ? 'charge' : 'free', () => managePeriodic({ action: 'end', checkinId: checkin.id, charge }), charge ? 'Ended. Fines charged.' : 'Ended, no fines.').then((ok) => {
      if (ok) onClose();
    });
  return (
    <BottomSheet title={`End “${checkin.name}” now?`} subtitle={checkin.prompt} onClose={onClose} locked={busyKey !== null}>
      <div className="gm-form">
        <p>
          {waiting === 0
            ? 'Everyone has answered, so nobody is fined either way.'
            : `${waiting} ${waiting === 1 ? 'player hasn’t' : 'players haven’t'} answered yet.`}
        </p>
        {checkin.penalty > 0 && waiting > 0 ? (
          <Button variant="danger" block busy={busyKey === 'charge'} disabled={busyKey !== null} onClick={() => end(true)}>
            End it, fine who missed it (−{checkin.penalty})
          </Button>
        ) : null}
        <Button variant="primary" block busy={busyKey === 'free'} disabled={busyKey !== null} onClick={() => end(false)}>
          End it, no fines
        </Button>
        <Button block variant="ghost" disabled={busyKey !== null} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </BottomSheet>
  );
}

/** Send the series' next one now, with one of its prompts (reshuffle) or your own words. */
function FireSheet({ periodic: p, onClose }: { periodic: Doc<Periodic>; onClose(): void }) {
  const toast = useToast();
  const pick = (avoid?: string) => {
    const list = p.prompts.filter((x) => x !== avoid);
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)]! : (avoid ?? p.prompts[0] ?? '');
  };
  const [prompt, setPrompt] = useState(() => pick());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!prompt.trim()) {
      setError('Say what everyone should send.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await managePeriodic({ action: 'fire', id: p.id, prompt: prompt.trim() });
      toast(`${p.name} sent to everyone.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title={`Send “${p.name}” now`}
      subtitle={`Everyone has ${p.windowMin} min to answer${p.penalty > 0 ? `, or loses ${p.penalty}` : ''}`}
      onClose={onClose}
      locked={busy}
    >
      <div className="gm-form">
        <div className="field">
          <label className="field__label" htmlFor="pm-fire-prompt">
            What everyone sends (a photo or a comment)
          </label>
          <textarea id="pm-fire-prompt" className="textarea" value={prompt} maxLength={PERIODIC_LIMITS.promptMax} disabled={busy} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        {p.prompts.length > 1 ? (
          <Button disabled={busy} icon={<Icon name="refresh" size={18} />} onClick={() => setPrompt((x) => pick(x))}>
            Reshuffle
          </Button>
        ) : null}
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

interface Draft {
  name: string;
  /** One prompt per line. */
  prompts: string;
  intervalMin: string;
  windowMin: string;
  penalty: string;
  count: string;
}

const toDraft = (p: Periodic | null): Draft => ({
  name: p?.name ?? '',
  prompts: p?.prompts.join('\n') ?? '',
  intervalMin: String(p?.intervalMin ?? 60),
  windowMin: String(p?.windowMin ?? 15),
  penalty: String(p?.penalty ?? 5),
  count: String(p?.count ?? 4),
});

const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);

/** The fields as the server wants them; NaN for anything that isn't a whole number, so the checks catch it. */
export function draftFields(d: Draft): PeriodicFieldsInput {
  return {
    name: d.name.trim(),
    prompts: d.prompts
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    intervalMin: num(d.intervalMin),
    windowMin: num(d.windowMin),
    penalty: num(d.penalty),
    count: num(d.count),
  };
}

/** Make a new series or edit one: name, prompts (one a line), how often, time to answer, fine and how many. */
function PeriodicSheet({ periodic, onClose }: { periodic: Doc<Periodic> | null; onClose(): void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(periodic));
  const [start, setStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });
  const L = PERIODIC_LIMITS;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const fields = draftFields(draft);
    const problem = periodicProblems(fields)[0];
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (periodic) await managePeriodic({ action: 'update', id: periodic.id, fields });
      else await managePeriodic({ action: 'create', fields, start });
      toast(periodic ? 'Saved.' : start ? `${fields.name} is running: the first one in ${fields.intervalMin} min.` : `${fields.name} saved, stopped.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={periodic ? `Edit “${periodic.name}”` : `New ${t.checkin.one}`} subtitle="Everyone answers with a photo or a comment" onClose={onClose} locked={busy}>
      <form className="gm-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="pm-name">
            Name
          </label>
          <input id="pm-name" className="input" value={draft.name} maxLength={L.nameMax} placeholder="Roll call" disabled={busy} onChange={set('name')} />
          <span className="field__hint">Shown on the card and in the feed</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pm-prompts">
            What it asks for, one per line
          </label>
          <textarea id="pm-prompts" className="textarea" rows={5} value={draft.prompts} disabled={busy} placeholder={'Show us what you’re drinking\nYour best detective face'} onChange={set('prompts')} />
          <span className="field__hint">Each time, one is picked at random (ones not asked yet first)</span>
        </div>
        <div className="gm-grid2">
          <div className="field">
            <label className="field__label" htmlFor="pm-interval">
              Every (min)
            </label>
            <input id="pm-interval" className="input" inputMode="numeric" value={draft.intervalMin} disabled={busy} onChange={set('intervalMin')} />
            <span className="field__hint">
              {L.intervalMin[0]} to {L.intervalMin[1]}
            </span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pm-window">
              Time to answer (min)
            </label>
            <input id="pm-window" className="input" inputMode="numeric" value={draft.windowMin} disabled={busy} onChange={set('windowMin')} />
            <span className="field__hint">
              {L.windowMin[0]} to {L.windowMin[1]}
            </span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pm-penalty">
              Fine for missing one
            </label>
            <input id="pm-penalty" className="input" inputMode="numeric" value={draft.penalty} disabled={busy} onChange={set('penalty')} />
            <span className="field__hint">Points; 0 = no fine</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="pm-count">
              How many
            </label>
            <input id="pm-count" className="input" inputMode="numeric" value={draft.count} disabled={busy} onChange={set('count')} />
            <span className="field__hint">In all; 0 = no limit</span>
          </div>
        </div>
        {periodic ? null : (
          <label className="gm-check">
            <input type="checkbox" checked={start} disabled={busy} onChange={(e) => setStart(e.target.checked)} />
            Start it now (the first one goes out after one interval)
          </label>
        )}
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" block busy={busy}>
          {periodic ? 'Save' : 'Create'}
        </Button>
        <Button block variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}

/** A short card for a GM home screen: what is open now, how many are running, and the way into the section. */
export function PeriodicsSummary({ onManage }: { onManage(): void }) {
  const { list } = usePeriodics();
  const open = useOpenCheckins();
  const now = useNow(1000);
  const running = runningCount(list);
  return (
    <section className="gm-card" aria-labelledby="gm-pm-sum">
      <h2 id="gm-pm-sum" className="gm-h">
        {t.checkin.Many}
      </h2>
      <p className="gm-hint">
        {list.length === 0 ? 'None set up.' : `${running} of ${list.length} running · ${open.length} open now`}
      </p>
      {open.map((c) => (
        <p key={c.id} className="gm-pm__open">
          <strong>{c.name}</strong> · {tsMs(c.endsAt) > now ? `${formatCountdown(tsMs(c.endsAt), now)} left` : 'closing'} · {c.prompt}
        </p>
      ))}
      <Button block onClick={onManage}>
        Manage {t.checkin.many}
      </Button>
    </section>
  );
}
