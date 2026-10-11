// Shared data shapes for Firestore documents. Imported by the functions (server)
// and, type-only, by the web app. Timestamps are Firestore Timestamps on the wire;
// `TS` keeps this file free of SDK imports so both sides can use it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TS = any;

export type GameStatus = 'lobby' | 'active' | 'paused' | 'ended';

export interface QuietHours {
  /** Local Europe/London time, "HH:MM". */
  start: string;
  /** Local Europe/London time, "HH:MM". May be earlier than start (wraps past midnight). */
  end: string;
}

export interface Settings {
  starterQuestCount: number;
  rerollLimit: number;
  questPoints: number;
  sideQuestPoints: number;
  exposePenalty: number;
  correctGuessReward: number;
  wrongGuessCost: number;
  guessCooldownMin: number;
  globalIntervalMin: number;
  globalIntervalMax: number;
  globalWindowMin: number;
  globalEntryPoints: number;
  quietHours: QuietHours | null;
  /** Fine charged when the GM overrides an approved submission as fraud. */
  fraudPenalty: number;
  /** Points lost when a witness (or GM) rejects a claim. */
  rejectPenalty: number;
  /** How long side-quest voting stays open. */
  voteWindowMin: number;
  refillOnComplete: boolean;
  revealOnComplete: boolean;
  pointsFloorZero: boolean;
}

/** game/state */
export interface GameState {
  status: GameStatus;
  startedAt: TS | null;
  endedAt: TS | null;
  nextGlobalQuestAt: TS | null;
  announcement: string | null;
}

