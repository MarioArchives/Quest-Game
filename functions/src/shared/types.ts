// Shared data shapes for Firestore documents. Imported by the functions (server)
// and, type-only, by the web app. Timestamps are Firestore Timestamps on the wire;
// `TS` keeps this file free of SDK imports so both sides can use it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TS = any;

export type GameStatus = 'lobby' | 'active' | 'paused' | 'ended';

export interface QuietHours {
  /** Local time in the pack's time zone, "HH:MM". */
  start: string;
  /** Local time in the pack's time zone, "HH:MM". May be earlier than start (wraps past midnight). */
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
  /** Guesses each player may make in the whole game; 0 = no limit. */
  guessLimit: number;
  /** Points lost for not entering a side quest before its vote closes (0 = none). */
  sideQuestSkipPenalty: number;
  /** Reward choice (packs with rewardChoice): points to yourself for "clean". */
  cleanPoints: number;
  /** Reward choice: points taken from the player you frame. */
  framePoints: number;
  /** Random side quests drop on the timer; off, only the GM fires them (story missions, custom, random). */
  autoSideQuests: boolean;
  /** A player is a trusted confidant while their points are above this (null = off). */
  confidantAbove: number | null;
  /** A player is a person of interest while their points are below this (null = off). */
  poiBelow: number | null;
  /** Police check-ins (packs with police): a person of interest is checked every this many minutes. */
  policeEveryMin: number;
  /** A trusted confidant may tip off the police once every this many minutes. */
  policeTipEveryMin: number;
  /** Minutes a player has to answer a police check-in. */
  policeWindowMin: number;
  /** Points for passing a police check-in. */
  policePassPoints: number;
  /** Points lost for failing or missing a police check-in. */
  policeFailPenalty: number;
  /**
   * Police check-ins ring the player's phone (Twilio) when they have a verified line, and fall back to the app when
   * they don't or the call never connects. Off: every check-in is answered in the app.
   */
  policePhone: boolean;
  /** The switchboard sends everyone to the app after this many phone calls in a row never connect (to 2+ players). */
  policeBreakerAt: number;
  /** Who the police calls come from: spoken on the call and the name on the contact card. */
  policeCallerName: string;
  /**
   * The police's Telegram account (its username, no @), when the police ring on Telegram instead (the line in
   * services/telegram-police): the booking desk sends players there to say hello and expect its calls. Empty: none.
   */
  policeTelegram: string;
  /** That account's phone number, on the contact card players save, so their Telegram knows who's calling. Empty: none. */
  policeTelegramNumber: string;
  /** Scoring rule-set id (functions/src/shared/scoring); an unknown id falls back to the pack's default. */
  scoring: string;
  /** The rule sets' own numbers by param key (keys are unique across rule sets). */
  scoringParams: Record<string, number>;
}

/** game/state */
export interface GameState {
  status: GameStatus;
  startedAt: TS | null;
  endedAt: TS | null;
  nextGlobalQuestAt: TS | null;
  announcement: string | null;
  /** The game pack this game was seeded for; missing on games seeded before packs existed. */
  pack?: string | null;
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
  /** Packs with characters: who they play, set by the GM. Public; the motive is private (motives/{uid}). */
  character?: { name: string; role: string } | null;
  /** Their standing as last posted (kept by the onPlayerWritten trigger); the app works it out live from points. */
  standing?: PlayerStanding | null;
  /** Packs with police: when the last watch check-in (as a person of interest) went to this player. */
  lastCheckedAt?: TS | null;
  /** Packs with police: when this player last tipped off the police about someone else. */
  lastSnitchedAt?: TS | null;
  /**
   * When they finished the pack's onboarding (`bookIn`). Approval sets it to null, so a pack with an onboarding screen
   * shows it until then; docs from before onboarding existed have no field and count as done.
   */
  bookedAt?: TS | null;
  /** What they told the onboarding (packs with one): public, like the rest of the player doc. */
  particulars?: Particulars | null;
}

/** A player's particulars from the onboarding, each optional (`bookIn` checks them; limits in shared/booking.ts). */
export interface Particulars {
  heightCm: number | null;
  /** Their usual drink, in a word or two. */
  drink: string | null;
  /** Anything that would pick them out of a crowd. */
  marks: string | null;
}

/** Above settings.confidantAbove: a trusted confidant; below settings.poiBelow: a person of interest. */
export type PlayerStanding = 'confidant' | 'poi';

/** rewards/{submissionId}: the choice a player earns by completing a personal quest (packs with rewardChoice). */
export type RewardStatus = 'pending' | 'cleaned' | 'framed' | 'void';

