// The locker's Missions tab: the group mission running now (its evidence bags to check, its next step and firing a
// new one), the story in order with Fire on the one up next and the random-drop switch, and the periodic missions
// with Send now. The story's random pool and the periodic missions' full forms open from here.
import { useMemo, useState } from 'react';
import { backend } from '../../../backend';
import { advanceGlobalQuest, checkEntry, fireGlobalQuest } from '../../../api';
import { BottomSheet } from '../../../components/BottomSheet';
import { Button } from '../../../components/Button';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Loader } from '../../../components/Loader';
import { usePhotoViewer } from '../../../components/PhotoViewer';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useStorageUrl } from '../../../data/hooks';
import { formatCountdown } from '../../../lib/time';
import { features, t } from '../../../pack';
import { DrawSheet } from '../../../screens/gm/DrawSheet';
import { FireSheet as PeriodicFireSheet, runningCount, usePeriodics } from '../../../screens/gm/PeriodicsSection';
import { CustomSheet } from '../../../screens/gm/QuestsSection';
import { STORY, StoryFireSheet, useStory } from '../../../screens/gm/StorySection';
import { NoteSheet, clockTime, useRunner } from '../../../screens/gm/common';
import { useOpenCheckins } from '../../../screens/home/CheckinCard';
import { useSession } from '../../../session/SessionProvider';
import { periodicDone, type Doc, type GlobalQuest, type Periodic, type Submission } from '../../../shared';
import type { StoryQuest } from '../../../../functions/src/shared/packs/types.ts';
import { Folder, Stamp } from './CaseKit';
import { MissionHead, missionTab, runningStatus, useEntries, useLongRunMissions, useRunningMission, type LockerNav } from './LockerParts';

export function Missions({ nav }: { nav: LockerNav }) {
  return (
    <>
      {features.sideQuests ? <MissionCard /> : null}
      {features.sideQuests && STORY.length > 0 ? <StoryFolder nav={nav} /> : null}
      {features.checkins ? <PeriodicsFolder nav={nav} /> : null}
    </>
  );
}

/* ---------- the group mission ---------- */

function MissionCard() {
  const { state } = useGame();
  const { busyKey } = useRunner();
  const now = useNow(1000);
  const [firing, setFiring] = useState(false);
  const quest = useRunningMission();
  const longRuns = useLongRunMissions();
  // A long-running mission has its own folder below, so the one-at-a-time mission above is never hidden by it.
  const rest = longRuns.map((q) => <RunningMission key={q.id} quest={q} now={now} alongside />);
  if (!quest) {
    const active = state.status === 'active';
    return (
      <>
        <Folder tab={`${t.sideQuest.One} · none running`} label={t.sideQuest.One} className="gl-folder gl-mc">
          <p className="gl-card__desc">{active ? 'Nothing is open right now.' : `The case isn't running, so ${t.sideQuest.many} are on hold.`}</p>
          <Button className="gl-btn gl-btn--teal gl-btn--wide" disabled={!active || busyKey !== null} onClick={() => setFiring(true)}>
            Fire a {t.sideQuest.one}
          </Button>
          {firing ? <FireSheets live={null} onClose={() => setFiring(false)} /> : null}
        </Folder>
        {rest}
      </>
    );
  }
  return (
    <>
      <RunningMission quest={quest} now={now} />
      {rest}
    </>
  );
}

