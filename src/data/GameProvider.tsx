import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { db } from '../firebase';
import {
  competitionRanks,
  DEFAULT_SETTINGS,
  type Doc,
  type FeedItem,
  type GameState,
  type GlobalQuest,
  type Guess,
  type Player,
  type QuestTemplate,
  type Settings,
  type Submission,
} from '../shared';
import { useSession } from '../session/SessionProvider';
import { tsMs, useCollection, useDocument } from './hooks';

export type RankedPlayer = Doc<Player> & { rank: number };

export interface GameValue {
  /** game/state; a fresh lobby until the doc exists. */
  state: GameState;
  /** game/settings merged over the defaults. */
  settings: Settings;
  /** False until the first game/state snapshot has arrived. */
  ready: boolean;
  /** Players by points (highest first), with competition ranks (ties share a rank). */
  players: RankedPlayer[];
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
  const playersQ = useCollection<Player>('players', () => collection(db, 'players'));
  const templatesQ = useCollection<QuestTemplate>('questTemplates', () => collection(db, 'questTemplates'));
  const globalQ = useCollection<GlobalQuest>('globalQuests', () =>
    query(collection(db, 'globalQuests'), orderBy('startsAt', 'desc'), limit(12)),
  );
  // Players must filter on status == approved (security rules); sort on the client so no composite index is needed.
  const approvedQ = useCollection<Submission>('submissions:approved', () =>
    query(collection(db, 'submissions'), where('status', '==', 'approved')),
  );
  const sealedQ = useCollection<Submission>(isAdmin ? 'submissions:sealed' : null, () =>
    query(collection(db, 'submissions'), where('status', '==', 'sealed')),
  );
  const mineQ = useCollection<Submission>(uid && isPlayer ? `submissions:uid:${uid}` : null, () =>
    query(collection(db, 'submissions'), where('uid', '==', uid)),
  );
  // The witness inbox: pending claims that name me. Equality filters only, so no composite index is needed.
  const witnessQ = useCollection<Submission>(uid && isPlayer ? `submissions:witness:${uid}` : null, () =>
    query(collection(db, 'submissions'), where('witnessUid', '==', uid), where('status', '==', 'pending')),
  );
  const feedQ = useCollection<FeedItem>('feed:latest', () => query(collection(db, 'feed'), orderBy('createdAt', 'desc'), limit(FEED_LIMIT)));
  const guessesQ = useCollection<Guess>(uid && isPlayer ? `guesses:${uid}` : null, () =>
    query(collection(db, 'guesses'), where('guesserUid', '==', uid)),
  );

  const value = useMemo<GameValue>(() => {
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsDoc.data ?? {}) };
    const sorted = [...playersQ.data].sort(
      (a, b) => (b.points ?? 0) - (a.points ?? 0) || (a.displayName ?? '').localeCompare(b.displayName ?? ''),
    );
    const players = competitionRanks(sorted, (p) => p.points ?? 0) as RankedPlayer[];
    const playersById = new Map(players.map((p) => [p.id, p]));
    const templatesById = new Map(templatesQ.data.map((t) => [t.id, t]));
    const personalTemplates = templatesQ.data
      .filter((t) => t.scope === 'personal')
      .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    return {
      state: stateDoc.data ? { ...LOBBY, ...stateDoc.data } : LOBBY,
      settings,
      ready: !stateDoc.loading,
      players,
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
