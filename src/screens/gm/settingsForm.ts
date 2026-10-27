// The GM settings form as plain data: settings in, the form's strings out, and back, with the form's checks.
// Kept free of the pack and React so it can be tested on its own.
import { CALLER_NAME_MAX, normalisePhone } from '../../../functions/src/shared/phone.ts';
import { standingSettingsProblem } from '../../../functions/src/shared/standing.ts';
import { RULESETS, type ParamSpec, type Settings, type VoteStyle } from '../../shared';
import { telegramUsername } from '../../lib/telegram';

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
  | 'topEntryPoints'
  | 'verdictPoints'
  | 'verdictWindowMin'
  | 'verdictMinVotes'
  | 'cleanPoints'
  | 'framePoints'
  | 'policeEveryMin'
  | 'policeTipEveryMin'
  | 'policeWindowMin'
  | 'policePassPoints'
  | 'policeFailPenalty'
  | 'policeHeardPenalty'
  | 'policeBreakerAt';
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
  topEntryPoints: [0, 100],
  verdictPoints: [0, 100],
  verdictWindowMin: [5, 240],
  verdictMinVotes: [1, 50],
  cleanPoints: [0, 10000],
  framePoints: [0, 10000],
  policeEveryMin: [1, 1440],
  policeTipEveryMin: [1, 1440],
  policeWindowMin: [1, 120],
  policePassPoints: [0, 10000],
  policeFailPenalty: [0, 10000],
  policeHeardPenalty: [0, 10000],
  policeBreakerAt: [2, 20],
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
  /** How everyone votes on a side quest. */
  voteStyle: VoteStyle;
  /** Every rule set's params as typed, by param key; only the chosen rule set's are shown and saved. */
  params: Record<string, string>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  flags: Record<FlagKey, boolean>;
  /** Edited in the Story section; carried so a save keeps it. */
  autoSideQuests: boolean;
  /** Police check-ins ring players' phones (Twilio). */
  policePhone: boolean;
  /** Who the police calls are from, as typed. */
  callerName: string;
  /** The police's Telegram account, as typed (a username, @name or t.me link); blank for none. */
  telegram: string;
  /** That account's phone number, as typed (with its country code); blank for none. */
  telegramNumber: string;
  /** Players with a Telegram line get case updates in the police chat instead of push. */
  policeNotices: boolean;
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
    voteStyle: s.voteStyle === 'yesno' ? 'yesno' : 'pick',
    params,
    quietOn: s.quietHours !== null,
    quietStart: s.quietHours?.start ?? '01:00',
    quietEnd: s.quietHours?.end ?? '10:00',
    flags: { refillOnComplete: s.refillOnComplete, revealOnComplete: s.revealOnComplete, pointsFloorZero: s.pointsFloorZero },
    autoSideQuests: s.autoSideQuests,
    policePhone: s.policePhone,
    callerName: s.policeCallerName,
    telegram: s.policeTelegram ?? '',
    telegramNumber: s.policeTelegramNumber ?? '',
    policeNotices: s.policeNotices === true,
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const parseLine = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw.trim()));

/** Problems by field (a number's key, `param:<key>`, a standing key, a quiet-hours key, callerName, telegram or telegramNumber); empty when it can be saved. */
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
  const caller = form.callerName.trim();
  if (caller.length < 1 || caller.length > CALLER_NAME_MAX) errors.callerName = `1 to ${CALLER_NAME_MAX} characters`;
  if (form.telegram.trim() !== '' && !telegramUsername(form.telegram)) errors.telegram = '5 to 32 letters, digits or _, starting with a letter';
  if (form.telegramNumber.trim() !== '' && !normalisePhone(form.telegramNumber, '')) errors.telegramNumber = 'With its country code, like +44 7700 900123';
  if (form.quietOn) {
    if (!TIME.test(form.quietStart)) errors.quietStart = 'Use HH:MM';
    if (!TIME.test(form.quietEnd)) errors.quietEnd = 'Use HH:MM';
  }
  return errors;
}

/** The form's groups, in order (a pack's GM screen can show them as folds, one open at a time). */
export type FoldId = 'hands' | 'points' | 'guessing' | 'sideQuests' | 'rewards' | 'police' | 'standings' | 'scoring' | 'rules';

/** Minus signs, not hyphens, in a number as typed. */
const minus = (raw: string) => raw.trim().replace(/^-/, '−');

/** A closed fold's line: what is in it now, as typed ("3 dealt · 2 rerolls", "every 20–40 min", "Classic"). */
export function foldSummary(id: FoldId, form: SettingsForm): string {
  const n = (key: NumKey) => form.numbers[key].trim();
  switch (id) {
    case 'hands':
      return `${n('starterQuestCount')} dealt · ${n('rerollLimit')} ${n('rerollLimit') === '1' ? 'reroll' : 'rerolls'}`;
    case 'points':
      return `+${n('questPoints')} / −${n('rejectPenalty')} · fraud −${n('fraudPenalty')}`;
    case 'guessing': {
      const odds = n('correctGuessReward') === n('wrongGuessCost') ? `±${n('correctGuessReward')}` : `+${n('correctGuessReward')} / −${n('wrongGuessCost')}`;
      return `${odds} · ${n('guessLimit') === '0' ? 'no limit' : `${n('guessLimit')} each`}`;
    }
    case 'sideQuests': {
      const every = n('globalIntervalMin') === n('globalIntervalMax') ? `every ${n('globalIntervalMin')} min` : `every ${n('globalIntervalMin')}–${n('globalIntervalMax')} min`;
      return form.voteStyle === 'yesno' ? `${every} · yes or no` : every;
    }
    case 'rewards':
      return `+${n('cleanPoints')} / −${n('framePoints')}`;
    case 'police':
      return `every ${n('policeEveryMin')} min · phone ${form.policePhone ? 'on' : 'off'}${telegramUsername(form.telegram) || normalisePhone(form.telegramNumber, '') ? ' · Telegram' : ''}${form.policeNotices ? ' · case updates' : ''}`;
    case 'standings': {
      const above = form.standing.confidantAbove.trim();
      const below = form.standing.poiBelow.trim();
      if (!above && !below) return 'off';
      return `${above ? `above ${minus(above)}` : 'above off'} · ${below ? `below ${minus(below)}` : 'below off'}`;
    }
    case 'scoring':
      return rulesFor(form.scoring).name;
    case 'rules':
      return `${Object.values(form.flags).filter(Boolean).length} on`;
  }
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
    topEntryPoints: n('topEntryPoints'),
    verdictPoints: n('verdictPoints'),
    verdictWindowMin: n('verdictWindowMin'),
    verdictMinVotes: n('verdictMinVotes'),
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
    policeHeardPenalty: n('policeHeardPenalty'),
    policePhone: form.policePhone,
    policeBreakerAt: n('policeBreakerAt'),
    policeCallerName: form.callerName.trim(),
    policeTelegram: telegramUsername(form.telegram) ?? '',
    policeTelegramNumber: normalisePhone(form.telegramNumber, '') ?? '',
    policeNotices: form.policeNotices,
    scoring: form.scoring,
    voteStyle: form.voteStyle,
    scoringParams: Object.fromEntries(rulesFor(form.scoring).params.map((p) => [p.key, Number(form.params[p.key]!.trim())])),
  };
}
