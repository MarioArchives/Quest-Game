// One place for the server/client shared definitions (they live in functions/src/shared so the
// functions and security-rule tests can import them too).
export type {
  Admin,
  Award,
  FeedItem,
  FeedType,
  FestivalEvent,
  FinalStandings,
  GameState,
  GameStatus,
  GeoPoint,
  GlobalQuest,
  GlobalQuestSource,
  GlobalQuestStatus,
  Guess,
  JoinRequest,
  LedgerEntry,
  LedgerReason,
  Player,
  PlayerLocation,
  Quest,
  QuestStatus,
  QuestTemplate,
  Reaction,
  ReactionEmoji,
  Settings,
  Standing,
  Submission,
  SubmissionKind,
  SubmissionStatus,
  Venue,
  Wrap,
} from '../functions/src/shared/types';
export { REACTION_EMOJI } from '../functions/src/shared/types';
export { DEFAULT_SETTINGS, DISPLAY_NAME_MAX } from '../functions/src/shared/settings';
export { competitionRanks } from '../functions/src/shared/ranking';
export { tallyVotes } from '../functions/src/shared/votes';

/** A Firestore document with its id. */
export type Doc<T> = T & { id: string };

/** Evidence caption (matches the server). */
export const CAPTION_MAX = 280;
/** A witness's approval / rejection comment, and the GM's notes (matches the server). */
export const NOTE_MAX = 280;
