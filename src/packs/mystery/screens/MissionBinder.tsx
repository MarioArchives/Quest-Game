// The Board's group missions as one binder (option B, "binder tabs"): a divider tab down the folder's right edge for
// every group mission fired tonight, newest on top, red-edged when it needs you; past five, closed ones slim down to
// their number and your mark. The open tab's page is the mission's card (live, checking, voting) or, once it has
// closed, its result. The tabs never scroll: the binder grows taller to fit them.
// Off screen while the Missions tab is option E's stack (MissionsTab.tsx), which borrows its FiledResult and MarkIcon.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '../../../components/Avatar';
import { PhotoThumb } from '../../../components/PhotoViewer';
import { formatDelta } from '../../../components/PointsChip';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { judgingOf, skipFine } from '../../../lib/judging';
import {
  defaultTab,
  filedAtMs,
  filedRule,
  missionResult,
  needsYou,
  slimClosed,
  tabClock,
  tabLabel,
  tonight,
  wasIn,
  yourMark,
  type Mark,
  type YourPart,
} from '../../../lib/missionTabs';
import { clockTime } from '../../../lib/time';
import { pack, t, zone } from '../../../pack';
import { firstName } from '../../../screens/home/FeedPost';
import { CheckingCard, LiveCard } from '../../../screens/home/SideQuestCard';
import { useVoteTakeover } from '../../../screens/vote/VoteLayer';
import { useSession } from '../../../session/SessionProvider';
import { EntryVideo, TaggedLine } from '../../../components/EntryVideo';
import type { Doc, GlobalQuest, LedgerEntry, Submission } from '../../../shared';
import { Paperclip, Stamp } from './CaseKit';
import { VotingFront } from './MissionStack';
import './binder.css';

/** How long a newly fired mission's tab stays red and sticking out. */
const CUE_MS = 8000;

export type Mission = Doc<GlobalQuest> & { startsMs: number };

interface BinderTab {
  mission: Mission;
  number: number;
  you: YourPart;
  needsYou: boolean;
  mark: Mark | null;
}

