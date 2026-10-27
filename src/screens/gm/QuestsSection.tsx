import { useMemo, useState, type FormEvent } from 'react';
import { advanceGlobalQuest, checkEntry, fireGlobalQuest, friendlyError, reviewSubmission, type FireGlobalQuestInput } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Icon } from '../../components/Icon';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { sideQuestProblem, type SideQuestDraft } from '../../lib/sideQuestDraft';
import { formatAgo, formatCountdown } from '../../lib/time';
import { t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { entryVotesText, votesText, type Doc, type GlobalQuest, type Submission } from '../../shared';
import { NoteSheet, clockTime, useRunner } from './common';
import { DrawSheet } from './DrawSheet';
import { SideQuestFields } from './SideQuestFields';

/**
 * Entries for one side quest, newest first: approved ones plus the ones still sealed (hidden from players until
 * voting opens, but the GM can read them). A disqualified entry drops out.
 */
function useEntries(questId: string): Doc<Submission>[] {
  const { approved, sealed } = useGame();
  return useMemo(
    () =>
      [...approved, ...sealed]
        .filter((s) => s.kind === 'global' && s.questId === questId)
        .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)),
    [approved, sealed, questId],
  );
}

export function QuestsSection() {
  const { state, settings, globalQuests } = useGame();
  const { busyKey } = useRunner();
  const now = useNow(1000);
  const [writing, setWriting] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const live = globalQuests.filter((g) => g.status === 'live');
  const checking = globalQuests.filter((g) => g.status === 'checking');
  const voting = globalQuests.filter((g) => g.status === 'voting');
  const past = globalQuests.filter((g) => g.status === 'closed').slice(0, 6);
  const active = state.status === 'active';
  const nextAt = tsMs(state.nextGlobalQuestAt);
  const running = live[0] ?? null;

  return (
    <>
      <section className="gm-card gm-hero halftone" aria-label={`Fire a ${t.sideQuest.one}`}>
        <p className="eyebrow">
          {t.sideQuest.Many} ·{' '}
          {live.length > 0 ? 'entries open' : checking.length > 0 ? 'checking entries' : voting.length > 0 ? 'voting' : 'none running'}
        </p>
        {running ? (
          <h2 className="gm-hero__title">{running.title}</h2>
        ) : (
          <p className="gm-hero__none">
            {checking.length > 0
              ? 'Entries are waiting for you to check.'
              : voting.length > 0
              ? 'Voting is on.'
              : active
                ? 'Nothing is open right now.'
                : `The game isn’t running, so ${t.sideQuest.many} are on hold.`}
          </p>
        )}
        <div className="gm-row">
          <Button variant="primary" onRed className="gm-flex1" disabled={!active || busyKey !== null} onClick={() => setDrawing(true)}>
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

      {checking.length > 0 ? (
        <>
          <div className="section-head">
            <h2>Check entries</h2>
            <span className="gm-count gm-count--on">{checking.length} waiting</span>
          </div>
          <ul className="gm-list gm-list--cards">
            {checking.map((quest) => (
              <li key={quest.id} className="gm-card">
                <CheckingQuest quest={quest} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

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
            <span>Recent {t.sideQuest.many} · {past.length}</span>
          </summary>
          <ul className="gm-list">
            {past.map((quest) => (
              <PastQuest key={quest.id} quest={quest} />
            ))}
          </ul>
        </details>
      ) : null}

      {drawing ? (
        <DrawSheet
          liveTitle={running?.title ?? null}
          onClose={() => setDrawing(false)}
          onWrite={() => {
            setDrawing(false);
            setWriting(true);
          }}
        />
      ) : null}
      {writing ? <CustomSheet hasLive={live.length > 0} onClose={() => setWriting(false)} /> : null}
    </>
  );
}


function EntryList({ entries, quest, showVotes = false }: { entries: Doc<Submission>[]; quest: Doc<GlobalQuest>; showVotes?: boolean }) {
  const { playersById, settings, state } = useGame();
  const { user } = useSession();
  const toast = useToast();
  const { busyKey, run } = useRunner();
  const now = useNow(30_000);
  const winners = new Set(quest.winningSubmissionIds ?? []);
  const [disqualifying, setDisqualifying] = useState<Doc<Submission> | null>(null);
  const [rejecting, setRejecting] = useState<Doc<Submission> | null>(null);
  // Disqualifying is for entries still in play; a finished vote is overturned from Review > Recent approvals.
  const canDisqualify = quest.status !== 'closed' && state.status !== 'ended';
  // Accept / reject: once entries close and before the vote.
  const canCheck = quest.status === 'checking' && state.status !== 'ended';
  const dqName = disqualifying ? (playersById.get(disqualifying.uid)?.displayName ?? 'A player') : '';
  const rejectName = rejecting ? (playersById.get(rejecting.uid)?.displayName ?? 'A player') : '';

  const accept = (entry: Doc<Submission>) =>
    void run(`accept:${entry.id}`, async () => {
      await checkEntry({ submissionId: entry.id, accept: true });
      toast('Accepted.', 'success');
    });

  return (
    <>
    <ul className="gm-list">
      {entries.map((entry) => {
        const who = playersById.get(entry.uid);
        const votes = showVotes ? (entryVotesText(quest, entry.id) ?? votesText({ votes: 0 })) : null;
        const won = winners.has(entry.id);
        const late = tsMs(entry.createdAt) >= tsMs(quest.endsAt);
        return (
          <li key={entry.id} className="gm-entry">
            {entry.thumbPath ? (
              <PhotoThumb submissionId={entry.id} thumbPath={entry.thumbPath} label={`Open entry from ${who?.displayName ?? 'a player'}`} size={64} />
            ) : null}
            <div className="gm-entry__text">
              <p className="gm-entry__who">
                <Avatar name={who?.displayName ?? '?'} src={who?.photoURL} size={22} uid={who?.id} />
                <strong>{who?.displayName ?? 'A player'}</strong>
                {won ? <span className="tag tag--red">Winner</span> : null}
                {late ? <span className="tag tag--tint">Late</span> : null}
                {canCheck && entry.checked === 'accepted' ? <span className="tag tag--ink">Accepted</span> : null}
                {canCheck && entry.uid === user?.uid ? <span className="tag tag--tint">Yours</span> : null}
                {!canCheck && entry.status === 'sealed' ? <span className="tag tag--tint">Hidden until voting</span> : null}
                {votes !== null ? (
                  <span className="tag tag--ink">{votes}</span>
                ) : null}
              </p>
              {entry.caption ? <p className="gm-entry__caption">&ldquo;{entry.caption}&rdquo;</p> : null}
              {!entry.thumbPath && !entry.caption ? <p className="gm-entry__meta">Entered with no photo or comment</p> : null}
              <p className="gm-entry__meta">{formatAgo(tsMs(entry.createdAt), now)}</p>
              {canCheck && entry.uid !== user?.uid ? (
                <div className="gm-row gm-entry__pick">
                  {entry.checked !== 'accepted' ? (
                    <Button small variant="primary" busy={busyKey === `accept:${entry.id}`} disabled={busyKey !== null} onClick={() => accept(entry)}>
                      Accept
                    </Button>
                  ) : null}
                  <Button small disabled={busyKey !== null} onClick={() => setRejecting(entry)}>
                    Reject
                  </Button>
                  <Button small variant="ghost" disabled={busyKey !== null} onClick={() => setDisqualifying(entry)}>
                    Disqualify
                  </Button>
                </div>
              ) : canDisqualify && !canCheck ? (
                <Button small className="gm-entry__pick" onClick={() => setDisqualifying(entry)}>
                  Disqualify
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
    {rejecting ? (
      <NoteSheet
        title="Reject this entry?"
        subtitle={`${rejectName} · ${quest.title}`}
        intro={
          <p>
            The entry is thrown out, with <strong>no fine</strong>, and won&apos;t go to the vote. Only {rejectName} is told, with your note.
            For cheating, use Disqualify instead.
          </p>
        }
        noteLabel={`Why (only ${rejectName} sees this)`}
        placeholder="e.g. That’s not a kazoo"
        confirmLabel="Reject entry"
        danger
        onClose={() => setRejecting(null)}
        onConfirm={async (note) => {
          await checkEntry({ submissionId: rejecting.id, accept: false, ...(note ? { note } : {}) });
          toast('Rejected. Only they are told.', 'success');
        }}
      />
    ) : null}
    {disqualifying ? (
      <NoteSheet
        title="Disqualify this entry?"
        subtitle={`${dqName} · ${quest.title}`}
        intro={
          <p>
            The entry is thrown out and {dqName} gets a <strong>−{settings.fraudPenalty}</strong> fine. It can no longer be voted for. A public
            fraud post goes in the feed.
          </p>
        }
        noteLabel="What was wrong (everyone will see this)"
        placeholder="e.g. Not taken during the game"
        required
        confirmLabel={`Disqualify, −${settings.fraudPenalty}`}
        danger
        onClose={() => setDisqualifying(null)}
        onConfirm={async (note) => {
          await reviewSubmission({ submissionId: disqualifying.id, approve: false, note });
          toast('Disqualified. The fine has been applied.', 'success');
        }}
      />
    ) : null}
    </>
  );
}

function LiveQuest({ quest, now }: { quest: Doc<GlobalQuest>; now: number }) {
  // Players who have left don't count: entries close once everyone still playing is in.
  const { activePlayers: players } = useGame();
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
        Close entries now
      </Button>
      {starting ? (
        <ConfirmSheet
          title="Close entries now?"
          confirmLabel="Close entries"
          onClose={() => setStarting(false)}
          onConfirm={async () => {
            await advanceGlobalQuest({ globalQuestId: quest.id });
          }}
        >
          <p>
            Time&apos;s up for <strong>&ldquo;{quest.title}&rdquo;</strong> now. You accept or reject each entry, and late entries still count
            until you start the vote. {entries.length} of {players.length} players have entered.
          </p>
        </ConfirmSheet>
      ) : null}
    </>
  );
}

function CheckingQuest({ quest }: { quest: Doc<GlobalQuest> }) {
  const { user } = useSession();
  const { activePlayers: players } = useGame();
  const entries = useEntries(quest.id);
  const [starting, setStarting] = useState(false);
  // Your own entry is not yours to check; it goes to the vote as it is.
  const toCheck = entries.filter((e) => e.uid !== user?.uid);
  const unchecked = toCheck.filter((e) => e.checked !== 'accepted').length;

  return (
    <>
      <p className="eyebrow">Checking · +{quest.bonusPoints} to the winner</p>
      <h3 className="gm-q-title">{quest.title}</h3>
      {quest.description ? <p className="gm-q-desc">{quest.description}</p> : null}
      <p className="gm-q-facts">
        <span>
          {toCheck.length - unchecked} of {toCheck.length} checked · {entries.length} of {players.length} entered
        </span>
      </p>
      <p className="gm-hint">
        Accept or reject each entry. Late entries can still come in. Voting only starts when you press Start voting (unchecked entries go in as
        they are).
      </p>
      {entries.length === 0 ? <p className="gm-hint">No entries yet.</p> : <EntryList entries={entries} quest={quest} />}
      <Button variant="primary" block onClick={() => setStarting(true)}>
        Start voting
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
            Everyone votes on <strong>&ldquo;{quest.title}&rdquo;</strong> now, and no more entries come in.
            {unchecked > 0 ? ` The ${unchecked} unchecked ${unchecked === 1 ? 'entry goes' : 'entries go'} in as ${unchecked === 1 ? 'it is' : 'they are'}.` : ''}
          </p>
          {entries.length === 0 ? <p className="muted">No entries are left, so it will end with no winner.</p> : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}

function VotingQuest({ quest, now }: { quest: Doc<GlobalQuest>; now: number }) {
  const { settings } = useGame();
  const entries = useEntries(quest.id);
  const [ending, setEnding] = useState(false);
  const endsAt = tsMs(quest.votingEndsAt);
  const yesNo = (quest.voteStyle ?? settings.voteStyle) === 'yesno';

  return (
    <>
      <p className="eyebrow">Voting{yesNo ? ' · yes or no' : ''} · +{quest.bonusPoints} to the winner</p>
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
            The votes for <strong>&ldquo;{quest.title}&rdquo;</strong> are counted now. The entry with the {yesNo ? 'most yeses (less the noes)' : 'most votes'} gets{' '}
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

export function CustomSheet({ hasLive, onClose }: { hasLive: boolean; onClose(): void }) {
  const { settings } = useGame();
  const toast = useToast();

  const [draft, setDraft] = useState<SideQuestDraft>({
    title: '',
    description: '',
    windowMin: String(Math.min(180, Math.max(5, settings.globalWindowMin))),
    points: String(settings.sideQuestPoints),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = sideQuestProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const input: FireGlobalQuestInput = {
      mode: 'custom',
      title: draft.title.trim(),
      description: draft.description.trim(),
      windowMin: Number(draft.windowMin),
      points: Number(draft.points),
    };
    try {
      await fireGlobalQuest(input);
      toast(`${t.sideQuest.One} fired.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={`Write a ${t.sideQuest.one}`} subtitle={hasLive ? 'Replaces the one taking entries' : 'Opens for everyone right now'} onClose={onClose} locked={busy}>
      <form className="gm-form" onSubmit={(event) => void submit(event)} noValidate>
        <SideQuestFields draft={draft} onChange={setDraft} busy={busy} />
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