/** admins/{uid} */
export interface Admin {
  email: string;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';

/** joinRequests/{uid} */
export interface JoinRequest {
  uid: string;
  displayName: string;
  photoURL: string | null;
  email: string | null;
  status: JoinRequestStatus;
  createdAt: TS;
  updatedAt: TS;
  reviewedBy?: string | null;
  reviewedAt?: TS | null;
}

/** players/{uid} */
export interface Player {
  displayName: string;
  photoURL: string | null;
  joinedAt: TS;
  points: number;
  rerollsUsed: number;
  /** Rerolls the GM granted on top of settings.rerollLimit. Absent on older docs (= 0). */
  extraRerolls?: number;
  questsCompleted: number;
  /**
   * Set by the GM when the player has left: 'frozen' keeps them on the leaderboard, 'out' hides them from it and
   * from the final standings. Either way they can't play, be guessed or be a witness. Absent/null = playing.
   */
  left?: PlayerLeft | null;
  leftAt?: TS | null;
}

export type PlayerLeft = 'frozen' | 'out';

export type QuestStatus = 'active' | 'submitted' | 'done' | 'exposed' | 'replaced';

/** players/{uid}/quests/{id} — the secret hand */
export interface Quest {
  templateId: string;
  title: string;
  description: string;
  status: QuestStatus;
  assignedAt: TS;
  submissionId?: string | null;
  completedAt?: TS | null;
  exposedBy?: string | null;
  exposedAt?: TS | null;
}

export type TemplateScope = 'personal' | 'global';

/** questTemplates/{id} — the public catalogue. Quests never depend on a location. */
export interface QuestTemplate {
  title: string;
  description: string;
  scope: TemplateScope;
  /** Only for global templates; falls back to settings.globalWindowMin. */
  windowMin?: number | null;
  /** Retired templates are never drawn but stay in the catalogue. */
  active: boolean;
}

/**
 * Side quests: players enter while 'live', then a GM checks the entries ('checking': accept or reject each),
 * then everyone votes ('voting'); the most-voted entries win (ties all win), then 'closed'.
 */
export type GlobalQuestStatus = 'live' | 'checking' | 'voting' | 'closed';
export type GlobalQuestSource = 'timer' | 'gm-random' | 'gm-custom';

/** globalQuests/{id}. Votes live server-only in globalQuests/{id}/votes/{voterUid}. */
export interface GlobalQuest {
  title: string;
  description: string;
  bonusPoints: number;
  source: GlobalQuestSource;
  templateId: string | null;
  startsAt: TS;
  /** End of the entry window. */
  endsAt: TS;
  status: GlobalQuestStatus;
  /** Set when voting opens. */
  votingEndsAt: TS | null;
  /** Everyone tied on the most votes (empty if nobody won). */
  winnerUids: string[];
  winningSubmissionIds: string[];
  /** Votes per entry (submission id), published when voting closes. */
  tally: Record<string, number> | null;
}

/** globalQuests/{id}/votes/{voterUid} — server only */
export interface Vote {
  submissionId: string;
  createdAt: TS;
}

export type SubmissionKind = 'personal' | 'global';
/**
 * 'sealed' = a side-quest entry that is hidden from other players until voting opens, when it becomes
 * 'approved' (visible and votable). A GM can reject it while the side quest is 'checking'.
 */
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'sealed';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

/**
 * submissions/{id} — a claim. For kind 'global', questId is the globalQuests id.
 * The submitter names a witness (another player) who approves or rejects it (with an optional note);
 * the GM can do the same for anyone else's and can override an approval as fraud. Nobody reviews their
 * own. Evidence (photo and/or caption) is added after approval via addEvidence.
 */
export interface Submission {
  uid: string;
  kind: SubmissionKind;
  questId: string;
  /** The player asked to approve it. The owner may change it while pending. */
  witnessUid: string;
  createdAt: TS;
  status: SubmissionStatus;
  // Server-only fields below.
  /** Evidence, added by the owner after approval. */
  imagePath?: string | null;
  thumbPath?: string | null;
  caption?: string | null;
  evidenceAt?: TS | null;
  /** Legacy: no longer attached by the client. */
  location?: GeoPoint | null;
  /** The feed post announcing the approval (updated with evidence). */
  feedId?: string | null;
  processedAt?: TS | null;
  /** Copied from the claimed quest by the trigger, so the witness can judge it. */
  claimTitle?: string | null;
  claimDescription?: string | null;
  pointsAwarded?: number;
  reviewedBy?: string | null;
  reviewedAt?: TS | null;
  reviewNote?: string | null;
  rejectReason?: string | null;
  questTitle?: string | null;
  refillQuestId?: string | null;
  /** Side-quest entries: the GM's check once entries close. 'rejected' = thrown out with no fine (not a disqualification). */
  checked?: 'accepted' | 'rejected' | null;
}

/** The quick picks in the reaction picker. Players can also react with any single emoji from their keyboard. */
export const REACTION_EMOJI = [
  '🔥', '😂', '😍', '👏', '🤘', '😮',
  '🎸', '🎤', '🥁', '🎺', '🎷', '🎻',
  '🎶', '💃', '🕺', '🙌', '🤩', '🥳',
  '😎', '🤯', '😱', '🥲', '😭', '🤔',
  '👀', '💯', '❤️', '🍺', '🫶', '👑',
] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

/** feed/{id}/reactions/{uid} — one per player per post (there are no comments) */
export interface Reaction {
  /** One emoji: from REACTION_EMOJI or typed from the keyboard (see src/lib/emoji.ts). */
  emoji: string;
  createdAt: TS;
}

/** pushTokens/{sha256(token)} — a device that takes notifications. Server only. */
export interface PushToken {
  uid: string;
  token: string;
  createdAt: TS;
  updatedAt: TS;
}

/** guesses/{id} */
export interface Guess {
  guesserUid: string;
  targetUid: string;
  templateId: string;
  correct: boolean;
  createdAt: TS;
}

/** guessCooldowns/{guesserUid}_{targetUid} — server only */
export interface GuessCooldown {
  lastAt: TS;
}

/** locations/{uid} */
export interface PlayerLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: TS;
}

export type LedgerReason =
  | 'quest'
  | 'global-win'
  | 'global-entry'
  | 'exposed'
  | 'guess-correct'
  | 'guess-wrong'
  | 'adjust'
  | 'reversal'
  | 'fraud'
  | 'rejected';

