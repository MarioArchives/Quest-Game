// The GM settings form as plain data: settings in, the form's strings out, and back, with the form's checks.
// Kept free of the pack and React so it can be tested on its own.
import { standingSettingsProblem } from '../../../functions/src/shared/standing.ts';
import { RULESETS, type ParamSpec, type Settings } from '../../shared';

export type NumKey =
  | 'starterQuestCount'
  | 'rerollLimit'
  | 'questPoints'
  | 'sideQuestPoints'
  | 'exposePenalty'
  | 'correctGuessReward'
  | 'wrongGuessCost'
  | 'guessCooldownMin'
  | 'fraudPenalty'
  | 'rejectPenalty'
  | 'globalIntervalMin'
  | 'globalIntervalMax'
  | 'globalWindowMin'
  | 'voteWindowMin'
  | 'guessLimit'
  | 'sideQuestSkipPenalty'
  | 'cleanPoints'
  | 'framePoints'
  | 'policeEveryMin'
  | 'policeTipEveryMin'
  | 'policeWindowMin'
  | 'policePassPoints'
  | 'policeFailPenalty';
export type FlagKey = 'refillOnComplete' | 'revealOnComplete' | 'pointsFloorZero';
/** The two standing lines: whole numbers (negatives allowed) or blank for off. */
export type StandingKey = 'confidantAbove' | 'poiBelow';

/** Each number's allowed range (whole numbers). */
export const LIMITS: Record<NumKey, [min: number, max: number]> = {
  starterQuestCount: [1, 20],
  rerollLimit: [0, 100],
  questPoints: [0, 10000],
  sideQuestPoints: [0, 10000],
  rejectPenalty: [0, 10000],
  fraudPenalty: [0, 10000],
  exposePenalty: [0, 10000],
  correctGuessReward: [0, 10000],
  wrongGuessCost: [0, 10000],
  guessCooldownMin: [0, 1440],
  guessLimit: [0, 1000],
  globalIntervalMin: [1, 1440],
  globalIntervalMax: [1, 1440],
  globalWindowMin: [1, 180],
  voteWindowMin: [1, 180],
  sideQuestSkipPenalty: [0, 10000],
  cleanPoints: [0, 10000],
  framePoints: [0, 10000],
  policeEveryMin: [1, 1440],
  policeTipEveryMin: [1, 1440],
  policeWindowMin: [1, 120],
  policePassPoints: [0, 10000],
  policeFailPenalty: [0, 10000],
};

export const NUM_KEYS = Object.keys(LIMITS) as NumKey[];
export const STANDING_LIMIT = 100000;

/** The form's state: every number as typed, the toggles and the rule set's params. */
export interface SettingsForm {
  numbers: Record<NumKey, string>;
  /** The standing lines as typed; blank = off. */
  standing: Record<StandingKey, string>;
  /** Scoring rule-set id. */
  scoring: string;
  /** Every rule set's params as typed, by param key; only the chosen rule set's are shown and saved. */
  params: Record<string, string>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  flags: Record<FlagKey, boolean>;
  /** Edited in the Story section; carried so a save keeps it. */
  autoSideQuests: boolean;
}

const RULESET_LIST = Object.values(RULESETS);
/** The rule set picked in the form; an unknown id shows as the first one, like the server's fallback. */
export const rulesFor = (id: string) => RULESETS[id] ?? RULESET_LIST[0]!;
const allParams = (): ParamSpec[] => RULESET_LIST.flatMap((rules) => [...rules.params]);

export function fromSettings(s: Settings): SettingsForm {
  const numbers = Object.fromEntries(NUM_KEYS.map((key) => [key, String(s[key])])) as Record<NumKey, string>;
  const params = Object.fromEntries(allParams().map((p) => [p.key, String(s.scoringParams?.[p.key] ?? p.default)]));
  return {
    numbers,
    standing: { confidantAbove: s.confidantAbove == null ? '' : String(s.confidantAbove), poiBelow: s.poiBelow == null ? '' : String(s.poiBelow) },
    scoring: rulesFor(s.scoring).id,
    params,
    quietOn: s.quietHours !== null,
    quietStart: s.quietHours?.start ?? '01:00',
    quietEnd: s.quietHours?.end ?? '10:00',
    flags: { refillOnComplete: s.refillOnComplete, revealOnComplete: s.revealOnComplete, pointsFloorZero: s.pointsFloorZero },
    autoSideQuests: s.autoSideQuests,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const parseLine = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw.trim()));

