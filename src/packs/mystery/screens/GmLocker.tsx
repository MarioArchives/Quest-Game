// The GM console as an incident room in case files (E4·1): the case plate as a manila folder with pause and close,
// "needs your signature" counts on ruled index cards that filter the evidence (the door, statements, entries,
// confirmed work) hung below as kraft tags on twine, then folders for the group mission and its evidence bags, the
// periodic missions, frames on file, suspects with quick nudges and the bulletin. The burger opens the engine's own
// sections (suspects, settings, bulletin, templates, guess log) inside it.
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { adjustPoints, advanceGlobalQuest, checkEntry, endGame, reviewJoinRequest, reviewSubmission, setGameStatus } from '../../../api';
import { Avatar } from '../../../components/Avatar';
import { BottomSheet } from '../../../components/BottomSheet';
import { Button } from '../../../components/Button';
import { ConfirmSheet } from '../../../components/ConfirmSheet';
import { Icon } from '../../../components/Icon';
import { Loader } from '../../../components/Loader';
import { usePhotoViewer } from '../../../components/PhotoViewer';
import { useToast } from '../../../components/Toast';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery, useStorageUrl } from '../../../data/hooks';
import { QUICK_POINTS, quickAdjustment } from '../../../lib/gmQuick';
import { formatCountdown } from '../../../lib/time';
import { features, pack, t } from '../../../pack';
import { GmDataProvider, useGmData } from '../../../screens/gm/GmData';
import { GuessLogSection } from '../../../screens/gm/GuessLogSection';
import { PlayersSection } from '../../../screens/gm/PlayersSection';
import { SettingsSection } from '../../../screens/gm/SettingsSection';
import { TemplatesSection } from '../../../screens/gm/TemplatesSection';
import { Announcement } from '../../../screens/gm/GameSection';
import { PeriodicCards, PeriodicsSection, runningCount, usePeriodics } from '../../../screens/gm/PeriodicsSection';
import { DrawSheet } from '../../../screens/gm/DrawSheet';
import { GM_DRAWER_ID, GmDrawer, type GmDrawerItem } from '../../../screens/gm/GmDrawer';
import { CustomSheet } from '../../../screens/gm/QuestsSection';
import { NoteSheet, clockTime, useClaim, useRunner } from '../../../screens/gm/common';
import '../../../screens/gm/gm.css';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, GlobalQuest, JoinRequest, Reward, Submission } from '../../../shared';
import { Folder, Stamp, Strung, Tag, TagTop, tiltFor } from './CaseKit';
import { PRECINCT } from './FileParts';
import { lockerSummary, runningFor, tagNumber, type LockerFilter } from './lockerLib';
import './gmlocker.css';

type View = 'locker' | 'players' | 'periodics' | 'settings' | 'bulletin' | 'templates' | 'guesses';

const STATUS_LABEL = { lobby: 'Case not open', active: 'Case open', paused: 'Case paused', ended: 'Case closed' } as const;

export default function GmLocker() {
  const { ready } = useGame();
  if (!ready) return <Loader className="app__loader" caption="Loading" />;
  return (
    <GmDataProvider>
      <Locker />
    </GmDataProvider>
  );
}

