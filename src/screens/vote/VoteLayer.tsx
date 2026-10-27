// The vote takeover: while a vote needs the player, the whole app becomes the pack's vote screen (look.screens.vote).
// The provider decides which vote (src/lib/voteTakeover.ts) and the layer draws it over the app.
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import look from '@pack';
import { Loader } from '../../components/Loader';
import { useModal } from '../../components/useModal';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import {
  ballotProgress,
  putAside as putAsideSet,
  takeoverQuest,
  votesNeedingYou,
  type BallotProgress,
  type MyVote,
  type VoteEntry,
  type VoteMission,
} from '../../lib/voteTakeover';
import { useSession } from '../../session/SessionProvider';
import type { Doc, GlobalQuest, Submission } from '../../shared';
import './VoteLayer.css';

export interface VoteTakeoverApi {
  /** The pack has a vote screen (look.screens.vote). */
  available: boolean;
  /** The vote shown full screen now, if any. */
  showing: string | null;
  /** Opens a vote full screen (from a mission card's "Open the vote"), even one put aside. */
  open(questId: string): void;
  /** How far the player has got with a vote in voting (null: not one they can vote in). */
  progressFor(questId: string): BallotProgress | null;
}

interface Inner extends VoteTakeoverApi {
  quest: Doc<GlobalQuest> | null;
  entries: Doc<Submission>[];
  queued: number;
  putAside(): void;
  done(): void;
}

const VoteContext = createContext<Inner | null>(null);

const Screen = look.screens?.vote;

export function VoteTakeoverProvider({ children }: { children: ReactNode }) {
  const { user, player } = useSession();
  const { globalQuests, approved, myBallots, myBallotsLoading, myPoliceCall, state } = useGame();
  const { pathname } = useLocation();
  // Deadlines only need noticing to within a few seconds; a slower clock keeps the app from re-rendering every second.
  const now = useNow(10_000);
  const uid = user?.uid ?? null;
  const [current, setCurrent] = useState<string | null>(null);
  const [aside, setAside] = useState<ReadonlySet<string>>(() => new Set());

  const entriesByQuest = useMemo(() => {
    const map = new Map<string, Doc<Submission>[]>();
    for (const s of approved) {
      if (s.kind !== 'global') continue;
      const list = map.get(s.questId);
      if (list) list.push(s);
      else map.set(s.questId, [s]);
    }
    // A steady order, so a vote doesn't reshuffle by who entered first.
    for (const list of map.values()) list.sort((a, b) => a.id.localeCompare(b.id));
    return map;
  }, [approved]);

  const missions = useMemo<VoteMission[]>(
    () =>
      globalQuests.map((g) => ({
        id: g.id,
        status: g.status,
        judging: g.judging,
        voteStyle: g.voteStyle,
        votingEndsMs: g.votingEndsAt ? tsMs(g.votingEndsAt) : null,
      })),
    [globalQuests],
  );

  const playing = Boolean(player) && !player?.left;
  const needingNow = votesNeedingYou({ missions, entriesByMission: entriesByQuest as ReadonlyMap<string, readonly VoteEntry[]>, votes: myBallots as ReadonlyMap<string, MyVote | null>, uid, playing, nowMs: now });
  // The same list keeps the same identity, so the context (and the app frame) only changes when the votes waiting do.
  const needingKey = needingNow.join('|');
  const needing = useMemo(() => needingNow, [needingKey]);

  const showing = Screen
    ? takeoverQuest({ needing, aside, current, pathname, policeOpen: Boolean(myPoliceCall), gameActive: state.status === 'active', loading: myBallotsLoading })
    : null;
  const quest = showing ? (globalQuests.find((g) => g.id === showing) ?? null) : null;
  // A vote that takes over is held until Done or Back, so it doesn't vanish the moment the ballot is complete (or the
  // vote closes): the screen still shows the board, or the result.
  useEffect(() => {
    if (showing && current === null) setCurrent(showing);
  }, [showing, current]);

  const putAside = useCallback(() => {
    setAside((prev) => putAsideSet(prev, needing));
    setCurrent(null);
  }, [needing]);
  const done = useCallback(() => setCurrent(null), []);
  const open = useCallback((id: string) => {
    setAside((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setCurrent(id);
  }, []);
  const progressFor = useCallback(
    (id: string): BallotProgress | null => {
      const g = globalQuests.find((q) => q.id === id);
      if (!g || !uid || !playing || g.status !== 'voting') return null;
      return ballotProgress(g, myBallots.get(id), entriesByQuest.get(id) ?? [], uid);
    },
    [globalQuests, myBallots, entriesByQuest, uid, playing],
  );

  const queued = needing.filter((id) => id !== showing && !aside.has(id)).length;
  const value = useMemo<Inner>(
    () => ({ available: Boolean(Screen), showing: quest ? showing : null, open, progressFor, quest, entries: quest ? (entriesByQuest.get(quest.id) ?? []) : [], queued, putAside, done }),
    [showing, quest, open, progressFor, entriesByQuest, queued, putAside, done],
  );
  return <VoteContext.Provider value={value}>{children}</VoteContext.Provider>;
}

export function useVoteTakeover(): VoteTakeoverApi {
  const ctx = useContext(VoteContext);
  if (!ctx) throw new Error('useVoteTakeover must be used inside <VoteTakeoverProvider>');
  return ctx;
}

/** The full-screen layer; renders nothing while no vote is showing. */
export function VoteLayer() {
  const ctx = useContext(VoteContext);
  if (!Screen || !ctx || !ctx.quest) return null;
  return <Layer ctx={ctx} quest={ctx.quest} />;
}

function Layer({ ctx, quest }: { ctx: Inner; quest: Doc<GlobalQuest> }) {
  const ref = useRef<HTMLDivElement>(null);
  // Locked: no Escape. The pack's screen has its own way out (Back to the case).
  useModal(ref, ctx.putAside, true);
  return (
    <div className="vote-layer" role="dialog" aria-modal="true" aria-label={quest.title} ref={ref} tabIndex={-1}>
      <Suspense fallback={<Loader fullScreen caption="Loading" />}>
        {Screen ? <Screen quest={quest} entries={ctx.entries} queued={ctx.queued} putAside={ctx.putAside} done={ctx.done} /> : null}
      </Suspense>
    </div>
  );
}
