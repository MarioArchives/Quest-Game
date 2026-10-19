// Parts the Evidence Locker's tabs share: a job's kraft tag, the phone lines (the switchboard and the GM's own line)
// with the buttons that fix them, and a group mission's folder head (its number, where it came from, its state and
// clock).
import { useMemo, type ReactNode } from 'react';
import { setSwitchboard, testPoliceLine } from '../../../api';
import { Button } from '../../../components/Button';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useDocument } from '../../../data/hooks';
import { tonight } from '../../../lib/missionTabs';
import { testProgress } from '../../../lib/policeLine';
import { formatCountdown } from '../../../lib/time';
import { features, t } from '../../../pack';
import { clockTime, useRunner } from '../../../screens/gm/common';
import { useSession } from '../../../session/SessionProvider';
import type { Doc, GlobalQuest, PlayerPhone, Submission, Switchboard } from '../../../shared';
import { Stamp, Tag, TagTop, tiltFor, type StampTone } from './CaseKit';
import { linesAlarm, missionKind, type LockerTab } from './lockerLib';

/** Where the locker's tabs and the engine sections inside them lead. */
export interface LockerNav {
  /** Opens an engine section inside the current tab, with a way back. */
  open(view: SubView): void;
  /** Switches folder tab. */
  tab(id: LockerTab): void;
}

/** The engine sections a folder opens in full ("All 7 ›", "Open the deck ›"). */
export type SubView = 'players' | 'police' | 'guesses' | 'story' | 'periodics' | 'templates';

/* ---------- a job on the line ---------- */

/**
 * One job as a kraft tag on the twine: what kind and when on top, then what it is. `row` puts the buttons beside the
 * words (a short job); `hot` paints the tag's far edge red (the phone lines).
 */