function Locker() {
  const { globalQuests } = useGame();
  const { pendingJoins, pendingSubs } = useGmData();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('locker');
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (next: View) => {
    setView(next);
    window.scrollTo(0, 0);
  };

  // The burger lists every part of the locker (the same places as the controls), with a dot when anything needs you.
  const needYou = pendingJoins.length + pendingSubs.length + (globalQuests.some((g) => g.status === 'checking') ? 1 : 0);
  const sections: GmDrawerItem<View | 'route'>[] = [
    { id: 'locker', label: 'Evidence locker', count: needYou },
    { id: 'players', label: 'Suspects' },
    ...(features.checkins ? [{ id: 'periodics' as const, label: t.checkin.Many }] : []),
    { id: 'settings', label: 'Settings' },
    { id: 'bulletin', label: 'Bulletin' },
    ...(features.map ? [{ id: 'route' as const, label: 'Route' }] : []),
    { id: 'templates', label: 'Templates' },
    ...(features.guesses ? [{ id: 'guesses' as const, label: 'Guess log' }] : []),
  ];
  const bar = (
    <header className="gl-head">
      <button
        type="button"
        className="gm-burger gl-burger"
        aria-label={needYou > 0 ? `Menu, ${needYou} waiting` : 'Menu'}
        aria-expanded={menuOpen}
        aria-controls={GM_DRAWER_ID}
        aria-haspopup="dialog"
        onClick={() => setMenuOpen(true)}
      >
        <Icon name="menu" size={24} strokeWidth={2.4} />
        {needYou > 0 ? <span className="gm-burger__dot" aria-hidden="true" /> : null}
      </button>
      <span className="gl-badge">Chief inspector</span>
    </header>
  );

  return (
    <>
      {view === 'locker' ? (
        <LockerHome go={go} bar={bar} />
      ) : (
        <div className="gl-sub">
          {bar}
          <button type="button" className="gl-back" onClick={() => go('locker')}>
            ← Back to the locker
          </button>
          <div className="gl-sub__body">
            {view === 'players' ? <PlayersSection /> : null}
            {view === 'periodics' ? <PeriodicsSection /> : null}
            {view === 'settings' ? <SettingsSection /> : null}
            {view === 'bulletin' ? <Announcement /> : null}
            {view === 'templates' ? <TemplatesSection /> : null}
            {view === 'guesses' ? <GuessLogSection /> : null}
          </div>
        </div>
      )}
      {menuOpen ? (
        <GmDrawer
          items={sections}
          current={view}
          onChoose={(id) => {
            setMenuOpen(false);
            if (id === 'route') void navigate('/map');
            else go(id);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}

/* ---------- the locker itself ---------- */

function LockerHome({ go, bar }: { go(view: View): void; bar: ReactNode }) {
  const { approved, sealed, globalQuests, playersById } = useGame();
  const { pendingJoins, pendingSubs, loading, error } = useGmData();
  const { user } = useSession();
  const [filter, setFilter] = useState<LockerFilter>('all');

  // Confirmed statements, newest first (the GM can overrule these); the latest ten get tags.
  const allConfirmed = useMemo(
    () => approved.filter((s) => s.kind === 'personal').sort((a, b) => tsMs(b.reviewedAt ?? b.createdAt) - tsMs(a.reviewedAt ?? a.createdAt)),
    [approved],
  );

  const items = useMemo(() => {
    const all: { key: string; at: number; node: 'join' | 'statement' | 'confirmed'; join?: Doc<JoinRequest>; sub?: Doc<Submission> }[] = [
      ...pendingJoins.map((j) => ({ key: `j:${j.id}`, at: tsMs(j.createdAt), node: 'join' as const, join: j })),
      ...pendingSubs.map((s) => ({ key: `s:${s.id}`, at: tsMs(s.createdAt), node: 'statement' as const, sub: s })),
      ...allConfirmed.slice(0, 10).map((s) => ({ key: `c:${s.id}`, at: tsMs(s.reviewedAt ?? s.createdAt), node: 'confirmed' as const, sub: s })),
    ];
    return all.sort((a, b) => b.at - a.at);
  }, [pendingJoins, pendingSubs, allConfirmed]);

  // Entries waiting for the GM's check: the group mission being checked, less accepted ones and your own.
  const checkingQuest = globalQuests.find((g) => g.status === 'checking');
  const toCheck = checkingQuest
    ? [...approved, ...sealed].filter((e) => e.kind === 'global' && e.questId === checkingQuest.id && e.uid !== user?.uid && e.checked !== 'accepted').length
    : 0;
  const first = (uid: string | null | undefined) => (playersById.get(uid ?? '')?.displayName ?? 'Someone').split(' ')[0]!;
  const firstSub = pendingSubs[0];
  const tiles: { id: Exclude<LockerFilter, 'all'>; n: number; label: string; sub: string; flag: string | null }[] = [
    {
      id: 'door',
      n: pendingJoins.length,
      label: 'At the door',
      sub: pendingJoins[0] ? `${pendingJoins[0].displayName.split(' ')[0]} wants to join` : 'Nobody waiting',
      flag: pendingJoins.length > 0 ? 'NEW' : null,
    },
    {
      id: 'statements',
      n: pendingSubs.length,
      label: 'Statements open',
      sub: firstSub ? `${first(firstSub.uid)}, waiting on ${firstSub.witnessUid ? first(firstSub.witnessUid) : 'a witness'}` : 'All ruled on',
      flag: null,
    },
    ...(features.sideQuests
      ? [{ id: 'entries' as const, n: toCheck, label: 'Entries to check', sub: checkingQuest ? t.sideQuest.One : 'None waiting', flag: checkingQuest ? 'CHECK' : null }]
      : []),
    { id: 'confirmed', n: allConfirmed.length, label: 'Confirmed', sub: 'Overrule if staged', flag: null },
  ];

  // On ALL, only the latest few confirmed tags, so the mission and suspects stay in reach; CONFIRMED has the rest.
  const recentConfirmed = new Set(allConfirmed.slice(0, ALL_CONFIRMED).map((s) => s.id));
  const shown = items.filter(
    (i) =>
      (filter === 'all' && (i.node !== 'confirmed' || recentConfirmed.has(i.sub?.id ?? ''))) ||
      (filter === 'door' && i.node === 'join') ||
      (filter === 'statements' && i.node === 'statement') ||
      (filter === 'confirmed' && i.node === 'confirmed'),
  );
  const moreConfirmed = filter === 'all' ? Math.min(items.filter((i) => i.node === 'confirmed').length, 10) - recentConfirmed.size : 0;
  const showTags = filter !== 'entries';
  const showMission = features.sideQuests && (filter === 'all' || filter === 'entries');
  const current = tiles.find((tile) => tile.id === filter);

  return (
    <div className="gl">
      {bar}
      <CasePlate />

      <h2 className="gl-section">Needs your signature</h2>
      <div className="gl-tiles" role="group" aria-label="Filter the locker">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`gl-tile cf-card${tile.n === 0 ? ' is-zero' : ''}`}
            aria-pressed={filter === tile.id}
            onClick={() => setFilter(filter === tile.id ? 'all' : tile.id)}
          >
            {tile.flag && tile.n > 0 ? <span className="gl-tile__flag">{tile.flag}</span> : null}
            <span className="gl-tile__n">{tile.n}</span>
            <span className="gl-tile__label">{tile.label}</span>
            <span className="gl-tile__sub">{tile.sub}</span>
          </button>
        ))}
      </div>
      {current ? (
        <div className="gl-showing">
          <span>Showing: {current.label}</span>
          <button type="button" className="gl-showing__all" onClick={() => setFilter('all')}>
            Show everything
          </button>
        </div>
      ) : null}

      {showTags ? (
        error ? (
          <p className="note note--error" role="alert">
            Couldn&apos;t open the locker.
          </p>
        ) : loading ? (
          <p className="gl-quiet">Opening the locker…</p>
        ) : shown.length === 0 ? (
          <div className="gl-empty">
            <h3>Nothing in the locker</h3>
            <p>{EMPTY[filter]}</p>
          </div>
        ) : (
          <>
            <Strung className="gl-tags" label="Evidence locker">
              {shown.map((item) =>
                item.node === 'join' && item.join ? (
                  <JoinTag key={item.key} req={item.join} />
                ) : item.node === 'statement' && item.sub ? (
                  <StatementTag key={item.key} sub={item.sub} mine={item.sub.uid === user?.uid} />
                ) : item.sub ? (
                  <ConfirmedTag key={item.key} sub={item.sub} />
                ) : null,
              )}
            </Strung>
            {moreConfirmed > 0 ? (
              <button type="button" className="gl-more" onClick={() => setFilter('confirmed')}>
                {moreConfirmed} more confirmed →
              </button>
            ) : null}
          </>
        )
      ) : null}

      {showMission ? <MissionCard /> : null}
      {filter === 'all' ? (
        <>
          {features.checkins ? <PeriodicsFolder go={go} /> : null}
          <FramesCard />
          <SuspectsCard go={go} />
          <Folder tab="Bulletin" label="Bulletin" className="gl-folder gl-engine">
            <Announcement />
          </Folder>
        </>
      ) : null}
    </div>
  );
}

const STATUS_STAMP = { lobby: 'Not open', active: 'Active', paused: 'Paused', ended: 'Closed' } as const;

/** The case plate as the incident room's folder: the precinct, the case's state, how long it has run, pause and close. */
function CasePlate() {
  const { state } = useGame();
  const now = useNow(60_000);
  const started = tsMs(state.startedAt);
  const ended = tsMs(state.endedAt);
  return (
    <Folder tab="Incident room" label="Case" className="gl-folder gl-plate">
      <span className="cf-meta">{PRECINCT}</span>
      <div className="gl-folder__row">
        <span className="cf-title">{STATUS_LABEL[state.status]}</span>
        <Stamp tone={state.status === 'active' ? 'active' : 'filed'}>{STATUS_STAMP[state.status]}</Stamp>
      </div>
      <p className="gl-plate__sub">
        {state.status === 'ended' && ended
          ? `Closed ${clockTime(ended)}`
          : started
            ? `Started ${clockTime(started)} · running ${runningFor((ended || now) - started)}`
            : 'Not started yet'}
      </p>
      <CaseButtons />
    </Folder>
  );
}

/** Confirmed tags shown on ALL before "N more confirmed". */
const ALL_CONFIRMED = 3;

const EMPTY: Record<LockerFilter, string> = {
  all: 'No one at the door, no statements waiting and nothing confirmed yet.',
  door: 'Nobody is waiting at the door. New requests land here as soon as someone signs in and asks to join.',
  statements: 'No statements are waiting. Every one has been ruled on.',
  entries: '',
  confirmed: 'Nothing has been confirmed yet.',
};

/* ---------- tags ---------- */

/** One piece of evidence as a kraft tag on the line: its number and kind, the time, an ink stamp, then the rest. */
function LockerTag({ id, kind, at, stamp, children }: { id: string; kind: string; at: number; stamp: ReactNode; children: ReactNode }) {
  return (
    <Tag tilt={tiltFor(id)} className="gl-tag">
      <TagTop left={`Tag ${tagNumber(id)} · ${kind}`} right={at ? clockTime(at) : ''} />
      {stamp}
      {children}
    </Tag>
  );
}

function JoinTag({ req }: { req: Doc<JoinRequest> }) {
  const { busyKey, run } = useRunner();
  const review = (approve: boolean) =>
    void run(
      `${approve ? 'yes' : 'no'}:${req.id}`,
      () => reviewJoinRequest({ uid: req.id, approve }),
      approve ? `${req.displayName} is in.` : `${req.displayName} turned away.`,
    );
  return (
    <LockerTag id={req.id} kind="At the door" at={tsMs(req.createdAt)} stamp={<Stamp tone="warm">Wants in</Stamp>}>
      <p className="gl-tag__text">{req.displayName} wants to join the crawl</p>
      <div className="gl-actions">
        <Button className="gl-btn gl-btn--teal" busy={busyKey === `yes:${req.id}`} disabled={busyKey !== null} onClick={() => review(true)}>
          Let in
        </Button>
        <Button className="gl-btn" busy={busyKey === `no:${req.id}`} disabled={busyKey !== null} onClick={() => review(false)}>
          Turn away
        </Button>
      </div>
    </LockerTag>
  );
}

function StatementTag({ sub, mine }: { sub: Doc<Submission>; mine: boolean }) {
  const { playersById, settings, state } = useGame();
  const { busyKey, run } = useRunner();
  const claim = useClaim(sub, true);
  const [rejecting, setRejecting] = useState(false);
  const who = playersById.get(sub.uid)?.displayName ?? 'A player';
  const witness = sub.witnessUid ? playersById.get(sub.witnessUid)?.displayName : undefined;
  const locked = mine || state.status === 'ended' || busyKey !== null;
  return (
    <LockerTag
      id={sub.id}
      kind="Statement"
      at={tsMs(sub.createdAt)}
      stamp={mine ? <Stamp>Your own</Stamp> : <Stamp tone="bad">Needs a ruling</Stamp>}
    >
      <p className="gl-tag__text">
        {who} says they did &ldquo;{claim.title}&rdquo;
      </p>
      <p className="gl-tag__sub">
        {mine
          ? `This is your own statement. Only ${witness ? witness : `your ${t.witness.one}`} can confirm it.`
          : `${witness ? `Witness ${witness}` : `No ${t.witness.one} named`} hasn't answered. You can rule on it instead.`}
      </p>
      <div className="gl-actions">
        <Button
          className="gl-btn gl-btn--teal"
          busy={busyKey === `approve:${sub.id}`}
          disabled={locked}
          onClick={() =>
            void run(`approve:${sub.id}`, () => reviewSubmission({ submissionId: sub.id, approve: true }), `Confirmed. +${settings.questPoints}.`)
          }
        >
          Confirm
        </Button>
        <Button className="gl-btn" disabled={locked} onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>
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
    </LockerTag>
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
    <LockerTag
      id={sub.id}
      kind="Confirmed"
      at={tsMs(sub.reviewedAt ?? sub.createdAt)}
      stamp={<Stamp tone="good">{witness ? `${witness.split(' ')[0]} saw it` : 'Confirmed'}</Stamp>}
    >
      <p className="gl-tag__text">
        {who} did &ldquo;{claim.title}&rdquo;{witness ? `, ${witness} saw it` : ''}
      </p>
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
    </LockerTag>
  );
}

/* ---------- the group mission ---------- */

function MissionCard() {
  const { globalQuests, state } = useGame();
  const { busyKey } = useRunner();
  const now = useNow(1000);
  const [firing, setFiring] = useState(false);
  const quest =
    globalQuests.find((g) => g.status === 'checking') ??
    globalQuests.find((g) => g.status === 'live') ??
    globalQuests.find((g) => g.status === 'voting') ??
    null;
  if (!quest) {
    const active = state.status === 'active';
    return (
      <Folder tab="Group mission · none running" label="Group mission" className="gl-folder gl-mission">
        <p className="gl-card__desc">{active ? 'Nothing is open right now.' : `The case isn't running, so ${t.sideQuest.many} are on hold.`}</p>
        <Button className="gl-btn gl-btn--teal gl-btn--wide" disabled={!active || busyKey !== null} onClick={() => setFiring(true)}>
          Fire a group mission
        </Button>
        {firing ? <FireSheets live={null} onClose={() => setFiring(false)} /> : null}
      </Folder>
    );
  }
  return <RunningMission quest={quest} now={now} />;
}

function useEntries(questId: string): Doc<Submission>[] {
  const { approved, sealed } = useGame();
  return useMemo(
    () =>
      [...approved, ...sealed]
        .filter((s) => s.kind === 'global' && s.questId === questId)
        .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt)),
    [approved, sealed, questId],
  );
}

