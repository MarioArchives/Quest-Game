// The Missions tab's data: the game's group missions, story missions and periodic missions (check-ins) turned into
// the stack's open folders and the three dividers' rows. The Board reads it once and hands it to the Missions tab, so
// its folder tab can light up while something there needs you.
import { useMemo, useState } from 'react';
import { periodicDone } from '../../../../functions/src/shared/periodics.ts';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { judgingOf, skipFine } from '../../../lib/judging';
import { needsYou, tonight, wasIn, yourMark, type Mark, type YourPart } from '../../../lib/missionTabs';
import { clockTime } from '../../../lib/time';
import { features, pack, t, zone } from '../../../pack';
import { readVote } from '../../../screens/home/SideQuestCard';
import { useSession } from '../../../session/SessionProvider';
import type { Checkin, Doc, Fact, Periodic } from '../../../shared';
import type { Mission } from './MissionBinder';
import { announcementsFired, byDeadline, checkinMark, opensLine, shortName, storyChapters, type DeckKind, type OpenMission, type YouNow } from './missionDeck';

/** An open mission: a folder in the stack and a row under its divider. */
export interface DeckMission extends OpenMission {
  kind: DeckKind;
  /** The name on its folder's tab and its chip ("Lottery", "Roll call"). */
  name: string;
  /** Its number on the night: "No. 3", or a story chapter's "Ch. 2". */
  label: string;
  /** The line above its title: "Group event · No. 3", "Story · chapter 2", "Roll call · No. 3". */
  kicker: string;
  /** The mission's title, or a check-in's prompt. */
  title: string;
  /** A Submit mission being scored counts as checking (no clock). */
  status: 'live' | 'checking' | 'voting';
  /** A long-running mission: after its deadline it waits for its vote. */
  longRun?: boolean;
  quest: Mission | null;
  checkin: Doc<Checkin> | null;
  /** For a check-in, `done` comes from the feed (the folder and its row read the answers themselves). */
  you: YouNow;
  needsYou: boolean;
}

/** A closed mission, folded into its divider's "Filed" line. */
export interface FiledMission {
  id: string;
  label: string;
  title: string;
  mark: Mark | null;
  /** The fine you paid for missing it, or what you earned (null for neither). */
  delta: number | null;
  quest: Mission | null;
  checkin: Doc<Checkin> | null;
}

/** The next periodic mission a series will send (the GM's view only: players can't read the series). */
export interface NextCheckin {
  id: string;
  label: string;
  name: string;
  line: string;
}

/** A story announcement that has fired, shown as a revealed note (never a folder). */
export interface StoryNote {
  id: string;
  label: string;
  title: string;
  text: string;
  atMs: number;
}

