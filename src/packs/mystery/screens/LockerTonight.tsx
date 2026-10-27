// The locker's first tab, Tonight: the case strip (open, pause, close), then "Needs you", the jobs strung on the twine
// most urgent first, each with its buttons (the phone lines, the door, statements, entries to check, the next story
// mission), the confirmed statements to overrule if staged, the group mission running now and the bulletin.
import { useMemo, useState } from 'react';
import { endGame, fireGlobalQuest, reviewJoinRequest, reviewSubmission, setGameStatus, setStartTime } from '../../../api';
import { Button } from '../../../components/Button';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow } from '../../../data/hooks';
import { dayDate } from '../../../lib/time';
import { switchboardLabel, testProgress } from '../../../lib/policeLine';
import { features, t, zone } from '../../../pack';
import { Announcement } from '../../../screens/gm/GameSection';
import { useGmData } from '../../../screens/gm/GmData';
import { STORY, useStory } from '../../../screens/gm/StorySection';
import { NoteSheet, clockTime, useClaim, useRunner } from '../../../screens/gm/common';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, GlobalQuest, JoinRequest, Submission } from '../../../shared';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor } from './CaseKit';
import { JobTag, LinesButtons, MissionHead, at, missionTab, useEntries, useLongRunMissions, useRunningMission, useStreakLine, type Lines, type LockerNav } from './LockerParts';
import { askBeforeMove, deskCounts, nudge, runningFor, tonightJobs, untilLabel, waited, type JobKind } from './lockerLib';
import { MoveStartSheet, StartTimeSheet, zonePlace } from './StartTimeSheet';

export type Job = { kind: JobKind; id: string };

/** Tonight's jobs, most urgent first (see tonightJobs); the folder tab counts them. */
export function useTonightJobs(lines: Lines): Job[] {
  const { state, globalQuests } = useGame();
  const { pendingJoins, pendingSubs } = useGmData();
  const { nextId } = useStory();
  return useMemo(
    () =>
      tonightJobs({
        linesDown: lines.alarm,
        joins: pendingJoins.map((j) => ({ id: j.id, at: tsMs(j.createdAt) })),
        // Once the case is closed a statement can't be ruled on, so it is no longer a job.
        statements: state.status === 'ended' ? [] : pendingSubs.map((s) => ({ id: s.id, at: tsMs(s.createdAt) })),
        checking: features.sideQuests ? (globalQuests.find((g) => g.status === 'checking' && !g.longRun)?.id ?? null) : null,
        story: {
          nextId: features.sideQuests ? nextId : null,
          caseOpen: state.status === 'active',
          taking: globalQuests.some((g) => g.status === 'live' && !g.longRun),
        },
      }),
    [lines.alarm, pendingJoins, pendingSubs, globalQuests, nextId, state.status],
  );
}

/** First names on the tags, as people say them. */
const firstName = (name: string) => name.split(' ')[0]!;

