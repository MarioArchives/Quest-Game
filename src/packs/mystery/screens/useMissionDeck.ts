// The Missions tab's data: the game's group missions, story missions and periodic missions (check-ins) turned into
// the stack's folders, the entries Still open, what's filed tonight and the Next line. The Board reads it once and
// hands it to the Missions tab, so its folder tab can light up while something there needs you.
import { useMemo, useState } from 'react';
import { periodicDone } from '../../../../functions/src/shared/periodics.ts';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../../data/hooks';
import { judgingOf, skipFine } from '../../../lib/judging';
import { needsYou, tonight, wasIn, yourMark, type Mark, type YourPart } from '../../../lib/missionTabs';
import { clockTime } from '../../../lib/time';
import { features, pack, t, zone } from '../../../pack';
import { useVoteTakeover } from '../../../screens/vote/VoteLayer';
import { useSession } from '../../../session/SessionProvider';
import type { Checkin, Doc, Fact, Periodic, Submission } from '../../../shared';
import type { Mission } from './MissionBinder';
import { announcementsFired, byDeadline, checkinMark, isStillOpen, nextLine, shortName, storyChapters, type DeckKind, type OpenMission, type YouNow } from './missionDeck';

/** An open mission: a folder in the stack, or a slip under Still open. */
export interface DeckMission extends OpenMission {
  kind: DeckKind;
  /** The name on its folder's tab ("Lottery", "Roll call"). */
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
  /** For a check-in, `done` comes from the feed (its folder reads the answers itself). */
  you: YouNow;
  needsYou: boolean;
  /** Your entry to a group or story mission (sealed or revealed), if you're in. */
  entry: Doc<Submission> | null;
}

/** A closed mission, folded into Filed tonight. */
export interface FiledMission {
  id: string;
  label: string;
  /** "Group event · No. 1", "Story · Ch. 4", "Roll call · No. 2". */
  kicker: string;
  /** When it opened. */
  atMs: number;
  title: string;
  mark: Mark | null;
  /** The fine you paid for missing it, or what you earned (null for neither). */
  delta: number | null;
  quest: Mission | null;
  checkin: Doc<Checkin> | null;
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
  /** The stack: every open mission but those Still open, soonest deadline first. */
  live: DeckMission[];
  /** The group and story missions you're in while they still take entries, soonest deadline first. */
  stillOpen: DeckMission[];
  /** Every mission closed tonight, in the order they opened. */
  filed: FiledMission[];
  /** "Next: roll call at 23:00 · random drops on · 2 chapters sealed", or null. */
  next: string | null;
  /** The story's fired announcements and the facts it has settled. */
  story: { notes: StoryNote[]; facts: Doc<Fact>[] };
  /** Something open asks you for an entry, an answer or a vote. */
  needsYou: boolean;
  /** Call after a vote is cast on the plain vote card (a GM who doesn't play). */
  voted(): void;
}

export function useMissionDeck(): Deck {
  const { user, isAdmin } = useSession();
  const { globalQuests, state, approved, mySubmissions, me, feed, settings } = useGame();
  const checkins = useQuery<Checkin>(features.checkins ? { path: 'checkins' } : null);
  const factsQ = useQuery<Fact>(features.sideQuests && (pack.catalogue.story?.length ?? 0) > 0 ? { path: 'facts' } : null);
  const periodics = useQuery<Periodic>(features.checkins && isAdmin ? { path: 'periodics' } : null);
  const now = useNow(30_000);
  const { progressFor } = useVoteTakeover();
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

    const entriesOf = (m: Mission) => mySubmissions.filter((s) => s.kind === 'global' && s.questId === m.id && (s.status === 'sealed' || s.status === 'approved'));
    const partOf = (m: Mission): YourPart => ({
      uid,
      playing,
      entryIds: entriesOf(m).map((s) => s.id),
      voted: m.status === 'voting' && progressFor(m.id)?.finished === true,
      canVote: approved.some((s) => s.kind === 'global' && s.questId === m.id && s.uid !== uid),
      wasIn: me ? wasIn(tsMs(me.joinedAt), me.left ? tsMs(me.leftAt) || null : null, m.startsMs) : false,
    });

    const open: DeckMission[] = [];
    const filed: FiledMission[] = [];
    const announced = new Map<string, Mission>();
    for (const m of [...tonightOnly].sort((a, b) => a.startsMs - b.startsMs)) {
      const kind = isStory(m) ? 'story' : 'group';
      const chapter = m.storyId ? chapterOf.get(m.storyId) : undefined;
      const label = kind === 'story' ? `Ch. ${chapter ?? '?'}` : `No. ${numberOf.get(m.id) ?? '?'}`;
      const kicker = kind === 'story' ? `Story · ${label}` : `Group event · ${label}`;
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
        filed.push({ id: m.id, label, kicker, atMs: m.startsMs, title: m.title, mark, delta, quest: m, checkin: null });
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
        entry: entriesOf(m)[0] ?? null,
      });
    }

    // ---- periodic missions (check-ins) ----
    const answeredInFeed = new Set(feed.filter((p) => p.type === 'checkin-answer' && p.uid === uid && p.ref).map((p) => p.ref as string));
    for (const c of [...checkins.data].sort((a, b) => tsMs(a.startsAt) - tsMs(b.startsAt))) {
      const label = `No. ${c.number}`;
      const startsMs = tsMs(c.startsAt);
      if (c.status === 'closed') {
        const mark = checkinMark({ missedUids: c.missedUids ?? [], endedBy: c.endedBy, startsMs }, { uid, joinedMs, answered: answeredInFeed.has(c.id) });
        filed.push({ id: c.id, label, kicker: `${c.name} · ${label}`, atMs: startsMs, title: c.prompt, mark, delta: mark === 'missed' && c.penalty > 0 ? -c.penalty : null, quest: null, checkin: c });
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
        entry: null,
      });
    }

    // The next roll call (the GM's view only: players can't read the series).
    const coming = periodics.data
      .filter((p) => p.status === 'running' && !periodicDone(p))
      .map((p) => ({ name: p.name, at: tsMs(p.nextAt) }))
      .filter(({ at }) => at > 0)
      .sort((a, b) => a.at - b.at)[0];

    const notes: StoryNote[] = announcementsFired(story, [...announced.keys()]).map((s) => {
      const doc = announced.get(s.id)!;
      return { id: doc.id, label: `Ch. ${chapterOf.get(s.id) ?? '?'}`, title: doc.title, text: doc.description, atMs: doc.startsMs };
    });
    const sorted = byDeadline(open);
    return {
      live: sorted.filter((m) => !isStillOpen(m)),
      stillOpen: sorted.filter(isStillOpen),
      filed: filed.sort((a, b) => a.atMs - b.atMs),
      next:
        state.status === 'ended'
          ? null
          : nextLine({
              checkin: coming ? { name: coming.name, clock: clockTime(coming.at, zone) } : null,
              groups: features.sideQuests,
              drops: settings.autoSideQuests,
              sealed: sealed.length,
              gm: t.gm.One,
            }),
      story: { notes, facts: factsQ.data },
      needsYou: sorted.some((m) => m.needsYou),
    };
    // `votes` is bumped by the GM's plain vote card; a player's progress comes from `progressFor`.
  }, [uid, progressFor, me, state.startedAt, state.status, globalQuests, mySubmissions, approved, settings, feed, checkins.data, periodics.data, factsQ.data, now, votes]);

  return { ...deck, voted: () => setVotes((n) => n + 1) };
}