/** Problems by field (a number's key, `param:<key>`, a standing key or a quiet-hours key); empty when it can be saved. */
export function validateSettingsForm(form: SettingsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of NUM_KEYS) {
    const [min, max] = LIMITS[key];
    const raw = form.numbers[key].trim();
    if (!/^\d+$/.test(raw)) errors[key] = 'Whole number, 0 or more';
    else if (Number(raw) < min || Number(raw) > max) errors[key] = `${min} to ${max}`;
  }
  for (const p of rulesFor(form.scoring).params) {
    const raw = form.params[p.key]?.trim() ?? '';
    if (!/^\d+$/.test(raw)) errors[`param:${p.key}`] = 'Whole number, 0 or more';
    else if (Number(raw) < p.min || Number(raw) > p.max) errors[`param:${p.key}`] = `${p.min} to ${p.max}`;
  }
  if (!errors.globalIntervalMin && !errors.globalIntervalMax && Number(form.numbers.globalIntervalMax) < Number(form.numbers.globalIntervalMin)) {
    errors.globalIntervalMax = 'At least the shortest gap';
  }
  for (const key of ['confidantAbove', 'poiBelow'] as const) {
    const raw = form.standing[key].trim();
    if (raw !== '' && (!/^-?\d+$/.test(raw) || Math.abs(Number(raw)) > STANDING_LIMIT)) errors[key] = 'Whole number, or blank for off';
  }
  if (!errors.confidantAbove && !errors.poiBelow) {
    const problem = standingSettingsProblem({ confidantAbove: parseLine(form.standing.confidantAbove), poiBelow: parseLine(form.standing.poiBelow) });
    if (problem) errors.poiBelow = problem;
  }
  if (form.quietOn) {
    if (!TIME.test(form.quietStart)) errors.quietStart = 'Use HH:MM';
    if (!TIME.test(form.quietEnd)) errors.quietEnd = 'Use HH:MM';
  }
  return errors;
}

export function toSettings(form: SettingsForm): Settings {
  const n = (key: NumKey) => Number(form.numbers[key].trim());
  return {
    starterQuestCount: n('starterQuestCount'),
    rerollLimit: n('rerollLimit'),
    questPoints: n('questPoints'),
    sideQuestPoints: n('sideQuestPoints'),
    exposePenalty: n('exposePenalty'),
    correctGuessReward: n('correctGuessReward'),
    wrongGuessCost: n('wrongGuessCost'),
    guessCooldownMin: n('guessCooldownMin'),
    globalIntervalMin: n('globalIntervalMin'),
    globalIntervalMax: n('globalIntervalMax'),
    globalWindowMin: n('globalWindowMin'),
    quietHours: form.quietOn ? { start: form.quietStart, end: form.quietEnd } : null,
    fraudPenalty: n('fraudPenalty'),
    rejectPenalty: n('rejectPenalty'),
    voteWindowMin: n('voteWindowMin'),
    guessLimit: n('guessLimit'),
    sideQuestSkipPenalty: n('sideQuestSkipPenalty'),
    cleanPoints: n('cleanPoints'),
    framePoints: n('framePoints'),
    refillOnComplete: form.flags.refillOnComplete,
    revealOnComplete: form.flags.revealOnComplete,
    pointsFloorZero: form.flags.pointsFloorZero,
    autoSideQuests: form.autoSideQuests,
    confidantAbove: parseLine(form.standing.confidantAbove),
    poiBelow: parseLine(form.standing.poiBelow),
    policeEveryMin: n('policeEveryMin'),
    policeTipEveryMin: n('policeTipEveryMin'),
    policeWindowMin: n('policeWindowMin'),
    policePassPoints: n('policePassPoints'),
    policeFailPenalty: n('policeFailPenalty'),
    scoring: form.scoring,
    scoringParams: Object.fromEntries(rulesFor(form.scoring).params.map((p) => [p.key, Number(form.params[p.key]!.trim())])),
  };
}