export function Tonight({ jobs, lines, nav }: { jobs: Job[]; lines: Lines; nav: LockerNav }) {
  const { globalQuests } = useGame();
  const { pendingJoins, pendingSubs, loading, error } = useGmData();
  const { user } = useSession();
  const now = useNow(30_000);
  const joins = new Map(pendingJoins.map((j) => [j.id, j]));
  const subs = new Map(pendingSubs.map((s) => [s.id, s]));
  const mission = useRunningMission();
  const longRuns = useLongRunMissions();

  return (
    <>
      <CaseStrip />

      <div className="gl-wl">
        <h2 className="gl-wl__h">
          Needs you{jobs.length > 0 ? <> <em className="gl-count">{jobs.length}</em></> : null}
        </h2>
        {jobs.length > 1 ? <span className="gl-wl__sub">most urgent first</span> : null}
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t open the locker.
        </p>
      ) : loading ? (
        <p className="gl-quiet">
          <Loader inline size={20} label="Opening the locker" caption="Opening the locker…" />
        </p>
      ) : jobs.length === 0 ? (
        <p className="gl-clear">Nothing needs you right now. New requests, statements and alarms land here.</p>
      ) : (
        <Strung className="gl-jobs" label="Needs you">
          {jobs.map((job) => {
            if (job.kind === 'lines') return <LinesTag key="lines" lines={lines} nav={nav} />;
            if (job.kind === 'door') {
              const req = joins.get(job.id);
              return req ? <DoorTag key={job.id} req={req} /> : null;
            }
            if (job.kind === 'statement') {
              const sub = subs.get(job.id);
              return sub ? <StatementTag key={job.id} sub={sub} mine={sub.uid === user?.uid} now={now} /> : null;
            }
            if (job.kind === 'entries') {
              const quest = globalQuests.find((g) => g.id === job.id);
              return quest ? <EntriesTag key={job.id} quest={quest} nav={nav} /> : null;
            }
            return <StoryTag key={job.id} storyId={job.id} />;
          })}
        </Strung>
      )}

      <Confirmed />

      {features.sideQuests && mission ? <MissionSummary quest={mission} /> : null}
      {features.sideQuests ? longRuns.map((q) => <MissionSummary key={q.id} quest={q} />) : null}
      <Folder tab="Bulletin" label="Bulletin" className="gl-folder gl-engine">
        <Announcement />
      </Folder>
    </>
  );
}

/* ---------- the case strip: open, pause, close ---------- */

const STATUS_LABEL = { lobby: 'Case not open', active: 'Case open', paused: 'Case paused', ended: 'Case closed' } as const;

/** The case's state on a manila strip, with pause or resume and close beside it (reset is in Setup). While the case is
 * not open it also holds the start time: set it, nudge it, clear it, or open now. */