export interface Deck {
  /** Every open mission, soonest deadline first. */
  open: DeckMission[];
  group: { open: DeckMission[]; filed: FiledMission[]; drops: boolean };
  periodic: { open: DeckMission[]; filed: FiledMission[]; next: NextCheckin[]; aside: string };
  story: { open: DeckMission[]; filed: FiledMission[]; sealed: number[]; total: number; notes: StoryNote[]; facts: Doc<Fact>[] };
  /** Something open asks you for an entry, an answer or a vote. */
  needsYou: boolean;
  /** Call after a vote is cast (votes are remembered on this device only). */
  voted(): void;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function useMissionDeck(): Deck {
  const { user, isAdmin } = useSession();
  const { globalQuests, state, approved, mySubmissions, me, feed, settings } = useGame();
  const checkins = useQuery<Checkin>(features.checkins ? { path: 'checkins' } : null);
  const factsQ = useQuery<Fact>(features.sideQuests && (pack.catalogue.story?.length ?? 0) > 0 ? { path: 'facts' } : null);
  const periodics = useQuery<Periodic>(features.checkins && isAdmin ? { path: 'periodics' } : null);
  const now = useNow(30_000);
  const [votes, setVotes] = useState(0);
  const uid = user?.uid ?? null;

  const deck = useMemo(() => {
    const playing = Boolean(me && !me.left);
    const joinedMs = me ? tsMs(me.joinedAt) : null;
    const startedMs = tsMs(state.startedAt) || null;
    const story = features.sideQuests ? (pack.catalogue.story ?? []) : [];

    // ---- group and story missions (side quests) ----
    const missions: Mission[] = (features.sideQuests ? globalQuests : []).map((q) => ({ ...q, startsMs: tsMs(q.startsAt) }));
    const tonightOnly = missions.filter((m) => !startedMs || m.startsMs >= startedMs);
    const isStory = (m: Mission) => m.source === 'story' || Boolean(m.storyId);
    const numberOf = new Map(tonight(tonightOnly.filter((m) => !isStory(m)), startedMs).map(({ mission, number }) => [mission.id, number]));
    const { chapterOf, sealed } = storyChapters(story, tonightOnly.map((m) => m.storyId));

    const partOf = (m: Mission): YourPart => ({
      uid,
      playing,
      entryIds: mySubmissions
        .filter((s) => s.kind === 'global' && s.questId === m.id && (s.status === 'sealed' || s.status === 'approved'))
        .map((s) => s.id),
      voted: m.status === 'voting' && readVote(uid, m.id) !== null,
      canVote: approved.some((s) => s.kind === 'global' && s.questId === m.id && s.uid !== uid),
      wasIn: me ? wasIn(tsMs(me.joinedAt), me.left ? tsMs(me.leftAt) || null : null, m.startsMs) : false,
    });

    const open: DeckMission[] = [];
    const filed: Record<'group' | 'story', FiledMission[]> = { group: [], story: [] };
    const announced = new Map<string, Mission>();
    for (const m of [...tonightOnly].sort((a, b) => a.startsMs - b.startsMs)) {
      const kind = isStory(m) ? 'story' : 'group';
      const chapter = m.storyId ? chapterOf.get(m.storyId) : undefined;
      const label = kind === 'story' ? `Ch. ${chapter ?? '?'}` : `No. ${numberOf.get(m.id) ?? '?'}`;
      const part = partOf(m);
      if (m.kind === 'announce') {
        // An announcement is a note, not a mission: the latest firing of each one.
        if (m.storyId) announced.set(m.storyId, m);
        continue;
      }
      if (m.status === 'closed') {
        const mark = yourMark(m, part);
        const fine = skipFine(m, settings);
        const earned = mySubmissions.filter((s) => s.kind === 'global' && s.questId === m.id).reduce((sum, s) => sum + (s.pointsAwarded ?? 0), 0);
        const delta = mark === 'missed' ? (fine > 0 ? -fine : null) : earned > 0 ? earned : null;
        filed[kind].push({ id: m.id, label, title: m.title, mark, delta, quest: m, checkin: null });
        continue;
      }
      const scoring = m.status === 'voting' && judgingOf(m) === 'submit';
      const status = scoring ? 'checking' : m.status;
      const voting = status === 'voting';
      open.push({
        id: m.id,
        kind,
        name: shortName(m.title),
        label,
        kicker: kind === 'story' ? `Story · chapter ${chapter ?? '?'}` : `Group event · ${label}`,
        title: m.title,
        status,
        longRun: m.longRun === true,
        deadlineMs: status === 'live' ? tsMs(m.endsAt) : voting && m.votingEndsAt ? tsMs(m.votingEndsAt) : null,
        startsMs: m.startsMs,
        quest: m,
        checkin: null,
        you: { playing, done: voting ? part.voted : part.entryIds.length > 0, nothingToVote: voting && !part.canVote },
        needsYou: !scoring && needsYou(m, part),
      });
    }

    // ---- periodic missions (check-ins) ----
    const answeredInFeed = new Set(feed.filter((p) => p.type === 'checkin-answer' && p.uid === uid && p.ref).map((p) => p.ref as string));
    const periodicFiled: FiledMission[] = [];
    for (const c of [...checkins.data].sort((a, b) => tsMs(a.startsAt) - tsMs(b.startsAt))) {
      const label = `No. ${c.number}`;
      const startsMs = tsMs(c.startsAt);
      if (c.status === 'closed') {
        const mark = checkinMark({ missedUids: c.missedUids ?? [], endedBy: c.endedBy, startsMs }, { uid, joinedMs, answered: answeredInFeed.has(c.id) });
        periodicFiled.push({ id: c.id, label, title: c.prompt, mark, delta: mark === 'missed' && c.penalty > 0 ? -c.penalty : null, quest: null, checkin: c });
        continue;
      }
      const done = answeredInFeed.has(c.id);
      open.push({
        id: c.id,
        kind: 'periodic',
        name: shortName(c.name),
        label,
        kicker: `${c.name} · ${label}`,
        title: c.prompt,
        status: 'live',
        deadlineMs: tsMs(c.endsAt),
        startsMs,
        quest: null,
        checkin: c,
        you: { playing, done },
        needsYou: playing && state.status !== 'ended' && !done && tsMs(c.endsAt) > now,
      });
    }

    const series = periodics.data.filter((p) => p.status === 'running' && !periodicDone(p));
    const next: NextCheckin[] = series
      .map((p) => ({ p, at: tsMs(p.nextAt) }))
      .filter(({ at }) => at > 0)
      .sort((a, b) => a.at - b.at)
      .map(({ p, at }) => ({ id: p.id, label: `No. ${p.sent + 1}`, name: p.name, line: opensLine(clockTime(at, zone), at, now) }));
    const names = [...new Set((series.length > 0 ? series.map((p) => p.name) : checkins.data.map((c) => c.name)).map(lower))];
    const every = series.length === 1 ? (series[0]!.intervalMin === 60 ? ' · hourly' : ` · every ${series[0]!.intervalMin} min`) : '';

    const notes: StoryNote[] = announcementsFired(story, [...announced.keys()]).map((s) => {
      const doc = announced.get(s.id)!;
      return { id: doc.id, label: `Ch. ${chapterOf.get(s.id) ?? '?'}`, title: doc.title, text: doc.description, atMs: doc.startsMs };
    });
    const sorted = byDeadline(open);
    const of = (kind: DeckKind) => sorted.filter((m) => m.kind === kind);
    return {
      open: sorted,
      group: { open: of('group'), filed: filed.group, drops: settings.autoSideQuests },
      periodic: { open: of('periodic'), filed: periodicFiled, next, aside: names.length > 0 ? `${names.join(' · ')}${every}` : '' },
      story: { open: of('story'), filed: filed.story, sealed, total: story.length, notes, facts: factsQ.data },
      needsYou: sorted.some((m) => m.needsYou),
    };
    // `votes` re-reads this device's votes after one is cast.
  }, [uid, me, state.startedAt, state.status, globalQuests, mySubmissions, approved, settings, feed, checkins.data, periodics.data, factsQ.data, now, votes]);

  return { ...deck, voted: () => setVotes((n) => n + 1) };
}

/** "From the GM" when random drops are off. */
export const dropsAside = (drops: boolean): string => (drops ? 'random drops' : `from the ${t.gm.one}`);