export function JobTag({
  id,
  kind,
  right,
  row = false,
  hot = false,
  actions,
  children,
}: {
  id: string;
  kind: string;
  right?: ReactNode;
  row?: boolean;
  hot?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const className = `gl-job${row ? ' gl-job--row' : ''}${hot ? ' gl-job--hot' : ''}`;
  if (row) {
    return (
      <Tag tilt={tiltFor(id)} className={className}>
        <div className="gl-job__txt">
          <TagTop left={kind} right={right} />
          {children}
        </div>
        {actions}
      </Tag>
    );
  }
  return (
    <Tag tilt={tiltFor(id)} className={className}>
      <TagTop left={kind} right={right} />
      {children}
      {actions}
    </Tag>
  );
}

/* ---------- the phone lines ---------- */

export interface Lines {
  /** The switchboard as the server keeps it; null before it has ever moved (lines up). */
  sb: Switchboard | null;
  /** The GM's own line (for test calls), if they have saved a number. */
  mine: Doc<PlayerPhone> | null;
  /** Phone calls are switched on in the settings. */
  on: boolean;
  /** The lines went down by themselves: a job for Tonight. */
  alarm: boolean;
}

/** The switchboard and the GM's own line (nothing to read without police check-ins). */
export function useLines(): Lines {
  const { settings } = useGame();
  const { user } = useSession();
  const sb = useDocument<Switchboard>(features.police ? 'game/switchboard' : null).data ?? null;
  const mine = useDocument<PlayerPhone>(features.police && user ? `phones/${user.uid}` : null).data ?? null;
  return { sb, mine, on: settings.policePhone, alarm: linesAlarm(sb, settings.policePhone) };
}

/** "3 calls in a row didn't connect (Jonah, Ruth)." from the streak the switchboard tripped on, or null. */
export function useStreakLine(sb: Switchboard | null): string | null {
  const { playersById } = useGame();
  if (!sb || sb.streak === 0) return null;
  const names = sb.streakUids.map((uid) => (playersById.get(uid)?.displayName ?? 'a player').split(' ')[0]!);
  return `${sb.streak} ${sb.streak === 1 ? 'call' : 'calls in a row'} didn’t connect${names.length > 0 ? ` (${names.join(', ')})` : ''}.`;
}

/** Restore the lines and test the GM's own phone; without a number on file, the way to add one. */
export function LinesButtons({ lines, onAddNumber }: { lines: Lines; onAddNumber(): void }) {
  const { busyKey, run, anyBusy } = useRunner();
  const progress = testProgress(lines.mine?.test);
  return (
    <div className="gl-pair">
      <Button
        className="gl-btn gl-btn--teal"
        busy={busyKey === 'restore'}
        disabled={anyBusy}
        onClick={() => void run('restore', () => setSwitchboard({ action: 'restore' }), 'Lines restored.')}
      >
        Restore lines
      </Button>
      {lines.mine ? (
        <Button className="gl-btn" busy={busyKey === 'test' || progress !== null} disabled={anyBusy} onClick={() => void run('test', () => testPoliceLine())}>
          {progress ? 'Calling you…' : 'Test call to me'}
        </Button>
      ) : (
        <Button className="gl-btn" onClick={onAddNumber}>
          Add my number
        </Button>
      )}
    </div>
  );
}

/* ---------- a group mission's folder head ---------- */

const MISSION_STAMP = { live: 'Live', checking: 'Checking', voting: 'Voting' } as const;
const MISSION_TONE: Record<keyof typeof MISSION_STAMP, StampTone> = { live: 'bad', checking: 'plain', voting: 'warm' };

/** The folder's tab for a running group mission: "Group mission · voting". */
export const missionTab = (quest: Doc<GlobalQuest>) => `${t.sideQuest.One} · ${MISSION_STAMP[runningStatus(quest)].toLowerCase()}`;

/** A running mission's state (anything else reads as live). */
export const runningStatus = (quest: GlobalQuest): keyof typeof MISSION_STAMP =>
  quest.status === 'checking' || quest.status === 'voting' ? quest.status : 'live';

/** Its number tonight ("No. 6"), as the Board numbers them. */
function useMissionNumber(quest: Doc<GlobalQuest>): number | null {
  const { globalQuests, state } = useGame();
  return useMemo(() => {
    const numbered = tonight(
      globalQuests.map((g) => ({ ...g, startsMs: tsMs(g.startsAt) })),
      tsMs(state.startedAt) || null,
    );
    return numbered.find((n) => n.mission.id === quest.id)?.number ?? null;
  }, [globalQuests, state.startedAt, quest.id]);
}

/**
 * The top of a running group mission's folder: number and source with its state stamped, the title, then the clock
 * (time left to enter or to vote) and the entries; while entries are checked, how many are left to check.
 */
export function MissionHead({ quest, now, entries, toCheck }: { quest: Doc<GlobalQuest>; now: number; entries: Doc<Submission>[]; toCheck: number }) {
  const { activePlayers } = useGame();
  const number = useMissionNumber(quest);
  const status = runningStatus(quest);
  const endsAt = status === 'voting' ? tsMs(quest.votingEndsAt) : tsMs(quest.endsAt);
  const clock = endsAt ? formatCountdown(endsAt, now) : '--:--';
  return (
    <>
      <div className="gl-mc__meta">
        <span>
          {number ? `No. ${number} · ` : ''}
          {missionKind(quest, t.gm.One)}
        </span>
        <Stamp tone={MISSION_TONE[status]}>{MISSION_STAMP[status]}</Stamp>
      </div>
      <h3 className="gl-mc__title">{quest.title}</h3>
      <div className="gl-mc__row">
        {status === 'checking' ? (
          <p className="gl-mc__n">Entries closed</p>
        ) : (
          <p className="gl-mc__clock" role="timer" aria-label={`${clock} left ${status === 'voting' ? 'to vote' : 'to enter'}`}>
            <b>{clock}</b>
            <i aria-hidden="true">{status === 'voting' ? 'left to vote' : 'left to enter'}</i>
          </p>
        )}
        <p className="gl-mc__n">
          {status === 'checking'
            ? `${toCheck} to check`
            : status === 'live'
              ? `${entries.length} of ${Math.max(activePlayers.length, entries.length)} entered`
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </p>
      </div>
    </>
  );
}

/** A running mission's entries (approved or sealed), oldest first, and how many still wait for the GM's check. */
export function useEntries(quest: Doc<GlobalQuest> | null): { entries: Doc<Submission>[]; toCheck: number } {
  const { approved, sealed } = useGame();
  const { user } = useSession();
  return useMemo(() => {
    if (!quest) return { entries: [], toCheck: 0 };
    const entries = [...approved, ...sealed]
      .filter((s) => s.kind === 'global' && s.questId === quest.id)
      .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
    const toCheck = entries.filter((e) => e.uid !== user?.uid && e.checked !== 'accepted').length;
    return { entries, toCheck };
  }, [approved, sealed, quest, user?.uid]);
}

/**
 * The group mission running now, if any: the one being checked first, then the one taking entries, then a vote. A
 * long-running mission runs alongside it and never hides it (see useLongRunMissions).
 */
export function useRunningMission(): Doc<GlobalQuest> | null {
  const { globalQuests } = useGame();
  const regular = globalQuests.filter((g) => !g.longRun);
  return regular.find((g) => g.status === 'checking') ?? regular.find((g) => g.status === 'live') ?? regular.find((g) => g.status === 'voting') ?? null;
}

/** The long-running missions still open (live, waiting for their vote or voting), oldest first. */
export function useLongRunMissions(): Doc<GlobalQuest>[] {
  const { globalQuests } = useGame();
  return globalQuests.filter((g) => g.longRun && g.status !== 'closed').sort((a, b) => tsMs(a.startsAt) - tsMs(b.startsAt));
}

/** A time as the tags show it, or nothing. */
export const at = (ms: number) => (ms ? clockTime(ms) : '');