function CaseStrip() {
  const { state, globalQuests, players } = useGame();
  const { pendingSubs } = useGmData();
  const { busyKey, run } = useRunner();
  const toast = useToast();
  const now = useNow(60_000);
  const [closing, setClosing] = useState(false);
  const [sheet, setSheet] = useState<'set' | 'open' | null>(null);
  const [moving, setMoving] = useState<number | null | undefined>(undefined);
  const status = state.status;
  const started = tsMs(state.startedAt);
  const ended = tsMs(state.endedAt);
  const opensAt = state.opensAt ? tsMs(state.opensAt) : 0;
  const live = globalQuests.find((g) => g.status === 'live' && !g.longRun);
  const voting = globalQuests.filter((g) => g.status === 'voting');
  const checking = globalQuests.filter((g) => g.status === 'checking' && !g.longRun);
  const setStatus = (next: 'active' | 'paused', ok: string) => void run(`status:${next}`, () => setGameStatus({ status: next }), ok);
  const timed = status === 'lobby' && opensAt > 0;
  // A move or a clear asks first once suspects have booked in (they have seen the time); before that it just happens.
  const change = (to: number | null) => {
    if (askBeforeMove(players)) return setMoving(to);
    void run('start', () => setStartTime({ at: to, tell: false }), to === null ? 'Start time cleared.' : `Start moved to ${clockTime(to)}.`);
  };
  const desk = deskCounts(players);

  return (
    <section className={`gl-cs${timed ? ' gl-cs--timed' : ''}`} aria-label="The case">
      <div className="gl-cs__t">
        <b>{STATUS_LABEL[status]}</b>
        <i>
          {status === 'ended' && ended
            ? `Closed ${clockTime(ended)}`
            : timed
              ? 'Opens itself at zero'
              : status === 'lobby'
                ? 'Opens when you say'
                : started
                  ? opensAt > 0
                    ? `Since ${clockTime(started)} · opened itself`
                    : `Since ${clockTime(started)} · running ${runningFor((ended || now) - started)}`
                  : 'Not started yet'}
        </i>
      </div>
      {status === 'active' ? (
        <Button className="gl-btn gl-btn--sm" busy={busyKey === 'status:paused'} disabled={busyKey !== null} onClick={() => setStatus('paused', 'Case paused.')}>
          Pause
        </Button>
      ) : status === 'paused' ? (
        <Button className="gl-btn gl-btn--sm" busy={busyKey === 'status:active'} disabled={busyKey !== null} onClick={() => setStatus('active', 'Back on.')}>
          Resume
        </Button>
      ) : status === 'lobby' && !timed ? (
        <Button className="gl-btn gl-btn--sm gl-btn--teal" busy={busyKey === 'status:active'} disabled={busyKey !== null} onClick={() => setStatus('active', 'The case is open.')}>
          Open case
        </Button>
      ) : null}
      {status === 'active' || status === 'paused' ? (
        <Button className="gl-btn gl-btn--sm gl-btn--warn" onClick={() => setClosing(true)}>
          Close
        </Button>
      ) : null}
      {status === 'lobby' && !timed ? (
        <button type="button" className="gl-cs__set" onClick={() => setSheet('set')}>
          <Icon name="clock" size={20} />
          <span>
            <b>Set a start time</b>
            <i>Suspects get a countdown, and at zero the case opens itself.</i>
          </span>
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </button>
      ) : null}
      {timed ? (
        <>
          <div className="gl-cs__when">
            <button type="button" className="gl-cs__time" aria-label={`Start time ${clockTime(opensAt)}, change it`} onClick={() => setSheet('set')}>
              {clockTime(opensAt)}
              <Icon name="edit" size={16} strokeWidth={2.4} />
            </button>
            <span className="gl-cs__in">
              <small>{opensAt > now ? 'in' : ''}</small>
              {untilLabel(opensAt - now)}
            </span>
          </div>
          <p className="gl-cs__day">
            {dayDate(opensAt, zone)} · {zonePlace}
          </p>
          <div className="gl-cs__btns">
            <Button className="gl-btn gl-btn--sm" disabled={busyKey !== null} onClick={() => change(nudge(opensAt, 15))}>
              +15
            </Button>
            <Button className="gl-btn gl-btn--sm" disabled={busyKey !== null} onClick={() => change(nudge(opensAt, 30))}>
              +30
            </Button>
            <Button className="gl-btn gl-btn--sm gl-btn--teal" busy={busyKey === 'status:active'} disabled={busyKey !== null} onClick={() => setSheet('open')}>
              Open now
            </Button>
          </div>
          <p className="gl-cs__foot">
            <span>
              {desk.booked} booked · {desk.atDesk} at the desk
            </span>
            <button type="button" className="gl-cs__clear" disabled={busyKey !== null} onClick={() => change(null)}>
              Clear
            </button>
          </p>
        </>
      ) : null}
      {sheet === 'set' ? <StartTimeSheet opensAtMs={opensAt || null} players={players} onClose={() => setSheet(null)} /> : null}
      {moving !== undefined && opensAt > 0 ? <MoveStartSheet fromMs={opensAt} toMs={moving === null ? null : moving} onClose={() => setMoving(undefined)} /> : null}
      {sheet === 'open' ? (
        <ConfirmSheet
          title="Open the case now?"
          confirmLabel="Open the case"
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await setGameStatus({ status: 'active' });
            toast('The case is open.', 'success');
          }}
        >
          <p>The countdown stops and the missions open for everyone, ahead of {clockTime(opensAt)}.</p>
        </ConfirmSheet>
      ) : null}
      {closing ? (
        <ConfirmSheet
          title="Close the case?"
          confirmLabel="Close the case for everyone"
          danger
          onClose={() => setClosing(false)}
          onConfirm={async () => {
            await endGame();
          }}
        >
          <p>Scores freeze, the final standings are written and everyone gets their wrap. This can&apos;t be undone.</p>
          {pendingSubs.length > 0 ? (
            <p className="note note--error">
              <strong>
                {pendingSubs.length} {pendingSubs.length === 1 ? `${t.claim.one} is` : `${t.claim.many} are`} still waiting.
              </strong>{' '}
              Rule on {pendingSubs.length === 1 ? 'it' : 'them'} first, or {pendingSubs.length === 1 ? 'it' : 'they'} will never score.
            </p>
          ) : null}
          {voting.length > 0 ? (
            <p className="note">
              <strong>{voting.map((g) => g.title).join(', ')}</strong> is still being voted on. The votes so far are counted and the winners paid now.
            </p>
          ) : null}
          {checking.length > 0 ? (
            <p className="note">
              <strong>{checking.map((g) => g.title).join(', ')}</strong> has entries waiting to be checked. It closes without a winner.
            </p>
          ) : null}
          {live ? (
            <p className="note">
              <strong>&ldquo;{live.title}&rdquo; is still taking entries.</strong> It closes without a winner.
            </p>
          ) : null}
        </ConfirmSheet>
      ) : null}
    </section>
  );
}