/** pointsLedger/{id} */
export interface LedgerEntry {
  uid: string;
  /** The change actually applied (may differ from the requested change when pointsFloorZero clamps). */
  delta: number;
  reason: LedgerReason;
  ref: string | null;
  /** uid of the GM for manual adjustments / reviews, 'system' or 'auto' otherwise. */
  by: string;
  note?: string | null;
  createdAt: TS;
}

export type FeedType =
  | 'join'
  | 'approved'
  | 'rejected'
  | 'fraud'
  | 'exposed'
  | 'global-open'
  | 'checking'
  | 'voting-open'
  | 'global-won'
  | 'announcement'
  | 'status'
  | 'adjust'
  | 'left';

/** feed/{id} — the Home feed. Everything that happens in the game posts here. */
export interface FeedItem {
  type: FeedType;
  text: string;
  /** Whose post it is (the player it is about), if any. */
  uid: string | null;
  ref: string | null;
  createdAt: TS;
  photoURL?: string | null;
  /** Signed points change shown on the post (e.g. 100, -25), if any. */
  points?: number | null;
  /** Who acted: the witness or GM who reviewed, the guesser, the GM who adjusted. */
  actorUid?: string | null;
  /** The reviewer's approval / rejection comment, or the GM's adjustment reason. */
  note?: string | null;
  questTitle?: string | null;
  submissionId?: string | null;
  /** Evidence added to an approval post. */
  imagePath?: string | null;
  thumbPath?: string | null;
  caption?: string | null;
  /** Set on an approval post that the GM later overrode as fraud. */
  flagged?: boolean;
  /** Maintained by a trigger from feed/{id}/reactions. */
  reactionCount?: number;
}

export interface Standing {
  uid: string;
  displayName: string;
  photoURL: string | null;
  points: number;
  rank: number;
}

/** game/final */
export interface FinalStandings {
  standings: Standing[];
  endedAt: TS;
}

export type AwardKey =
  | 'sharpshooter'
  | 'untouchable'
  | 'paparazzo'
  | 'night-owl'
  | 'side-hustler'
  | 'globetrotter'
  | 'detective'
  | 'gambler'
  | 'good-sport';

export interface Award {
  key: AwardKey;
  title: string;
  description: string;
}

/** wraps/{uid} */
export interface Wrap {
  uid: string;
  displayName: string;
  photoURL: string | null;
  rank: number;
  points: number;
  playerCount: number;
  /** Cumulative points over time, sorted by t (epoch ms). Starts with {t: joinedAt, points: 0}. */
  pointsSeries: { t: number; points: number }[];
  completed: { submissionId: string; title: string; thumbPath: string | null; imagePath: string | null; caption: string | null }[];
  sideQuestsWon: { globalQuestId: string; title: string }[];
  /** Every quest the player held except ones rerolled away ('replaced'). */
  hand: { templateId: string; title: string; description: string; status: QuestStatus }[];
  guessStats: { made: number; hits: number; pointsTaken: number };
  exposedBy: { uid: string; displayName: string; title: string }[];
  /** The player's approved post with the most reactions (ties → earliest). */
  topPhoto: { submissionId: string; thumbPath: string | null; imagePath: string | null; caption: string | null; reactionCount: number } | null;
  venues: { id: string; name: string }[];
  rerollsUsed: number;
  /** settings.rerollLimit plus the player's GM extras when the game ended. Absent on older wraps. */
  rerollAllowance?: number;
  award: Award;
}

/** Static festival data (public/data/*.json and functions/src/data/venues.json). */
export interface Venue {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface FestivalEvent {
  id: string;
  act: string;
  venueId: string;
  stage: string | null;
  /** Festival day derived from start in Europe/London, e.g. "Saturday". */
  day: string;
  /** ISO 8601 with the Europe/London offset, e.g. "2026-10-10T19:00:00+01:00". */
  start: string;
  end: string | null;
  genre: string | null;
  type: string | null;
  description: string | null;
}