const MISSION_EYEBROW = { live: 'ENTRIES OPEN', checking: 'ENTRIES CLOSED', voting: 'VOTING' } as const;

function RunningMission({ quest, now }: { quest: Doc<GlobalQuest>; now: number }) {
  const { activePlayers, state } = useGame();
  const { user } = useSession();
  const entries = useEntries(quest.id);
  const [confirming, setConfirming] = useState(false);
  const [firing, setFiring] = useState(false);
  const status = quest.status === 'live' || quest.status === 'checking' || quest.status === 'voting' ? quest.status : 'live';
  const toCheck = entries.filter((e) => e.uid !== user?.uid);
  const unchecked = toCheck.filter((e) => e.checked !== 'accepted').length;
  const endsAt = status === 'voting' ? tsMs(quest.votingEndsAt) : tsMs(quest.endsAt);
  const ended = state.status === 'ended';

  const label = status === 'live' ? 'Close entries' : status === 'checking' ? `Open the vote · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : 'End the vote';

  return (
    <Folder tab={`Group mission · ${MISSION_EYEBROW[status]}`} label="Group mission" className="gl-folder gl-mission">
      <div className="gl-mission__head">
        <div className="gl-folder__row">
          <h3 className="cf-title">{quest.title}</h3>
          {status === 'live' ? <span className="gl-live">LIVE</span> : null}
        </div>
        {status === 'checking' ? (
          <p className="gl-card__desc">Check each bag, then open the vote. Late entries still come in until you do.</p>
        ) : quest.description ? (
          <p className="gl-card__desc">{quest.description}</p>
        ) : null}
      </div>
      {status !== 'checking' ? (
        <div className="gl-clockrow">
          <span className="gl-bigclock" role="timer" aria-label={`${endsAt ? formatCountdown(endsAt, now) : 'No time'} left`}>
            {endsAt ? formatCountdown(endsAt, now) : '--:--'}
          </span>
          {status === 'live' ? (
            <div className="gl-prints">
              <Prints filled={entries.length} total={activePlayers.length} />
              <span className="gl-prints__n">
                {entries.length} OF {Math.max(activePlayers.length, entries.length)} ENTERED
              </span>
            </div>
          ) : (
            <span className="gl-prints__n">
              {entries.length} {entries.length === 1 ? 'ENTRY' : 'ENTRIES'}
            </span>
          )}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">{status === 'voting' ? 'There are no entries to vote on.' : status === 'live' ? 'Nobody has entered yet.' : 'No entries yet.'}</p>
      ) : (
        <div className="gl-bags">
          {entries.map((entry, i) => (
            <Bag key={entry.id} entry={entry} number={i + 1} quest={quest} canCheck={status === 'checking' && !ended} mine={entry.uid === user?.uid} />
          ))}
        </div>
      )}
      <div className="gl-card__btns">
        <Button className="gl-btn gl-btn--ink" disabled={ended} onClick={() => setConfirming(true)}>
          {label}
        </Button>
        <Button className="gl-btn" disabled={state.status !== 'active'} onClick={() => setFiring(true)}>
          Fire a new one
        </Button>
      </div>
      {firing ? <FireSheets live={status === 'live' ? quest : null} onClose={() => setFiring(false)} /> : null}
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
                {unchecked > 0 ? ` The ${unchecked} unchecked ${unchecked === 1 ? 'entry goes' : 'entries go'} in as ${unchecked === 1 ? 'it is' : 'they are'}.` : ''}
              </p>
              {entries.length === 0 ? <p className="muted">No entries are left, so it will end with no winner.</p> : null}
            </>
          ) : (
            <p>
              The votes for <strong>&ldquo;{quest.title}&rdquo;</strong> are counted now. The entry with the most votes gets{' '}
              <strong>+{quest.bonusPoints}</strong>; a tie pays everyone tied in full, and no votes means no winner.
            </p>
          )}
        </ConfirmSheet>
      ) : null}
    </Folder>
  );
}

/** Who has entered, as fingerprints: an inked print each, a faint one for everyone still to. */
function Prints({ filled, total }: { filled: number; total: number }) {
  const count = Math.min(Math.max(total, filled, 1), 14);
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`pip${i < filled ? ' pip--on' : ''}`} />
      ))}
    </span>
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
          <Button className="gl-btn" aria-label={`Throw out ${first}'s entry`} disabled={busyKey !== null} onClick={() => setRejecting(true)}>
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

/* ---------- frames on file ---------- */

/** Rows shown before "All n". */
const FRAMES_SHOWN = 3;

function FramesCard() {
  const { playersById } = useGame();
  const rewards = useQuery<Reward>({ path: 'rewards' });
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => [...rewards.data].sort((a, b) => tsMs(b.resolvedAt ?? b.createdAt) - tsMs(a.resolvedAt ?? a.createdAt)),
    [rewards.data],
  );
  const name = (uid?: string | null) => (uid ? (playersById.get(uid)?.displayName ?? 'A player') : 'A player');
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  const shown = all ? rows : rows.slice(0, FRAMES_SHOWN);

  return (
    <Folder tab="Frames on file" label="Frames on file" className="gl-folder gl-frames">
      <div className="gl-folder__row">
        <span className="gl-frames__lead">Who framed whom, and who destroyed evidence</span>
        <Stamp tone="bad">GM eyes only</Stamp>
      </div>
      {rewards.error ? (
        <p className="gl-quiet gl-quiet--paper">Couldn&apos;t open the file.</p>
      ) : rewards.loading ? (
        <p className="gl-quiet gl-quiet--paper">Opening…</p>
      ) : rows.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">Nothing yet. Frames and destroyed evidence are filed here, for you only.</p>
      ) : (
        <>
          <p className="gl-frames__sum">{lockerSummary(rows)}</p>
          <ul className="gl-frames__rows">
            {shown.map((r) => {
              const at = tsMs(r.resolvedAt ?? r.createdAt);
              const applied = r.applied ?? 0;
              const used = r.status === 'framed' || r.status === 'cleaned';
              return (
                <li key={r.id}>
                  <span className="gl-frames__at">{at ? clockTime(at) : ''}</span>
                  <span>
                    {r.status === 'framed'
                      ? `${name(r.uid)} framed ${name(r.targetUid)}`
                      : r.status === 'cleaned'
                        ? `${name(r.uid)} destroyed evidence`
                        : r.status === 'pending'
                          ? `${name(r.uid)} has a reward unused`
                          : `${name(r.uid)} · reward voided`}
                  </span>
                  <b className={used ? (r.status === 'framed' ? 'is-neg' : 'is-pos') : ''}>
                    {used ? signed(r.status === 'framed' ? -Math.abs(applied) : applied) : '—'}
                  </b>
                </li>
              );
            })}
          </ul>
          {rows.length > FRAMES_SHOWN ? (
            <button type="button" className="gl-open" aria-expanded={all} onClick={() => setAll((a) => !a)}>
              {all ? 'SHOW FEWER' : `ALL ${rows.length} →`}
            </button>
          ) : null}
        </>
      )}
    </Folder>
  );
}