/* ---------- the jobs ---------- */

/** The phone lines went down: what tripped them, and the buttons to bring them back. */
function LinesTag({ lines, nav }: { lines: Lines; nav: LockerNav }) {
  const streak = useStreakLine(lines.sb);
  const since = tsMs(lines.sb?.since);
  const progress = testProgress(lines.mine?.test);
  return (
    <JobTag
      id="lines"
      kind="Switchboard"
      right={at(since)}
      hot
      actions={<LinesButtons lines={lines} onAddNumber={() => nav.open('police')} />}
    >
      <div className="gl-job__line">
        <p className="gl-job__t">{lines.sb ? switchboardLabel(lines.sb) : 'Lines down'}</p>
        {lines.sb && lines.sb.streak > 0 ? <Stamp tone="bad">{lines.sb.streak} in a row</Stamp> : null}
      </div>
      <p className="gl-job__s">
        {progress ??
          (lines.sb?.mode === 'probation'
            ? 'The next check-in goes by phone as a trial; the lines come back if it connects.'
            : `${streak ?? lines.sb?.lastError?.message ?? 'Calls aren’t getting through.'} Everyone answers in the app for now.`)}
      </p>
    </JobTag>
  );
}

/** Someone at the door: let them in, or turn them away. */
function DoorTag({ req }: { req: Doc<JoinRequest> }) {
  const { busyKey, run } = useRunner();
  const review = (approve: boolean) =>
    void run(
      `${approve ? 'yes' : 'no'}:${req.id}`,
      () => reviewJoinRequest({ uid: req.id, approve }),
      approve ? `${req.displayName} is in.` : `${req.displayName} turned away.`,
    );
  return (
    <JobTag
      id={req.id}
      kind="At the door"
      right={at(tsMs(req.createdAt))}
      row
      actions={
        <div className="gl-job__btns">
          <Button className="gl-btn gl-btn--teal gl-btn--sm" busy={busyKey === `yes:${req.id}`} disabled={busyKey !== null} onClick={() => review(true)}>
            Let in
          </Button>
          <Button
            className="gl-btn gl-btn--sm gl-btn--ic"
            aria-label={`Turn ${req.displayName} away`}
            busy={busyKey === `no:${req.id}`}
            disabled={busyKey !== null}
            onClick={() => review(false)}
          >
            <Icon name="close" size={16} strokeWidth={2.6} />
          </Button>
        </div>
      }
    >
      <p className="gl-job__t">{req.displayName}</p>
    </JobTag>
  );
}

