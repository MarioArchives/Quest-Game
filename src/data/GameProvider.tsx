import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  competitionRanks,
  DEFAULT_SETTINGS,
  type Doc,
  type FeedItem,
  type GameState,
  type GlobalQuest,
  type Guess,
  type Motive,
  type Player,
  type PoliceCall,
  type QuestTemplate,
  type Reward,
  type Settings,
  type Submission,
} from '../shared';
import { features } from '../pack';
import { useSession } from '../session/SessionProvider';
import { tsMs, useDocument, useQuery } from './hooks';

export type RankedPlayer = Doc<Player> & { rank: number };

export interface GameValue {
  /** game/state; a fresh lobby until the doc exists. */
  state: GameState;
  /** game/settings merged over the defaults. */
  settings: Settings;
  /** False until the first game/state snapshot has arrived. */
  ready: boolean;
  /**
   * The leaderboard: players by points (highest first), with competition ranks (ties share a rank). Players the GM
   * put out of the game are left off; frozen ones stay (see `left`).
   */
  players: RankedPlayer[];
  /** Players still playing (not frozen or out): who can be a witness, be guessed, or hold up a side quest. */
  activePlayers: RankedPlayer[];
  /** Everyone with a player doc, out ones last (rank 0). For the GM's player list. */
  allPlayers: RankedPlayer[];
  /** Every player doc by uid, out ones included, so old posts still show names. */
  playersById: Map<string, RankedPlayer>;
  /** The signed-in user's own player doc with rank, if they are a player. */
  me: RankedPlayer | null;
  /** The public quest catalogue (personal scope, alphabetical, retired included). */
  personalTemplates: Doc<QuestTemplate>[];
  templatesById: Map<string, Doc<QuestTemplate>>;
  /** Most recent global quests first. */
  globalQuests: Doc<GlobalQuest>[];
  /** Everyone's approved submissions (claims and side-quest entries), newest first. */
  approved: Doc<Submission>[];
  /**
   * GMs only: side-quest entries still sealed (hidden until voting). Other players cannot read them, so this is
   * empty for everyone else; a player's own sealed entry is in `mySubmissions`.
   */
  sealed: Doc<Submission>[];
  /** The signed-in player's own submissions in any status, newest first. */
  mySubmissions: Doc<Submission>[];
  /** The signed-in player's own guesses, newest first. */
  myGuesses: Doc<Guess>[];
  /** The newest feed posts (newest first), shared by Home and the bottom-bar dots. */
  feed: Doc<FeedItem>[];
  feedLoading: boolean;
  feedError: Error | null;
  /** Claims other players want this player to approve or reject (they are the named witness), oldest first. */
  witnessRequests: Doc<Submission>[];
  /** The signed-in player's pending rewards, oldest first (packs with rewardChoice; else empty). */
  myRewards: Doc<Reward>[];
  /** The signed-in player's secret motive (packs with characters), or null. */
  myMotive: Doc<Motive> | null;
  /** The signed-in player's open police check-in (packs with police), or null. */
  myPoliceCall: Doc<PoliceCall> | null;
}

/** How many of the newest feed posts the app keeps live. */
export const FEED_LIMIT = 50;

const GameContext = createContext<GameValue | null>(null);

const LOBBY: GameState = { status: 'lobby', startedAt: null, endedAt: null, nextGlobalQuestAt: null, announcement: null };

const byNewest = <T extends { createdAt?: unknown }>(a: T, b: T) => tsMs(b.createdAt) - tsMs(a.createdAt);