/* ---------- periodic missions ---------- */

/** Every series inline (send one now, start or stop, the open one, edit), and the way into the full section. */
function PeriodicsFolder({ go }: { go(view: View): void }) {
  const { list } = usePeriodics();
  return (
    <Folder tab={`${t.checkin.Many} · ${runningCount(list)} of ${list.length} running`} label={t.checkin.Many} className="gl-folder gl-periodics">
      <PeriodicCards emptyHint={`None set up yet.`} />
      <button type="button" className="gl-open" onClick={() => go('periodics')}>
        NEW OR MANAGE →
      </button>
    </Folder>
  );
}

/* ---------- suspects ---------- */

/** The quick buttons' step: the pack's own (1 here), else 10. */
const QUICK = pack.gmQuickPoints ?? QUICK_POINTS;

function SuspectsCard({ go }: { go(view: View): void }) {
  const { players } = useGame();
  const { busyKey, run } = useRunner();
  const list = players.filter((p) => p.left !== 'out');
  const nudge = (uid: string, sign: 1 | -1) => void run(`q:${uid}:${sign}`, () => adjustPoints({ uid, ...quickAdjustment(sign, '', QUICK) }));
  return (
    <Folder tab={`Suspects · ${list.length}`} label="Suspects" className="gl-folder gl-sus">
      {list.length === 0 ? (
        <p className="gl-quiet gl-quiet--paper">Nobody has joined yet.</p>
      ) : (
        <ul className="gl-sus__list">
          {list.map((p) => {
            const points = p.points ?? 0;
            return (
              <li key={p.id} className="gl-sus__row">
                <Avatar name={p.displayName} src={p.photoURL} uid={p.id} size={36} className={`gl-sus__icon${points < 0 ? ' is-neg' : ''}`} />
                <div className="gl-sus__who">
                  <div className="gl-sus__name">
                    {p.displayName}
                    {p.left ? <span className="gl-sus__left"> · left</span> : null}
                  </div>
                  {p.character ? <div className="gl-sus__role">{p.character.name}</div> : null}
                </div>
                <span className={`gl-sus__pts${points < 0 ? ' is-neg' : ''}`}>{points < 0 ? `−${Math.abs(points)}` : points}</span>
                <Button
                  className="gl-btn gl-btn--sm"
                  aria-label={`Take ${QUICK} ${QUICK === 1 ? 'point' : 'points'} from ${p.displayName}`}
                  disabled={busyKey !== null}
                  onClick={() => nudge(p.id, -1)}
                >
                  −{QUICK}
                </Button>
                <Button
                  className="gl-btn gl-btn--sm"
                  aria-label={`Give ${p.displayName} ${QUICK} ${QUICK === 1 ? 'point' : 'points'}`}
                  disabled={busyKey !== null}
                  onClick={() => nudge(p.id, 1)}
                >
                  +{QUICK}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="gl-open" onClick={() => go('players')}>
        ALL {list.length} →
      </button>
    </Folder>
  );
}

/* ---------- firing a group mission ---------- */

/** Draw a random one (seen first, see DrawSheet) or write your own. */
function FireSheets({ live, onClose }: { live: Doc<GlobalQuest> | null; onClose(): void }) {
  const [step, setStep] = useState<'choose' | 'draw' | 'write'>('choose');
  if (step === 'draw') return <DrawSheet liveTitle={live?.title ?? null} onClose={onClose} onWrite={() => setStep('write')} />;
  if (step === 'write') return <CustomSheet hasLive={Boolean(live)} onClose={onClose} />;
  return (
    <BottomSheet title={`Fire a ${t.sideQuest.one}`} subtitle={live ? 'Replaces the one taking entries' : 'Opens for everyone right now'} onClose={onClose}>
      {live ? (
        <p>
          <strong>&ldquo;{live.title}&rdquo;</strong> closes right away if you fire another. Only one takes entries at a time.
        </p>
      ) : null}
      <Button variant="primary" block onClick={() => setStep('draw')}>
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

/* ---------- pause and close ---------- */

function CaseButtons() {
  const { state, globalQuests } = useGame();
  const { pendingSubs } = useGmData();
  const { busyKey, run } = useRunner();
  const [closing, setClosing] = useState(false);
  const status = state.status;
  const live = globalQuests.find((g) => g.status === 'live');
  const voting = globalQuests.filter((g) => g.status === 'voting');
  const checking = globalQuests.filter((g) => g.status === 'checking');

  const setStatus = (next: 'active' | 'paused', ok: string) => void run(`status:${next}`, () => setGameStatus({ status: next }), ok);

  return (
    <>
      <div className="gl-casebtns cf-btns">
        {status === 'active' ? (
          <Button className="gl-btn" busy={busyKey === 'status:paused'} onClick={() => setStatus('paused', 'Case paused.')}>
            Pause case
          </Button>
        ) : status === 'paused' ? (
          <Button className="gl-btn" busy={busyKey === 'status:active'} onClick={() => setStatus('active', 'Back on.')}>
            Resume case
          </Button>
        ) : status === 'lobby' ? (
          <Button className="gl-btn" busy={busyKey === 'status:active'} onClick={() => setStatus('active', 'The case is open.')}>
            Open case
          </Button>
        ) : (
          <Button className="gl-btn" disabled>
            Case closed
          </Button>
        )}
        <Button className="gl-btn gl-btn--red" disabled={status === 'ended' || status === 'lobby'} onClick={() => setClosing(true)}>
          Close case
        </Button>
      </div>
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
    </>
  );
}