export interface Reward {
  uid: string;
  submissionId: string;
  status: RewardStatus;
  createdAt: TS;
  resolvedAt?: TS | null;
  /** Who was framed. Only the owner and the GM can read rewards, so framing stays anonymous. */
  targetUid?: string | null;
  /** The points change actually applied (to the owner for clean, to the target for frame), for reversals. */
  applied?: number | null;
}

/** motives/{uid}: a player's secret motive (packs with characters). Readable by that player and the GM. */
export interface Motive {
  text: string;
  updatedAt: TS;
  /** Written by another player in a mission with entry.writesMotive (missing or null: the GM's). */
  byUid?: string | null;
  /** That mission's side quest. */
  globalQuestId?: string | null;
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
  /** Points this quest pays, copied from its template when dealt; null or missing → settings.questPoints. */
  points?: number | null;
}

export type TemplateScope = 'personal' | 'global';

/** questTemplates/{id} — the public catalogue. Quests never depend on a location. */
export interface QuestTemplate {
  title: string;
  description: string;
  scope: TemplateScope;
  /** Only for global templates; falls back to settings.globalWindowMin. */
  windowMin?: number | null;
  /** Points for completing it (personal only); null or missing → settings.questPoints. */
  points?: number | null;
  /** Retired templates are never drawn but stay in the catalogue. */
  active: boolean;
}

/**
 * Side quests: players enter while 'live', then a GM checks the entries ('checking': accept or reject each),
 * then everyone votes ('voting'); the most-voted entries win (ties all win), then 'closed'.
 */
export type GlobalQuestStatus = 'live' | 'checking' | 'voting' | 'closed';
export type GlobalQuestSource = 'timer' | 'gm-random' | 'gm-custom' | 'story';
/** How a side quest is judged: everyone votes, or everyone who enters scores (no vote). */
export type Judging = 'vote' | 'submit';

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
  /** The pack's story mission it was fired from (catalogue.story id), if any. */
  storyId?: string | null;
  /** Missing = 'vote'. */
  judging?: Judging;
  /** Missing = true: a GM checks the entries before the vote. Story missions skip the check (false). */
  gmChecks?: boolean;
  /** The fine for not entering, as it opened; missing = settings.sideQuestSkipPenalty. */
  skipPenalty?: number | null;
  /** Extra points for the fastest entry still standing when it is scored; missing = 0. */
  fastestBonus?: number;
  /** Set when it is scored: the fastest entry, if one was paid the bonus or could have been. */
  fastestSubmissionId?: string | null;
  /** Missing = 'mission'. An announcement takes no entries: it is closed as it fires. */
  kind?: 'mission' | 'announce';
  /** Open alongside the other missions until its deadline; its vote opens only when the GM opens it or an announcement names it. */
  longRun?: boolean;
  /** What an entry must be; missing = a photo and/or a caption, naming nobody. */
  entry?: StoryEntry | null;
  /** Points for every vote an entry gets; missing = none. */
  votePoints?: number | null;
  /** What each of several tied top entries gets; missing = the full bonusPoints. */
  tieBonus?: number | null;
  /** When it closes, its winning entries are recorded as this fact. */
  records?: { key: string; label: string } | null;
}

/** What an entry to a story mission is: its media, whether the caption is required, and the player it names. */
export interface StoryEntry {
  /** Missing = 'photo' (a photo and/or a caption). 'video' needs a video; 'text' needs a caption. */
  media?: 'photo' | 'video' | 'text';
  caption?: 'required';
  /** 'player': the entrant names another player; 'assigned': each player is dealt another player when it fires. */
  tag?: 'player' | 'assigned';
  /** With tag 'assigned': when it closes, each entry becomes the motive (motives/{uid}) of the player it is about. */
  writesMotive?: boolean;
}

/** One winning entry recorded on a fact. */
export interface FactEntry {
  submissionId: string;
  uid: string;
  displayName: string;
  caption: string | null;
  imagePath: string | null;
  thumbPath: string | null;
  videoPath: string | null;
  votes: number;
}

/**
 * facts/{key}: something the story has settled, from an announcement (a `value`) or from a mission's winning entries
 * (`entries`, several when tied, none when nobody won). Players and GMs read; only functions write.
 */
export interface Fact {
  key: string;
  label: string;
  value: string | null;
  entries: FactEntry[];
  storyId: string | null;
  at: TS;
}