/** A statement whose witness hasn't answered: the GM can rule on it instead (never on their own). */
function StatementTag({ sub, mine, now }: { sub: Doc<Submission>; mine: boolean; now: number }) {
  const { playersById, settings, state } = useGame();
  const { busyKey, run } = useRunner();
  const claim = useClaim(sub, true);
  const [rejecting, setRejecting] = useState(false);
  const who = firstName(playersById.get(sub.uid)?.displayName ?? 'A player');
  const witness = sub.witnessUid ? playersById.get(sub.witnessUid)?.displayName : undefined;
  const locked = mine || state.status === 'ended' || busyKey !== null;
  const created = tsMs(sub.createdAt);
  return (
    <JobTag
      id={sub.id}
      kind="Statement"
      right={at(created)}
      actions={
        <div className="gl-pair">
          <Button
            className="gl-btn gl-btn--teal"
            busy={busyKey === `approve:${sub.id}`}
            disabled={locked}
            onClick={() => void run(`approve:${sub.id}`, () => reviewSubmission({ submissionId: sub.id, approve: true }), `Confirmed. +${settings.questPoints}.`)}
          >
            Confirm
          </Button>
          <Button className="gl-btn gl-btn--warn" disabled={locked} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      }
    >
      <p className="gl-job__t">
        {mine ? 'You' : who} did &ldquo;{claim.title}&rdquo;
      </p>
      <p className="gl-job__s">
        {mine
          ? `Your own: only ${witness ? firstName(witness) : `your ${t.witness.one}`} can confirm it.`
          : `${witness ? `Witness ${firstName(witness)}` : `No ${t.witness.one} named`} hasn’t answered${created ? ` · ${waited(now - created)}` : ''}`}
      </p>
      {rejecting ? (
        <NoteSheet
          title="Reject this statement?"
          subtitle={`They lose ${settings.rejectPenalty} points and the ${t.quest.one} is swapped for a fresh one.`}
          noteLabel="Why (they will see this)"
          placeholder={`Not what the ${t.quest.one} asked for? Tell them.`}
          confirmLabel={`Reject, −${settings.rejectPenalty}`}
          danger
          onClose={() => setRejecting(false)}
          onConfirm={async (note) => {
            await reviewSubmission({ submissionId: sub.id, approve: false, note: note || undefined });
          }}
        />
      ) : null}
    </JobTag>
  );
}

/** A group mission's entries wait for the GM's check; checking them happens on the Missions tab. */
function EntriesTag({ quest, nav }: { quest: Doc<GlobalQuest>; nav: LockerNav }) {
  const { toCheck } = useEntries(quest);
  return (
    <JobTag
      id={quest.id}
      kind="Entries to check"
      row
      actions={
        <Button className="gl-btn gl-btn--ink gl-btn--sm" onClick={() => nav.tab('missions')}>
          Check
        </Button>
      }
    >
      <p className="gl-job__t">{quest.title}</p>
      <p className="gl-job__s">
        {toCheck === 0 ? `All checked: open the vote` : `${toCheck} ${toCheck === 1 ? 'bag' : 'bags'} to check, then the vote`}
      </p>
    </JobTag>
  );
}

/** The next story mission, ready to fire as it stands (Missions has the sheet to change it first). */
function StoryTag({ storyId }: { storyId: string }) {
  const { state } = useGame();
  const { busyKey, run } = useRunner();
  const index = STORY.findIndex((s) => s.id === storyId);
  const story = STORY[index];
  if (!story) return null;
  return (
    <JobTag
      id={storyId}
      kind="Story · up next"
      right={`No. ${index + 1} of ${STORY.length}`}
      row
      actions={
        <Button
          className="gl-btn gl-btn--ink gl-btn--sm"
          aria-label={`${story.kind === 'announce' ? 'Post' : 'Fire'} ${story.title}`}
          busy={busyKey === 'fire'}
          disabled={state.status !== 'active' || busyKey !== null}
          onClick={() => void run('fire', () => fireGlobalQuest({ mode: 'story', storyId }), `${story.title} sent out.`)}
        >
          {story.kind === 'announce' ? 'Post' : 'Fire'}
        </Button>
      }
    >
      <p className="gl-job__t">{story.title}</p>
    </JobTag>
  );
}

/* ---------- confirmed statements: overrule if staged ---------- */

/** Confirmed tags listed when opened. */
const CONFIRMED_SHOWN = 10;