export function MissionBinder() {
  const { user } = useSession();
  const { globalQuests, state, approved, mySubmissions, me } = useGame();
  const uid = user?.uid ?? null;
  const { progressFor } = useVoteTakeover();
  // The plain vote card (a GM who doesn't play) bumps this so the tabs read again.
  const [votes, setVotes] = useState(0);

  const startedMs = tsMs(state.startedAt) || null;
  const tabs = useMemo<BinderTab[]>(() => {
    const missions: Mission[] = globalQuests.map((q) => ({ ...q, startsMs: tsMs(q.startsAt) }));
    return tonight(missions, startedMs).map(({ mission, number }) => {
      const you: YourPart = {
        uid,
        playing: Boolean(me && !me.left),
        entryIds: mySubmissions
          .filter((s) => s.kind === 'global' && s.questId === mission.id && (s.status === 'sealed' || s.status === 'approved'))
          .map((s) => s.id),
        voted: mission.status === 'voting' && progressFor(mission.id)?.finished === true,
        canVote: approved.some((s) => s.kind === 'global' && s.questId === mission.id && s.uid !== uid),
        wasIn: me ? wasIn(tsMs(me.joinedAt), me.left ? tsMs(me.leftAt) || null : null, mission.startsMs) : false,
      };
      return { mission, number, you, needsYou: needsYou(mission, you), mark: yourMark(mission, you) };
    });
  }, [globalQuests, startedMs, mySubmissions, approved, me, uid, votes, progressFor]);

  // ---- which tab is open ----
  // Until you touch the binder it follows what needs you most (so it settles as your entries and votes load). Once the
  // night moves on while you look (a new mission, or one changes state), or you touch it, it stays on what you had.
  const auto = defaultTab(tabs.map((tab) => ({ id: tab.mission.id, status: tab.mission.status, needsYou: tab.needsYou })));
  const has = (id: string | null): id is string => id !== null && tabs.some((tab) => tab.mission.id === id);
  const [pick, setPick] = useState<string | null>(null);
  const sig = tabs.map((tab) => `${tab.mission.id}:${tab.mission.status}`).join(' ');
  const [seen, setSeen] = useState<{ sig: string; shown: string | null }>({ sig, shown: null });
  let selected = has(pick) ? pick : auto;
  if (seen.sig !== sig) {
    if (pick === null && has(seen.shown)) {
      setPick(seen.shown);
      selected = seen.shown;
    }
    setSeen({ sig, shown: selected });
  } else if (seen.shown !== selected) {
    setSeen({ sig, shown: selected });
  }
  const hold = () => {
    if (pick === null && selected) setPick(selected);
  };

  // ---- a newly fired mission's cue ----
  const [fresh, setFresh] = useState<string[]>([]);
  const known = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const ids = tabs.map((tab) => tab.mission.id).join(' ');
  useEffect(() => {
    const now = ids ? ids.split(' ') : [];
    // The first missions seen are the night so far, not news.
    if (known.current === null) {
      if (now.length > 0) known.current = new Set(now);
      return;
    }
    const seenBefore = known.current;
    const added = now.filter((id) => !seenBefore.has(id));
    if (added.length === 0) return;
    added.forEach((id) => seenBefore.add(id));
    setFresh((list) => [...list, ...added]);
    timers.current.push(window.setTimeout(() => setFresh((list) => list.filter((id) => !added.includes(id))), CUE_MS));
  }, [ids]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  // ---- keyboard: a vertical tablist ----
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const choose = (id: string, focus = false) => {
    setPick(id);
    setFresh((list) => list.filter((x) => x !== id));
    if (focus) tabRefs.current.get(id)?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.findIndex((tab) => tab.mission.id === selected);
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowDown' ? (i + 1) % tabs.length : event.key === 'ArrowUp' ? (i - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    choose(tabs[next]!.mission.id, true);
  };

  if (tabs.length === 0) return state.status === 'active' ? <EmptyBinder /> : null;

  const current = tabs.find((tab) => tab.mission.id === selected) ?? tabs[0]!;
  const slim = slimClosed(tabs.length);
  const newest = tabs.find((tab) => fresh.includes(tab.mission.id));

  return (
    <section className="mb" aria-label={`${t.sideQuest.Many} tonight`}>
      <span className="mb__label">
        {t.sideQuest.Many} &middot; {tabs.length}
      </span>
      <div className="mb__grid">
        <div className="mb__tabs" role="tablist" aria-orientation="vertical" aria-label={`${t.sideQuest.Many} tonight, newest first`}>
          {tabs.map((tab) => {
            const id = tab.mission.id;
            const isSel = id === current.mission.id;
            return (
              <BinderTabButton
                key={id}
                tab={tab}
                selected={isSel}
                slim={slim}
                isNew={fresh.includes(id) && !isSel}
                onSelect={() => choose(id)}
                onKeyDown={onTabKey}
                buttonRef={(el) => {
                  if (el) tabRefs.current.set(id, el);
                  else tabRefs.current.delete(id);
                }}
              />
            );
          })}
        </div>
        <div
          className="mb__page"
          role="tabpanel"
          id="mb-panel"
          aria-labelledby={`mb-tab-${current.mission.id}`}
          tabIndex={0}
          onPointerDownCapture={hold}
          onKeyDownCapture={hold}
        >
          <Paperclip />
          <MissionPage key={current.mission.id} tab={current} onVote={() => setVotes((n) => n + 1)} />
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {newest ? `New ${t.sideQuest.one}: No. ${newest.number}, ${newest.mission.title}` : ''}
      </span>
    </section>
  );
}

function BinderTabButton({
  tab,
  selected,
  slim,
  isNew,
  onSelect,
  onKeyDown,
  buttonRef,
}: {
  tab: BinderTab;
  selected: boolean;
  slim: boolean;
  isNew: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const { mission: m, number, you, needsYou: needs, mark } = tab;
  const closed = m.status === 'closed';
  const cls = [
    'mb-tab',
    `mb-tab--${m.status}`,
    needs ? 'mb-tab--need' : '',
    closed && slim ? 'mb-tab--slim' : '',
    isNew ? 'mb-tab--new' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={`mb-tab-${m.id}`}
      className={cls}
      aria-selected={selected}
      aria-controls="mb-panel"
      aria-label={tabLabel(number, m.title, m, you)}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <b className="mb-tab__no">{number}</b>
      {isNew ? (
        <i className="mb-tab__word">New</i>
      ) : m.status === 'live' ? (
        <TabClock endsMs={tsMs(m.endsAt)} />
      ) : m.status === 'checking' ? (
        <i className="mb-tab__word">Check</i>
      ) : m.status === 'voting' ? (
        <i className="mb-tab__word">{you.voted ? 'Voted' : 'Vote'}</i>
      ) : mark ? (
        <MarkIcon mark={mark} />
      ) : null}
    </button>
  );
}

/** A live tab's time left, ticking (only this re-renders each second). */
function TabClock({ endsMs }: { endsMs: number }) {
  const now = useNow(1000);
  return <i className="mb-tab__word">{tabClock(endsMs, now)}</i>;
}

/** ✓ you were in, ✗ you missed it, ★ you won (or were fastest). */
export function MarkIcon({ mark }: { mark: Mark }) {
  return (
    <svg className={`mb-mark mb-mark--${mark}`} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {mark === 'won' ? (
        <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z" fill="currentColor" />
      ) : mark === 'entered' ? (
        <path d="M5 12l5 5L19 7" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** "Story mission", "Random drop" or "From the GM". */
function kindOf(m: Mission): string {
  if (m.source === 'story' || m.storyId) return 'Story mission';
  if (m.source === 'gm-custom') return `From the ${t.gm.One}`;
  return 'Random drop';
}

/** The open tab's page: the mission's card while it is open, its result once it has closed. */
function MissionPage({ tab, onVote }: { tab: BinderTab; onVote: () => void }) {
  const m = tab.mission;
  const eyebrow = `No. ${tab.number} · ${kindOf(m)}`;
  if (m.status === 'live') return <LiveCard quest={m} eyebrow={eyebrow} />;
  if (m.status === 'checking') return <CheckingCard quest={m} eyebrow={eyebrow} />;
  if (m.status === 'voting') {
    // A Submit mission is scored as it closes: it never has a vote to show.
    return judgingOf(m) === 'vote' ? <VotingFront quest={m} eyebrow={eyebrow} onVote={onVote} /> : <p className="mb-res__none">Being scored.</p>;
  }
  return <FiledResult mission={m} label={`No. ${tab.number}`} />;
}

type Entry = Doc<Submission> & { createdMs: number };

/**
 * A closed mission's result: the winning (Vote) or fastest (Submit) entry, the votes, who entered, who was fined.
 * `label` is its number on the night ("No. 3", or a story's "Ch. 2").
 */
export function FiledResult({ mission: m, label }: { mission: Mission; label: string }) {
  const { user } = useSession();
  const { approved, playersById, feed, settings } = useGame();
  // The fines for not entering are points lines naming the mission (players and the GM can read the ledger).
  const lines = useQuery<LedgerEntry>({ path: 'pointsLedger', where: [['ref', '==', m.id]] });
  const entries = useMemo<Entry[]>(
    () => approved.filter((s) => s.kind === 'global' && s.questId === m.id).map((s) => ({ ...s, createdMs: tsMs(s.createdAt) })),
    [approved, m.id],
  );
  const result = useMemo(() => missionResult(m, entries, lines.data), [m, entries, lines.data]);
  const filedMs = useMemo(() => filedAtMs(m, feed.map((p) => ({ type: p.type, ref: p.ref, ms: tsMs(p.createdAt) }))), [m, feed]);
  const submit = judgingOf(m) === 'submit';
  const name = (uid: string) => (uid === user?.uid ? 'You' : firstName(playersById.get(uid)?.displayName ?? 'A player'));

  return (
    <article className="mb-res" aria-label={`${m.title}, closed`}>
      <div className="mb-res__meta">
        <span>
          {label} &middot; {submit ? 'Submit' : 'Vote'}
        </span>
        <Stamp tone="filed">Filed{filedMs !== null ? ` ${clockTime(filedMs, zone)}` : ''}</Stamp>
      </div>
      <h2 className="mb-res__title">{m.title}</h2>
      {m.description ? <p className="mb-res__desc">{m.description}</p> : null}
      <p className="mb-res__rule">{filedRule(m, skipFine(m, settings))}</p>

      {result.leads.length > 0 ? (
        result.leads.map(({ entry, words }) => <Lead key={entry.id} entry={entry} words={words} name={name(entry.uid)} />)
      ) : (
        <p className="mb-res__none">{entries.length === 0 ? 'No entries on file.' : 'No winner.'}</p>
      )}

      {result.votes.length > 0 || result.fastest ? (
        <p className="mb-res__tally">
          {result.votes.length > 0 ? <>Votes &middot; {result.votes.map((v) => `${name(v.entry.uid)} ${v.words}`).join(' · ')}</> : null}
          {result.votes.length > 0 && result.fastest ? <br /> : null}
          {result.fastest ? <>Fastest entry &middot; {name(result.fastest.uid)}</> : null}
        </p>
      ) : null}

      {result.entered.length > 0 ? (
        <>
          <p className="mb-res__label">Entered &middot; {result.entered.length}</p>
          <ul className="mb-who" aria-label="Who entered">
            {result.entered.map((uid) => (
              <li key={uid}>
                <Avatar name={playersById.get(uid)?.displayName ?? '?'} src={playersById.get(uid)?.photoURL} size={20} uid={uid} />
                <span>{name(uid)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {result.fined.length > 0 ? (
        <>
          <p className="mb-res__label mb-res__label--miss">Didn&apos;t enter &middot; fined</p>
          <ul className="mb-who mb-who--miss" aria-label="Who was fined">
            {result.fined.map(({ uid, delta }) => (
              <li key={uid}>
                <Avatar name={playersById.get(uid)?.displayName ?? '?'} src={playersById.get(uid)?.photoURL} size={20} uid={uid} />
                <span>{name(uid)}</span>
                {delta !== 0 ? (
                  <em>
                    {formatDelta(delta)}
                    <span className="visually-hidden"> points</span>
                  </em>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

/** The entry that leads a result: its print (or its words), a stamp, who, their caption and what it earned. */
function Lead({ entry, words, name }: { entry: Entry; words: string | null; name: string }) {
  const { playersById } = useGame();
  const who = playersById.get(entry.uid);
  const points = entry.pointsAwarded ?? 0;
  const stamp = words !== null ? `Winner · ${words}` : entry.createdMs ? `Fastest · ${clockTime(entry.createdMs, zone)}` : 'Fastest';
  return (
    <div className="mb-res__win">
      {entry.videoPath ? (
        <EntryVideo videoPath={entry.videoPath} thumbPath={entry.thumbPath} label={`${name === 'You' ? 'Your' : `${name}'s`} video`} />
      ) : entry.thumbPath ? (
        <span className="mb-res__print">
          <PhotoThumb submissionId={entry.id} thumbPath={entry.thumbPath} fill label={`Open ${name === 'You' ? 'your' : `${name}'s`} entry`} />
        </span>
      ) : (
        <p className="mb-res__words">{entry.caption}</p>
      )}
      <div className="mb-res__txt">
        <Stamp tone="good">{stamp}</Stamp>
        <p className="mb-res__name">
          <Avatar name={who?.displayName ?? name} src={who?.photoURL} size={24} uid={entry.uid} />
          <span>{name}</span>
        </p>
        {(entry.thumbPath || entry.videoPath) && entry.caption ? <p className="mb-res__cap">&ldquo;{entry.caption}&rdquo;</p> : null}
        <TaggedLine uid={entry.taggedUid} className="mb-res__cap" />
        {points > 0 ? (
          <span className="mb-res__pts">
            {formatDelta(points)}
            <span className="visually-hidden"> points</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Nothing fired yet tonight while the game runs: when they come, and how each kind is judged. */
function EmptyBinder() {
  const { settings } = useGame();
  const hours = (min: number) => Math.round((min / 60) * 10) / 10;
  const story = (pack.catalogue.story?.length ?? 0) > 0;
  const when = settings.autoSideQuests
    ? `Random ones drop roughly every ${hours(settings.globalIntervalMin)}–${hours(settings.globalIntervalMax)} hours${story ? `, and the ${t.gm.One} sends story missions as the night goes on.` : '.'}`
    : `The ${t.gm.One} sends them as the night goes on.`;
  const how = story
    ? `Everyone enters. A random drop’s entries are checked by the ${t.gm.One}, then everyone votes; a story mission goes straight to the vote, or every entry scores.`
    : `Everyone enters, the ${t.gm.One} checks the entries, then everyone votes.`;
  return (
    <section className="mb mb--empty" aria-label={t.sideQuest.Many}>
      <span className="mb__label">{t.sideQuest.Many}</span>
      <div className="mb__page">
        <Paperclip />
        <p className="mb-res__meta">Nothing fired yet</p>
        <h2 className="mb-res__title">None yet tonight</h2>
        <p className="mb-res__desc">
          {when} {how}
        </p>
      </div>
    </section>
  );
}