/** Live game data shared by every screen: one listener per collection for the whole session. */
export function GameProvider({ children }: { children: ReactNode }) {
  const { user, player, isAdmin } = useSession();
  const uid = user?.uid ?? null;
  const isPlayer = Boolean(player);

  const stateDoc = useDocument<GameState>('game/state');
  const settingsDoc = useDocument<Partial<Settings>>('game/settings');
  const playersQ = useQuery<Player>({ path: 'players' });
  const templatesQ = useQuery<QuestTemplate>({ path: 'questTemplates' });
  const globalQ = useQuery<GlobalQuest>({ path: 'globalQuests', orderBy: ['startsAt', 'desc'], limit: 12 });
  // Players must filter on status == approved (security rules); sort on the client so no composite index is needed.
  const approvedQ = useQuery<Submission>({ path: 'submissions', where: [['status', '==', 'approved']] });
  const sealedQ = useQuery<Submission>(isAdmin ? { path: 'submissions', where: [['status', '==', 'sealed']] } : null);
  const mineQ = useQuery<Submission>(uid && isPlayer ? { path: 'submissions', where: [['uid', '==', uid]] } : null);
  // The witness inbox: pending claims that name me. Equality filters only, so no composite index is needed.
  const witnessQ = useQuery<Submission>(
    uid && isPlayer ? { path: 'submissions', where: [['witnessUid', '==', uid], ['status', '==', 'pending']] } : null,
  );
  const feedQ = useQuery<FeedItem>({ path: 'feed', orderBy: ['createdAt', 'desc'], limit: FEED_LIMIT });
  const guessesQ = useQuery<Guess>(uid && isPlayer ? { path: 'guesses', where: [['guesserUid', '==', uid]] } : null);

  // Only I can read my rewards and motive (security rules), so the queries are mine alone.
  const rewardsQ = useQuery<Reward>(
    features.rewardChoice && uid && isPlayer ? { path: 'rewards', where: [['uid', '==', uid], ['status', '==', 'pending']] } : null,
  );
  // Only my own open calls are readable by a player, so the query pins both fields.
  const policeQ = useQuery<PoliceCall>(
    features.police && uid && isPlayer ? { path: 'policeCalls', where: [['uid', '==', uid], ['status', '==', 'open']] } : null,
  );
  const motiveDoc = useDocument<Motive>(features.characters && uid && isPlayer ? `motives/${uid}` : null);

  const value = useMemo<GameValue>(() => {
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsDoc.data ?? {}) };
    const sorted = [...playersQ.data].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0) || (a.displayName ?? '').localeCompare(b.displayName ?? ''),
    );
    const players = competitionRanks(
      sorted.filter((p) => p.left !== 'out'),
      (p) => p.points ?? 0,
    ) as RankedPlayer[];
    const allPlayers = [...players, ...sorted.filter((p) => p.left === 'out').map((p) => ({ ...p, rank: 0 }))];
    const playersById = new Map(allPlayers.map((p) => [p.id, p]));
    const templatesById = new Map(templatesQ.data.map((t) => [t.id, t]));
    const personalTemplates = templatesQ.data
      .filter((t) => t.scope === 'personal')
      .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    return {
      state: stateDoc.data ? { ...LOBBY, ...stateDoc.data } : LOBBY,
      settings,
      ready: !stateDoc.loading,
      players,
      activePlayers: players.filter((p) => !p.left),
      allPlayers,
      playersById,
      me: uid ? (playersById.get(uid) ?? null) : null,
      personalTemplates,
      templatesById,
      globalQuests: [...globalQ.data].sort((a, b) => tsMs(b.startsAt) - tsMs(a.startsAt)),
      approved: [...approvedQ.data].sort(byNewest),
      sealed: [...sealedQ.data].sort(byNewest),
      mySubmissions: [...mineQ.data].sort(byNewest),
      myGuesses: [...guessesQ.data].sort(byNewest),
      feed: feedQ.data,
      feedLoading: feedQ.loading,
      feedError: feedQ.error,
      witnessRequests: [...witnessQ.data].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt)),
      myRewards: [...rewardsQ.data].sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt)),
      myMotive: motiveDoc.data,
      myPoliceCall: [...policeQ.data].sort((a, b) => tsMs(a.startsAt) - tsMs(b.startsAt))[0] ?? null,
    };
  }, [
    stateDoc.data,
    stateDoc.loading,
    settingsDoc.data,
    playersQ.data,
    templatesQ.data,
    globalQ.data,
    approvedQ.data,
    sealedQ.data,
    mineQ.data,
    guessesQ.data,
    witnessQ.data,
    rewardsQ.data,
    motiveDoc.data,
    policeQ.data,
    feedQ.data,
    feedQ.loading,
    feedQ.error,
    uid,
  ]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