/** The statements already confirmed, newest first, folded away under one line: the GM can overrule one as fraud. */
function Confirmed() {
  const { approved } = useGame();
  const [open, setOpen] = useState(false);
  const confirmed = useMemo(
    () => approved.filter((s) => s.kind === 'personal').sort((a, b) => tsMs(b.reviewedAt ?? b.createdAt) - tsMs(a.reviewedAt ?? a.createdAt)),
    [approved],
  );
  if (confirmed.length === 0) return null;
  return (
    <>
      <button type="button" className="gl-more" aria-expanded={open} aria-controls="gl-confirmed" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the confirmed' : `${confirmed.length} confirmed · overrule if staged`}
        <Icon name="chevronDown" size={16} strokeWidth={2.4} className="gl-more__chev" />
      </button>
      {open ? (
        <div id="gl-confirmed">
          <Strung className="gl-jobs" label="Confirmed statements">
            {confirmed.slice(0, CONFIRMED_SHOWN).map((sub) => (
              <ConfirmedTag key={sub.id} sub={sub} />
            ))}
          </Strung>
          {confirmed.length > CONFIRMED_SHOWN ? <p className="gl-quiet">The latest {CONFIRMED_SHOWN} of {confirmed.length}.</p> : null}
        </div>
      ) : null}
    </>
  );
}

function ConfirmedTag({ sub }: { sub: Doc<Submission> }) {
  const { playersById, settings, state } = useGame();
  const toast = useToast();
  const claim = useClaim(sub, false);
  const [fraud, setFraud] = useState(false);
  const who = playersById.get(sub.uid)?.displayName ?? 'A player';
  const witness = sub.witnessUid ? playersById.get(sub.witnessUid)?.displayName : undefined;
  const award = sub.pointsAwarded ?? 0;
  return (
    <Tag tilt={tiltFor(sub.id)} className="gl-job">
      <TagTop left="Confirmed" right={at(tsMs(sub.reviewedAt ?? sub.createdAt))} />
      <p className="gl-job__t">
        {firstName(who)} did &ldquo;{claim.title}&rdquo;
      </p>
      <p className="gl-job__s">{witness ? `${firstName(witness)} saw it` : 'Confirmed'}</p>
      <div className="gl-actions gl-actions--end">
        {award ? <span className="gl-pts">{award > 0 ? `+${award}` : award}</span> : null}
        <span className="gl-grow" />
        <Button className="gl-btn gl-btn--warn" disabled={state.status === 'ended'} onClick={() => setFraud(true)}>
          Overrule as fraud
        </Button>
      </div>
      {fraud ? (
        <NoteSheet
          title="Overrule as fraud?"
          subtitle={`${who} · ${claim.title}`}
          intro={
            <p>
              The <strong>+{award}</strong> comes back off their score and they get a <strong>−{settings.fraudPenalty}</strong> fine. The{' '}
              {t.quest.one} is swapped for a fresh one, and a public fraud post goes in the feed.
            </p>
          }
          noteLabel="What was wrong (everyone will see this)"
          placeholder="e.g. Photo of a photo from the internet"
          confirmLabel={`Overrule, −${award + settings.fraudPenalty} in total`}
          danger
          onClose={() => setFraud(false)}
          onConfirm={async (note) => {
            await reviewSubmission({ submissionId: sub.id, approve: false, note: note || undefined });
            toast('Overruled. Points taken back and the fine applied.', 'success');
          }}
        />
      ) : null}
    </Tag>
  );
}

/* ---------- the group mission, at a glance ---------- */

/** The group mission running now, at a glance (its buttons are on Missions). */
function MissionSummary({ quest }: { quest: Doc<GlobalQuest> }) {
  const now = useNow(1000);
  const { entries, toCheck } = useEntries(quest);
  return (
    <Folder tab={missionTab(quest)} label={t.sideQuest.One} className="gl-folder gl-mc">
      <MissionHead quest={quest} now={now} entries={entries} toCheck={toCheck} />
    </Folder>
  );
}
