// One place for the server/client shared definitions (they live in functions/src/shared so the
// functions and security-rule tests can import them too).
export type {
  Admin,
  Assignment,
  Fact,
  FactEntry,
  Award,
  FeedItem,
  FeedType,
  TopPost,
  ScheduleEvent,
  FinalStandings,
  GameState,
  GameStatus,
  GeoPoint,
  GlobalQuest,
  GlobalQuestSource,
  GlobalQuestStatus,
  Guess,
  JoinRequest,
  Judging,
  LedgerEntry,
  LedgerReason,
  Particulars,
  Player,
  PlayerLocation,
  PlayerStanding,
  PoliceCall,
  PoliceCallKind,
  PoliceCallPhone,
  PoliceCallStatus,
  PoliceChannel,
  PoliceFallbackReason,
  PhoneCallResult,
  PhoneStatus,
  PhoneTest,
  PhoneTestResult,
  PlayerPhone,
  Switchboard,
  SwitchMode,
  Quest,
  QuestStatus,
  QuestTemplate,
  Reward,
  Checkin,
  CheckinAnswer,
  Periodic,
  RewardStatus,
  Motive,
  Reaction,
  ReactionEmoji,
  Settings,
  Standing,
  Submission,
  SubmissionKind,
  SubmissionStatus,
  Stop,
  Venue,
  Wrap,
} from '../functions/src/shared/types';
export type { ParamSpec } from '../functions/src/shared/scoring/types';
export { RULESETS } from '../functions/src/shared/scoring/index';
export { LEDGER_REASON_LIST, REACTION_EMOJI } from '../functions/src/shared/types';
export { DEFAULT_SETTINGS, DISPLAY_NAME_MAX } from '../functions/src/shared/settings';
export { competitionRanks } from '../functions/src/shared/ranking';
export { rerollAllowance, rerollsLeft } from '../functions/src/shared/rerolls';
export { VOTABLE_FEED_TYPES, canHoldTop, takesVote } from '../functions/src/shared/feedVotes';
export { tallyVotes } from '../functions/src/shared/votes';
export { drawTemplate } from '../functions/src/shared/draw';
export { PERIODIC_LIMITS, periodicDone, periodicProblems } from '../functions/src/shared/periodics';
export { describePhoneError, describeTestResult, formatPhone, isSimulatedSid, normalisePhone, policeVCard } from '../functions/src/shared/phone';
export type { SimulatedAction, SimulatedTurn } from '../functions/src/shared/phone';
export { DRINK_MAX, HEIGHT_MAX_CM, HEIGHT_MIN_CM, MARKS_MAX, needsBooking } from '../functions/src/shared/booking';

/** A Firestore document with its id. */
export type Doc<T> = T & { id: string };

/** Evidence caption (matches the server). */
export const CAPTION_MAX = 280;
/** A witness's approval / rejection comment, and the GM's notes (matches the server). */
export const NOTE_MAX = 280;
