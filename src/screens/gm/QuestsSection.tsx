import { useMemo, useState, type FormEvent } from 'react';
import { advanceGlobalQuest, fireGlobalQuest, friendlyError, type FireGlobalQuestInput } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Icon } from '../../components/Icon';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo, formatCountdown } from '../../lib/time';
import type { Doc, GlobalQuest, Submission } from '../../shared';
import { clockTime, useRunner } from './common';

/** Entries for one side quest (approved from the moment they are made; a disqualified one drops out), newest first. */
function useEntries(questId: string): Doc<Submission>[] {
  const { approved } = useGame();
  return useMemo(
    () => approved.filter((s) => s.kind === 'global' && s.questId === questId).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)),
    [approved, questId],
  );
}

export function QuestsSection() {
  const { state, settings, globalQuests } = useGame();
  const { busyKey, run } = useRunner();
  const now = useNow(1000);
  const [writing, setWriting] = useState(false);
  const [confirmRandom, setConfirmRandom] = useState(false);

  const live = globalQuests.filter((g) => g.status === 'live');
  const voting = globalQuests.filter((g) => g.status === 'voting');
  const past = globalQuests.filter((g) => g.status === 'closed').slice(0, 6);
  const active = state.status === 'active';
  const nextAt = tsMs(state.nextGlobalQuestAt);
  const running = live[0] ?? null;

  const fireRandom = () => run('random', () => fireGlobalQuest({ mode: 'random' }), 'Side quest fired.');

  return (
    <>
      <section className="gm-card gm-hero halftone" aria-label="Fire a side quest">
        <p className="eyebrow">
          Side quests · {live.length > 0 ? 'entries open' : voting.length > 0 ? 'voting' : 'none running'}
        </p>
        {running ? (
          <h2 className="gm-hero__title">{running.title}</h2>
        ) : (
          <p className="gm-hero__none">
            {voting.length > 0
              ? 'Voting is on.'
              : active
                ? 'Nothing is open right now.'
                : 'The game isn’t running, so side quests are on hold.'}
          </p>
        )}
        <div className="gm-row">
          <Button
            variant="primary"
            onRed
            className="gm-flex1"
            busy={busyKey === 'random'}
            disabled={!active || busyKey !== null}
            onClick={() => (running ? setConfirmRandom(true) : void fireRandom())}
          >
            Fire random
          </Button>
          <Button onRed className="gm-flex1" disabled={!active || busyKey !== null} onClick={() => setWriting(true)}>
            Write custom
          </Button>
        </div>
        <p className="gm-hero__next">
          {!active
            ? 'Auto drops start once the game is live.'
            : nextAt
              ? `Next auto drop around ${clockTime(nextAt)}${nextAt <= now ? ' (due now)' : ''}.`
              : 'No auto drop scheduled yet.'}
          {settings.quietHours ? ` No drops ${settings.quietHours.start}–${settings.quietHours.end}.` : ''} Voting stays open{' '}
          {settings.voteWindowMin} min.
        </p>
      </section>

      {live.length > 0 ? (
        <>
          <div className="section-head">
            <h2>Entries open</h2>
            <span className="gm-count gm-count--on">{live.length} live</span>
          </div>
          <ul className="gm-list gm-list--cards">
            {live.map((quest) => (
              <li key={quest.id} className="gm-card">
                <LiveQuest quest={quest} now={now} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {voting.length > 0 ? (
        <>
          <div className="section-head">
            <h2>Voting</h2>
            <span className="gm-count gm-count--on">{voting.length} open</span>
          </div>
          <ul className="gm-list gm-list--cards">
            {voting.map((quest) => (
              <li key={quest.id} className="gm-card">
                <VotingQuest quest={quest} now={now} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {past.length > 0 ? (
        <details className="gm-fold">
          <summary>
            <span>Recent side quests · {past.length}</span>
          </summary>
          <ul className="gm-list">
            {past.map((quest) => (
              <PastQuest key={quest.id} quest={quest} />
            ))}
          </ul>
        </details>
      ) : null}

      {confirmRandom && running ? (
        <ConfirmSheet
          title="Replace the live side quest?"
          confirmLabel="Fire a new one"
          onClose={() => setConfirmRandom(false)}
          onConfirm={async () => {
            await fireGlobalQuest({ mode: 'random' });
          }}
        >
          <p>
            <strong>&ldquo;{running.title}&rdquo;</strong> closes right away and a random side quest opens instead. Only one takes entries at a
            time.
          </p>
        </ConfirmSheet>
      ) : null}
      {writing ? <CustomSheet hasLive={live.length > 0} onClose={() => setWriting(false)} /> : null}
    </>
  );
}

function EntryList({ entries, quest, showVotes = false }: { entries: Doc<Submission>[]; quest: Doc<GlobalQuest>; showVotes?: boolean }) {
  const { playersById } = useGame();
  const now = useNow(30_000);
  const winners = new Set(quest.winningSubmissionIds ?? []);

  return (
    <ul className="gm-list">
      {entries.map((entry) => {
        const who = playersById.get(entry.uid);
        const votes = showVotes ? (quest.tally?.[entry.id] ?? 0) : null;
        const won = winners.has(entry.id);
        return (
          <li key={entry.id} className="gm-entry">
            {entry.thumbPath ? (
              <PhotoThumb submissionId={entry.id} thumbPath={entry.thumbPath} label={`Open entry from ${who?.displayName ?? 'a player'}`} size={64} />
            ) : null}
            <div className="gm-entry__text">
              <p className="gm-entry__who">
                <Avatar name={who?.displayName ?? '?'} src={who?.photoURL} size={22} />
                <strong>{who?.displayName ?? 'A player'}</strong>
                {won ? <span className="tag tag--red">Winner</span> : null}
                {votes !== null ? (
                  <span className="tag tag--ink">
                    {votes} {votes === 1 ? 'vote' : 'votes'}
                  </span>
                ) : null}
              </p>
              {entry.caption ? <p className="gm-entry__caption">&ldquo;{entry.caption}&rdquo;</p> : null}
              {!entry.thumbPath && !entry.caption ? <p className="gm-entry__meta">Entered with no photo or comment</p> : null}
              <p className="gm-entry__meta">{formatAgo(tsMs(entry.createdAt), now)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LiveQuest({ quest, now }: { quest: Doc<GlobalQuest>; now: number }) {
  const { players } = useGame();
  const entries = useEntries(quest.id);
  const [starting, setStarting] = useState(false);

  return (
    <>
      <p className="eyebrow">Entries open · +{quest.bonusPoints} to the winner</p>
      <h3 className="gm-q-title">{quest.title}</h3>
      {quest.description ? <p className="gm-q-desc">{quest.description}</p> : null}
      <p className="gm-q-facts">
        <span className="gm-q-clock" role="timer">
          {formatCountdown(tsMs(quest.endsAt), now)}
        </span>
        <span>
          left · {entries.length} of {players.length} entered
        </span>
      </p>
      {entries.length === 0 ? <p className="gm-hint">Nobody has entered yet.</p> : <EntryList entries={entries} quest={quest} />}
      <Button variant="primary" block onClick={() => setStarting(true)}>
        Start voting now
      </Button>
      {starting ? (
        <ConfirmSheet
          title="Start voting now?"
          confirmLabel="Start voting"
          onClose={() => setStarting(false)}
          onConfirm={async () => {
            await advanceGlobalQuest({ globalQuestId: quest.id });
          }}
        >
          <p>
            Entries for <strong>&ldquo;{quest.title}&rdquo;</strong> close now and everyone votes for their favourite. {entries.length} of{' '}
            {players.length} players have entered.
          </p>
          {entries.length === 0 ? <p className="muted">Nobody has entered, so there is nothing to vote on and it will end with no winner.</p> : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}

function VotingQuest({ quest, now }: { quest: Doc<GlobalQuest>; now: number }) {
  const entries = useEntries(quest.id);
  const [ending, setEnding] = useState(false);
  const endsAt = tsMs(quest.votingEndsAt);

  return (
    <>
      <p className="eyebrow">Voting · +{quest.bonusPoints} to the winner</p>
      <h3 className="gm-q-title">{quest.title}</h3>
      <p className="gm-q-facts">
        <span className="gm-q-clock" role="timer">
          {endsAt ? formatCountdown(endsAt, now) : '--:--'}
        </span>
        <span>left · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
      </p>
      <p className="gm-hint">Votes are secret until voting closes.</p>
      {entries.length === 0 ? <p className="gm-hint">There are no entries to vote on.</p> : <EntryList entries={entries} quest={quest} />}
      <Button variant="primary" block onClick={() => setEnding(true)}>
        End voting now
      </Button>
      {ending ? (
        <ConfirmSheet
          title="End voting now?"
          confirmLabel="Count the votes"
          onClose={() => setEnding(false)}
          onConfirm={async () => {
            await advanceGlobalQuest({ globalQuestId: quest.id });
          }}
        >
          <p>
            The votes for <strong>&ldquo;{quest.title}&rdquo;</strong> are counted now. The entry with the most votes gets{' '}
            <strong>+{quest.bonusPoints}</strong>; a tie pays everyone tied in full, and no votes means no winner.
          </p>
        </ConfirmSheet>
      ) : null}
    </>
  );
}

function PastQuest({ quest }: { quest: Doc<GlobalQuest> }) {
  const { playersById } = useGame();
  const entries = useEntries(quest.id);
  const winnerNames = (quest.winnerUids ?? []).map((uid) => playersById.get(uid)?.displayName ?? 'a player');
  // Most votes first; the tally is published when voting closes.
  const ranked = useMemo(
    () => [...entries].sort((a, b) => (quest.tally?.[b.id] ?? 0) - (quest.tally?.[a.id] ?? 0) || tsMs(a.createdAt) - tsMs(b.createdAt)),
    [entries, quest.tally],
  );

  return (
    <li className="gm-past">
      <p className="gm-person__text">
        <strong>{quest.title}</strong>
        <span className="gm-person__sub">
          {winnerNames.length > 0 ? `Won by ${winnerNames.join(' and ')}` : 'No winner'} · {clockTime(tsMs(quest.startsAt))}
        </span>
      </p>
      {ranked.length > 0 ? <EntryList entries={ranked} quest={quest} showVotes={Boolean(quest.tally)} /> : null}
    </li>
  );
}

function CustomSheet({ hasLive, onClose }: { hasLive: boolean; onClose(): void }) {
  const { settings } = useGame();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [windowMin, setWindowMin] = useState(String(Math.min(180, Math.max(5, settings.globalWindowMin))));
  const [points, setPoints] = useState(String(settings.sideQuestPoints));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = (() => {
    if (!title.trim()) return 'Give it a title.';
    if (title.trim().length > 80) return 'The title can be 80 characters at most.';
    const w = Number(windowMin);
    if (!/^\d+$/.test(windowMin.trim()) || w < 5 || w > 180) return 'The window is 5 to 180 minutes.';
    if (!/^\d+$/.test(points.trim())) return 'Points are a whole number, 0 or more.';
    return null;
  })();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const input: FireGlobalQuestInput = {
      mode: 'custom',
      title: title.trim(),
      description: description.trim(),
      windowMin: Number(windowMin),
      points: Number(points),
    };
    try {
      await fireGlobalQuest(input);
      toast('Side quest fired.', 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title="Write a side quest" subtitle={hasLive ? 'Replaces the one taking entries' : 'Opens for everyone right now'} onClose={onClose} locked={busy}>
      <form className="gm-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="sq-title">
            Title
          </label>
          <input id="sq-title" className="input" value={title} maxLength={80} disabled={busy} placeholder="Best crowd shot" onChange={(e) => setTitle(e.target.value)} />
          <span className="field__hint">{80 - title.length} characters left</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="sq-desc">
            What to do or photograph
          </label>
          <textarea id="sq-desc" className="textarea" value={description} maxLength={500} disabled={busy} placeholder="The more specific, the fewer arguments." onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="gm-grid2">
          <div className="field">
            <label className="field__label" htmlFor="sq-window">
              Open for (minutes)
            </label>
            <input id="sq-window" className="input" inputMode="numeric" value={windowMin} disabled={busy} onChange={(e) => setWindowMin(e.target.value)} />
            <span className="field__hint">5 to 180, then everyone votes</span>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sq-points">
              Winner gets
            </label>
            <input id="sq-points" className="input" inputMode="numeric" value={points} disabled={busy} onChange={(e) => setPoints(e.target.value)} />
            <span className="field__hint">points, tied winners all get it</span>
          </div>
        </div>
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" block busy={busy} icon={<Icon name="megaphone" size={20} />}>
          Fire it
        </Button>
        <Button block variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}