/** assignments/{globalQuestId}_{uid}: the player `uid` was dealt for a mission with `entry.tag: 'assigned'`. Owner and GM read. */
export interface Assignment {
  globalQuestId: string;
  uid: string;
  targetUid: string;
  createdAt: TS;
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
  /** An entry that names a player (entry.tag 'player' or 'assigned'): who it is about. */
  taggedUid?: string | null;
  /** A video entry: the file under submissions/{uid}/ (thumbPath is its poster frame, if any). */
  videoPath?: string | null;
  /** The witness last told about this claim (the witness-change trigger compares it with witnessUid). */
  witnessNotifiedUid?: string | null;
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
export type Reaction =
  | {
      /** One emoji: from REACTION_EMOJI or typed from the keyboard (see src/lib/emoji.ts). */
      emoji: string;
      createdAt: TS;
    }
  | {
      /** Packs with `reactions: 'votes'`: 1 is Credible, -1 is Doubtful. */
      vote: 1 | -1;
      createdAt: TS;
    };

/**
 * game/top — the one entry pinned at the top of the log book (packs with `reactions: 'votes'`): the best score
 * (up minus down) among entries with a score of 1 or more. Written by the reaction trigger only when it changes.
 */
export interface TopPost {
  /** The holder, or null when no entry qualifies (any more). */
  feedId: string | null;
  score: number;
  up: number;
  down: number;
  /** When the holder took the top; kept while it holds. */
  since: TS | null;
  /** The entry that held it before the current one (or last, when feedId is null). */
  previousFeedId: string | null;
  /** When that previous holder took the top. */
  previousSince: TS | null;
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

/**
 * Every ledger reason. 'global-entry' is legacy (never written). 'witness' pays whoever approved a claim and
 * 'bounty' pays the target of a wrong guess (both only under rule sets that use them, e.g. heist).
 */
export const LEDGER_REASON_LIST = [
  'quest',
  'global-win',
  'global-votes',
  'global-entry',
  'exposed',
  'guess-correct',
  'guess-wrong',
  'adjust',
  'reversal',
  'fraud',
  'rejected',
  'witness',
  'bounty',
  'cleared',
  'framed',
  'skipped',
  'missed',
  'fastest',
  'police-pass',
  'police-fail',
  'police-missed',
] as const;

export type LedgerReason = (typeof LEDGER_REASON_LIST)[number];

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
  | 'left'
  /** The GM revealed the next stop on the route (packs with stops). `ref` is the stop's id. */
  | 'stop-revealed'
  /** Someone used a reward to frame this player; never names who (packs with rewardChoice). */
  | 'framed'
  /** A check-in opened (packs with checkins): `ref` is its id, `questTitle` its prompt. */
  | 'checkin-open'
  /** A player answered a check-in, with their photo and/or comment on the post. */
  | 'checkin-answer'
  /** A check-in closed; the text names who missed it. */
  | 'checkin-closed'
  /** A side quest judged by submission was scored: who took part, who was fastest, who missed it. */
  | 'global-scored'
  /** A story announcement fired (no entries): the text is its description, `ref` its side quest. */
  | 'story-beat'
  /** A player became, or stopped being, a trusted confidant or a person of interest. `uid` is the player. */
  | 'standing'
  /** A watch police check-in opened for `uid` (packs with police); `ref` is the call. */
  | 'police-call'
  /** A trusted confidant (`actorUid`) tipped off the police about `uid`, saying `note`; `ref` is the call. */
  | 'police-tip'
  /** A police check-in ended for `uid`: passed, failed or missed, with the points. */
  | 'police-result'
  /** The phone lines went down (check-ins open in the app) or came back (packs with police and phone calls). */
  | 'police-line';

export type PeriodicStatus = 'running' | 'stopped';

/**
 * periodics/{id} — a periodic mission (packs with checkins): a series the GM manages. While running, the timer sends
 * one every `intervalMin` (a check-in, drawn from `prompts`), up to `count` in all (0 = no limit). The GM can also
 * fire the next one now, end an open one, stop and start it, edit it and delete it. GM-only; functions write it.
 */
export interface Periodic {
  name: string;
  /** What it asks for; one is drawn at random each time, unused ones first. */
  prompts: string[];
  intervalMin: number;
  /** Minutes everyone has to answer each one. */
  windowMin: number;
  /** Points lost for not answering one in time (0 = none). Each one keeps the fine it opened with. */
  penalty: number;
  /** How many to send in all; 0 = no limit. */
  count: number;
  /** How many have gone out so far (by the timer or the GM). */
  sent: number;
  status: PeriodicStatus;
  /** When the next one goes out; null while stopped (or not yet scheduled). */
  nextAt: TS | null;
  createdAt: TS;
}

export type CheckinStatus = 'open' | 'closed';

/**
 * checkins/{id} — one request from a periodic mission: everyone answers with a photo or a comment before `endsAt`.
 * There are no points for answering; whoever could have answered and didn't loses `penalty` when it closes.
 */
export interface Checkin {
  /** The series it came from (null if that has been deleted since), and its name when it was sent. */
  periodicId: string | null;
  name: string;
  prompt: string;
  /** Which of its series' sends this is (1-based). */
  number: number;
  startsAt: TS;
  endsAt: TS;
  status: CheckinStatus;
  /** The penalty it opened with. */
  penalty: number;
  /** Set when it closes: who was charged for missing it (none when the GM ends it without fines). */
  missedUids: string[];
  /** Set when it closes: its time ran out, or the GM ended it early. */
  endedBy?: 'time' | 'gm';
}

/** checkins/{id}/answers/{uid} — one answer per player; written only by answerCheckin. */
export interface CheckinAnswer {
  uid: string;
  imagePath: string | null;
  thumbPath: string | null;
  caption: string | null;
  createdAt: TS;
  feedId: string;
}

export type PoliceCallKind = 'watch' | 'tip';
export type PoliceCallStatus = 'open' | 'passed' | 'failed' | 'missed' | 'cancelled';
/** How a police check-in reaches the player: a phone call (Twilio) or the app. */
export type PoliceChannel = 'phone' | 'app';
/**
 * Why a check-in is in the app although phone calls are on: the player has no verified line ('no-line'), the
 * switchboard sent everyone to the app ('lines-down'), or the phone call never connected and was re-sent here.
 */
export type PoliceFallbackReason = 'no-line' | 'lines-down' | 'never-connected';
/**
 * How a phone call ended. 'never-connected' is the system's fault (never fined); the rest are the player's: it rang
 * out, they declined it, voicemail took it, or they picked up and keyed nothing.
 */
export type PhoneCallResult = 'answered' | 'no-answer' | 'busy' | 'voicemail' | 'no-digits' | 'never-connected';

/** The phone attempt on a police check-in. Kept after the check-in is re-sent to the app, for the GM's log. */
export interface PoliceCallPhone {
  /** Twilio's call id; null until Twilio has taken the call. */
  sid: string | null;
  /** 'pending' (waiting to be dialled), 'dialling' (asking Twilio), then Twilio's own CallStatus. */
  status: string;
  /** How it ended, once it has. */
  result: PhoneCallResult | null;
  /** Why it never connected: Twilio's error code ("21215") or our own ("no-status", "not-set-up", "network"). */
  errorCode: string | null;
  placedAt: TS;
  /** When Twilio last told us anything about it; still null after 90 s means it never connected. */
  heardAt: TS | null;
  /** The switchboard's trial call while it is on probation. */
  trial: boolean;
}

/**
 * policeCalls/{id} — a police check-in (packs with police): `uid` has until `endsAt` to answer `question`. 'watch'
 * calls go to persons of interest every settings.policeEveryMin; 'tip' calls come from a trusted confidant (`byUid`,
 * with their `note`). Read by that player and the GM; only functions write it.
 */
export interface PoliceCall {
  uid: string;
  kind: PoliceCallKind;
  byUid: string | null;
  note: string | null;
  question: string;
  expected: string;
  startsAt: TS;
  endsAt: TS;
  status: PoliceCallStatus;
  /** What they answered, once they have. */
  answer: string | null;
  answeredAt: TS | null;
  /** The points it opened with. */
  passPoints: number;
  failPenalty: number;
  /** Missing on calls opened before phone calls existed: 'app'. */
  channel?: PoliceChannel;
  /** Why it is in the app while phone calls are on; null when it rang, or phone calls are off. */
  fallbackReason?: PoliceFallbackReason | null;
  /** The phone call, if one was made. */
  phone?: PoliceCallPhone | null;
  /** When a phone call that never connected was re-sent to the app (with a fresh window to answer). */
  resentAt?: TS | null;
}

/**
 * A player's police line (phones/{uid}): 'unverified' until a test call proves it, 'verified' (check-ins ring it),
 * 'failed' (the last test call didn't work), 'paused' (two check-in calls in a row never connected: the app until
 * they test it again) or 'app-only' (they'd rather answer in the app).
 */
export type PhoneStatus = 'unverified' | 'verified' | 'failed' | 'paused' | 'app-only';
/** How a test call ended: the code keyed back right, or what went wrong. */
export type PhoneTestResult = 'passed' | 'wrong-code' | 'no-digits' | 'no-answer' | 'busy' | 'voicemail' | 'never-connected';

/** A test call: it reads `code` out and the player keys it back. */
export interface PhoneTest {
  id: string;
  code: string;
  sid: string | null;
  /** 'dialling', then Twilio's own CallStatus. */
  status: string;
  result: PhoneTestResult | null;
  errorCode: string | null;
  startedAt: TS;
  heardAt: TS | null;
}

/**
 * phones/{uid} — the number the police ring (packs with police, phone calls on). Read by that player and the GM;
 * only functions write it (setPoliceLine, testPoliceLine, the voice webhook). Deleted on a reset and at game end.
 */
export interface PlayerPhone {
  /** E.164, e.g. "+447700900123". */
  number: string;
  status: PhoneStatus;
  verifiedAt: TS | null;
  /** Check-in calls in a row that never connected; two pause the line. */
  failures: number;
  /** Why it failed or paused, in words for the player and the GM. */
  reason: string | null;
  /** The number the police ring from, noted when a number is saved or a call goes out (for the contact card). */
  callerId: string | null;
  /** The latest test call. */
  test: PhoneTest | null;
  updatedAt: TS;
}

/** 'phone': calls ring; 'app': everyone answers in the app; 'probation': the next due call is a trial by phone. */
export type SwitchMode = 'phone' | 'app' | 'probation';

/**
 * game/switchboard — the game-wide breaker for police phone calls. Calls that never connect (three in a row, to at
 * least two players) or one account error switch everyone to the app; a health check every 15 min moves it to
 * probation and a trial call that connects restores it. The GM reads it; only functions write it.
 */
export interface Switchboard {
  mode: SwitchMode;
  /** The GM set this mode by hand: the health check leaves a hand-set 'app' alone. */
  manual: boolean;
  since: TS | null;
  /** Check-in calls in a row that never connected, and who they went to. */
  streak: number;
  streakUids: string[];
  /** Probation: the trial call in flight. */
  trialCallId: string | null;
  lastError: { code: string | null; message: string; at: TS } | null;
  /** The last health check: a look at the Twilio account that rings nobody. */
  health: { ok: boolean; message: string; balance: string | null; at: TS } | null;
}

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
  /** Packs with vote reactions: Credible and Doubtful counts, up minus down, and who voted which way. Missing = 0 / {}. */
  up?: number;
  down?: number;
  score?: number;
  votes?: Record<string, 1 | -1>;
  /** A 'standing' post: the standing the player now has (null: they lost it). Missing on posts from before. */
  standing?: PlayerStanding | null;
  /** A video entry's file, once revealed. */
  videoPath?: string | null;
  /** An entry that names a player, once revealed. */
  taggedUid?: string | null;
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
  /** The player's approved post with the most reactions (ties → earliest); in a votes pack, the highest score. */
  topPhoto: { submissionId: string; thumbPath: string | null; imagePath: string | null; caption: string | null; reactionCount: number; score?: number } | null;
  venues: { id: string; name: string }[];
  rerollsUsed: number;
  /** settings.rerollLimit plus the player's GM extras when the game ended. Absent on older wraps. */
  rerollAllowance?: number;
  award: Award;
}

/** stops/{id} — a place on the GM's route (packs with the stops feature). Players only ever see revealed stops. */
export interface Stop {
  name: string;
  lat: number;
  lng: number;
  /** Place on the route, a whole number 1–999 the GM controls (ties break by createdAt, then id). */
  order: number;
  /** When the group arrives; null while the GM does not know yet. */
  startsAt: TS | null;
  /** When the group leaves; missing or null → until the next stop starts. */
  endsAt?: TS | null;
  /** False hides the stop from players until the GM reveals it. */
  revealed: boolean;
  createdAt: TS;
  /** The real bar, when the GM picked one from the map's bar search: its address, for directions. */
  address?: string | null;
  /** Where that bar came from, e.g. "osm:node/123" (OpenStreetMap). */
  placeRef?: string | null;
  /** The bar's own name, which Google Maps knows it by; `name` may be the GM's own ("Scene of the crime"). */
  placeName?: string | null;
}

/** Static schedule data from a pack (venues and events). */
export interface Venue {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface ScheduleEvent {
  id: string;
  act: string;
  venueId: string;
  stage: string | null;
  /** Day name derived from start in the pack's time zone, e.g. "Saturday". */
  day: string;
  /** ISO 8601 with the pack's UTC offset, e.g. "2026-10-10T19:00:00+01:00". */
  start: string;
  end: string | null;
  genre: string | null;
  type: string | null;
  description: string | null;
}