/** `alongside`: a long-running mission beside the one taking the night's attention; it has no "fire a new one". */
function RunningMission({ quest, now, alongside = false }: { quest: Doc<GlobalQuest>; now: number; alongside?: boolean }) {
  const { activePlayers, state, settings } = useGame();
  const { user } = useSession();
  const { entries, toCheck } = useEntries(quest);
  const [confirming, setConfirming] = useState(false);
  const [firing, setFiring] = useState(false);
  const status = runningStatus(quest);
  const ended = state.status === 'ended';

  const label = status === 'live' ? 'Close entries' : status === 'checking' ? `Open the vote · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : 'End the vote';

  return (
    <Folder tab={missionTab(quest)} label={t.sideQuest.One} className="gl-folder gl-mc">
      <MissionHead quest={quest} now={now} entries={entries} toCheck={toCheck} />
      {status === 'checking' && quest.longRun ? (
        <p className="gl-card__desc">Entries are closed. Open the vote when you are ready; the reveal in the story opens it too.</p>
      ) : status === 'checking' ? (
        <p className="gl-card__desc">Check each bag, then open the vote. Late entries still come in until you do.</p>
      ) : quest.description ? (
        <p className="gl-card__desc">{quest.description}</p>
      ) : null}
      {entries.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">{status === 'voting' ? 'There are no entries to vote on.' : status === 'live' ? 'Nobody has entered yet.' : 'No entries yet.'}</p>
      ) : (
        <div className="gl-bags">
          {entries.map((entry, i) => (
            <Bag key={entry.id} entry={entry} number={i + 1} quest={quest} canCheck={status === 'checking' && !quest.longRun && !ended} mine={entry.uid === user?.uid} />
          ))}
        </div>
      )}
      <div className="gl-card__btns">
        <Button className="gl-btn gl-btn--ink" disabled={ended} onClick={() => setConfirming(true)}>
          {label}
        </Button>
        {alongside ? null : (
          <Button className="gl-btn" disabled={state.status !== 'active'} onClick={() => setFiring(true)}>
            Fire a new one
          </Button>
        )}
      </div>
      {firing ? <FireSheets live={status === 'live' && !quest.longRun ? quest : null} onClose={() => setFiring(false)} /> : null}
      {confirming ? (
        <ConfirmSheet
          title={status === 'live' ? 'Close entries now?' : status === 'checking' ? 'Open the vote now?' : 'End the vote now?'}
          confirmLabel={status === 'live' ? 'Close entries' : status === 'checking' ? 'Open the vote' : 'Count the votes'}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await advanceGlobalQuest({ globalQuestId: quest.id });
          }}
        >
          {status === 'live' ? (
            <p>
              Time&apos;s up for <strong>&ldquo;{quest.title}&rdquo;</strong> now. You check each entry, and late ones still count until you
              open the vote. {entries.length} of {activePlayers.length} have entered.
            </p>
          ) : status === 'checking' ? (
            <>
              <p>
                Everyone votes on <strong>&ldquo;{quest.title}&rdquo;</strong> now, and no more entries come in.
                {toCheck > 0 ? ` The ${toCheck} unchecked ${toCheck === 1 ? 'entry goes' : 'entries go'} in as ${toCheck === 1 ? 'it is' : 'they are'}.` : ''}
              </p>
              {entries.length === 0 ? <p className="muted">No entries are left, so it will end with no winner.</p> : null}
            </>
          ) : (
            <p>
              The votes for <strong>&ldquo;{quest.title}&rdquo;</strong> are counted now. The entry with the{' '}
              {(quest.voteStyle ?? settings.voteStyle) === 'yesno' ? 'most yeses (less the noes)' : 'most votes'} gets <strong>+{quest.bonusPoints}</strong>; a tie pays everyone tied in full, and no votes means no winner.
            </p>
          )}
        </ConfirmSheet>
      ) : null}
    </Folder>
  );
}

function Bag({ entry, number, quest, canCheck, mine }: { entry: Doc<Submission>; number: number; quest: Doc<GlobalQuest>; canCheck: boolean; mine: boolean }) {
  const { playersById } = useGame();
  const { busyKey, run } = useRunner();
  const open = usePhotoViewer();
  const toast = useToast();
  const url = useStorageUrl(entry.thumbPath);
  const [rejecting, setRejecting] = useState(false);
  const who = playersById.get(entry.uid)?.displayName ?? 'A player';
  const first = who.split(' ')[0]!;
  const late = tsMs(entry.createdAt) >= tsMs(quest.endsAt);
  const accepted = entry.checked === 'accepted';
  const body = (
    <>
      <span className="gl-bag__zip" aria-hidden="true" />
      {url ? <img src={url} alt="" loading="lazy" /> : null}
      <span className="gl-bag__label">
        BAG {number} · {first}
      </span>
      {late ? <span className="gl-bag__late">LATE</span> : null}
    </>
  );
  return (
    <div className="gl-bagcell">
      {entry.thumbPath ? (
        <button type="button" className="gl-bag" aria-label={`Open the photo from ${who}`} onClick={() => open(entry.id)}>
          {body}
        </button>
      ) : (
        <div className="gl-bag" role="img" aria-label={`Bag ${number}, ${who}, no photo`}>
          {body}
        </div>
      )}
      {entry.caption ? <p className="gl-bag__caption">&ldquo;{entry.caption}&rdquo;</p> : null}
      {canCheck && !mine ? (
        <div className="gl-bag__pick">
          {accepted ? (
            <span className="gl-stamp gl-stamp--ok">ACCEPTED</span>
          ) : (
            <Button
              className="gl-btn gl-btn--teal"
              aria-label={`Accept ${first}'s entry`}
              busy={busyKey === `accept:${entry.id}`}
              disabled={busyKey !== null}
              onClick={() =>
                void run(`accept:${entry.id}`, async () => {
                  await checkEntry({ submissionId: entry.id, accept: true });
                  toast('Accepted.', 'success');
                })
              }
            >
              IN
            </Button>
          )}
          <Button className="gl-btn gl-btn--warn" aria-label={`Throw out ${first}'s entry`} disabled={busyKey !== null} onClick={() => setRejecting(true)}>
            OUT
          </Button>
        </div>
      ) : mine ? (
        <span className="gl-stamp">YOURS</span>
      ) : accepted ? (
        <span className="gl-stamp gl-stamp--ok">ACCEPTED</span>
      ) : null}
      {rejecting ? (
        <NoteSheet
          title="Throw this entry out?"
          subtitle={`${who} · ${quest.title}`}
          intro={
            <p>
              The entry is thrown out, with <strong>no fine</strong>, and won&apos;t go to the vote. Only {who} is told, with your note.
            </p>
          }
          noteLabel={`Why (only ${who} sees this)`}
          placeholder="e.g. That's not a kazoo"
          confirmLabel="Throw it out"
          danger
          onClose={() => setRejecting(false)}
          onConfirm={async (note) => {
            await checkEntry({ submissionId: entry.id, accept: false, ...(note ? { note } : {}) });
            toast('Thrown out. Only they are told.', 'success');
          }}
        />
      ) : null}
    </div>
  );
}

