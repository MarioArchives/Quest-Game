import type { Settings } from './types.js';

/** Defaults for game/settings. Every value is editable by the GM. */
export const DEFAULT_SETTINGS: Settings = {
  starterQuestCount: 5,
  rerollLimit: 10,
  questPoints: 100,
  sideQuestPoints: 100,
  exposePenalty: 50,
  correctGuessReward: 25,
  wrongGuessCost: 10,
  guessCooldownMin: 10,
  globalIntervalMin: 60,
  globalIntervalMax: 120,
  globalWindowMin: 40,
  quietHours: { start: '01:00', end: '10:00' },
  fraudPenalty: 50,
  rejectPenalty: 25,
  voteWindowMin: 20,
  /** Five quest slots per game: completing a quest does not deal a new one (fails, exposures and rerolls do). */
  refillOnComplete: false,
  revealOnComplete: true,
  pointsFloorZero: false,
  guessLimit: 0,
  sideQuestSkipPenalty: 0,
  cleanPoints: 50,
  framePoints: 50,
  autoSideQuests: true,
  confidantAbove: null,
  poiBelow: null,
  policeEveryMin: 30,
  policeTipEveryMin: 60,
  policeWindowMin: 5,
  policePassPoints: 5,
  policeFailPenalty: 5,
  /** Phone calls (Twilio) are off until the GM switches them on, with the setup in design/twilio-setup.md done. */
  policePhone: false,
  policeBreakerAt: 3,
  policeCallerName: 'Police',
  policeTelegram: '',
  policeTelegramNumber: '',
  scoring: 'classic',
  scoringParams: {},
};

/** Max distance (metres) at which a position counts as "at" a venue. */
export const VENUE_RADIUS_M = 75;

export const DISPLAY_NAME_MAX = 24;
export const COMMENT_MAX = 500;