/** Fire one: the next story mission, a random draw (seen first, see DrawSheet) or your own words. */
function FireSheets({ live, onClose }: { live: Doc<GlobalQuest> | null; onClose(): void }) {
  const [step, setStep] = useState<'choose' | 'draw' | 'write' | 'story'>('choose');
  const { nextId } = useStory();
  const nextStory = STORY.find((s) => s.id === nextId);
  if (step === 'story' && nextStory) return <StoryFireSheet story={nextStory} liveTitle={live?.title ?? null} onClose={onClose} />;
  if (step === 'draw') return <DrawSheet liveTitle={live?.title ?? null} onClose={onClose} onWrite={() => setStep('write')} />;
  if (step === 'write') return <CustomSheet hasLive={Boolean(live)} onClose={onClose} />;
  return (
    <BottomSheet title={`Fire a ${t.sideQuest.one}`} subtitle={live ? 'Replaces the one taking entries' : 'Opens for everyone right now'} onClose={onClose}>
      {live ? (
        <p>
          <strong>&ldquo;{live.title}&rdquo;</strong> closes right away if you fire another. Only one takes entries at a time.
        </p>
      ) : null}
      {nextStory ? (
        <Button variant="primary" block onClick={() => setStep('story')}>
          Next story mission: {nextStory.title}
        </Button>
      ) : null}
      <Button variant={nextStory ? undefined : 'primary'} block onClick={() => setStep('draw')}>
        Draw a random one
      </Button>
      <Button block onClick={() => setStep('write')}>
        Write my own
      </Button>
      <Button block variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}

/* ---------- the story and random drops ---------- */

/**
 * The story in order: done ones stamped, Fire on the one up next, the rest not yet. A mission's name opens the sheet
 * to change it before it goes (or fire one out of turn, or again). Below, the random-drop switch, and the way into the
 * random pool.
 */
function StoryFolder({ nav }: { nav: LockerNav }) {
  const { state, settings, templatesById, globalQuests } = useGame();
  const { states, nextId } = useStory();
  const { busyKey, run } = useRunner();
  const [changing, setChanging] = useState<StoryQuest | null>(null);
  const gameOn = state.status === 'active';
  const fired = STORY.filter((s) => states[s.id] === 'done' || states[s.id] === 'running').length;
  const live = globalQuests.find((g) => g.status === 'live' && !g.longRun);
  const pool = useMemo(() => [...templatesById.values()].filter((tpl) => tpl.scope === 'global' && tpl.active).length, [templatesById]);
  const auto = settings.autoSideQuests;
  const next = tsMs(state.nextGlobalQuestAt);

  return (
    // The clip holds the tab here, so it never sits on the first row's Fire.
    <Folder tab={`Story · ${fired} of ${STORY.length} fired`} label="Story" clip="tab" className="gl-folder gl-story">
      <ol className="gl-sr" aria-label="Story missions in order">
        {STORY.map((s, i) => {
          const status = states[s.id] ?? 'not-yet';
          const upNext = s.id === nextId;
          const word = upNext ? 'up next' : status === 'done' ? 'done' : status === 'running' ? 'running' : 'not yet';
          return (
            <li key={s.id} className={`gl-sr__row${status === 'done' ? ' is-done' : ''}${upNext ? ' is-next' : ''}`}>
              <b aria-hidden="true">{i + 1}</b>
              {status === 'running' ? (
                <span className="gl-sr__name">{s.title}</span>
              ) : (
                <button
                  type="button"
                  className="gl-sr__name"
                  aria-label={`No. ${i + 1}, ${s.title}, ${word}: change it and fire it`}
                  disabled={!gameOn}
                  onClick={() => setChanging(s)}
                >
                  {s.title}
                </button>
              )}
              {upNext ? (
                <Button
                  className="gl-btn gl-btn--teal gl-btn--sm"
                  aria-label={`${s.kind === 'announce' ? 'Post' : 'Fire'} ${s.title}`}
                  busy={busyKey === `fire:${s.id}`}
                  disabled={!gameOn || busyKey !== null}
                  onClick={() => void run(`fire:${s.id}`, () => fireGlobalQuest({ mode: 'story', storyId: s.id }), `${s.title} sent out.`)}
                >
                  {s.kind === 'announce' ? 'Post' : 'Fire'}
                </Button>
              ) : status === 'done' ? (
                <Stamp tone="good">Done</Stamp>
              ) : status === 'running' ? (
                <Stamp tone="warm">Running</Stamp>
              ) : (
                <em>Not yet</em>
              )}
            </li>
          );
        })}
      </ol>
      <div className="gl-tgl">
        <button type="button" className="gl-tgl__text" onClick={() => nav.open('story')}>
          <b>Random drops</b>
          <i>
            {auto ? (gameOn && next ? `Next about ${clockTime(next)}` : 'On') : `Off: only you fire them`} · {pool} in the pool ›
          </i>
        </button>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={auto}
          aria-label="Random drops"
          disabled={busyKey !== null}
          onClick={() =>
            void run('auto', () => backend().data.set('game/settings', { autoSideQuests: !auto }, { merge: true }), auto ? 'Random drops off.' : 'Random drops on.')
          }
        />
      </div>
      {changing ? <StoryFireSheet story={changing} liveTitle={live?.title ?? null} onClose={() => setChanging(null)} /> : null}
    </Folder>
  );
}

/* ---------- periodic missions ---------- */

/** Each series on one line (when the next one goes, or the open one's time left) with Send now; the rest in full. */
function PeriodicsFolder({ nav }: { nav: LockerNav }) {
  const { list, loading, error } = usePeriodics();
  const openNow = useOpenCheckins();
  const now = useNow(1000);
  const { state } = useGame();
  const [sending, setSending] = useState<Doc<Periodic> | null>(null);
  const active = state.status === 'active';
  return (
    <Folder tab={`${t.checkin.Many} · ${runningCount(list)} running`} label={t.checkin.Many} className="gl-folder gl-pm">
      {error ? (
        <p className="gl-quiet gl-quiet--paper">Couldn&apos;t load them.</p>
      ) : loading ? (
        <p className="gl-quiet gl-quiet--paper">
          <Loader inline size={20} label={`Opening the ${t.checkin.many}`} caption="Opening…" />
        </p>
      ) : list.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">None set up yet.</p>
      ) : (
        <ul className="gl-pm__list">
          {list.map((p) => {
            const open = openNow.find((c) => c.periodicId === p.id) ?? null;
            const done = periodicDone(p);
            const nextAt = tsMs(p.nextAt);
            const ends = open ? tsMs(open.endsAt) : 0;
            return (
              <li key={p.id} className="gl-pm__row">
                <div className="gl-pm__txt">
                  <b>{p.name}</b>
                  <i>
                    {open
                      ? `Open · ${ends > now ? `${formatCountdown(ends, now)} left` : 'closing'}`
                      : done
                        ? 'All sent'
                        : p.status === 'running'
                          ? `Every ${p.intervalMin} min${nextAt ? ` · next ${clockTime(nextAt)}` : ''}`
                          : `Stopped · every ${p.intervalMin} min`}
                  </i>
                </div>
                <Button
                  className="gl-btn gl-btn--sm"
                  aria-label={`Send ${p.name} now`}
                  disabled={!active || Boolean(open) || done}
                  onClick={() => setSending(p)}
                >
                  Send now
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="gl-open" onClick={() => nav.open('periodics')}>
        New, start, stop or edit ›
      </button>
      {sending ? <PeriodicFireSheet periodic={sending} onClose={() => setSending(null)} /> : null}
    </Folder>
  );
}
