// Police check-ins by phone (packs with police, settings.policePhone): phone numbers, what Twilio's call statuses and
// error codes mean for the game, the question as it is spoken, and the contact card. Shared by the functions and the
// app; no SDKs, no Node built-ins.
import type { PhoneTestResult } from './types.ts';

/** A test call's code: this many digits, each 1–9 (no "zero" or "oh" to mishear). */
export const TEST_CODE_LENGTH = 3;
/** A check-in or test call Twilio has said nothing about this long after it was placed never connected. */
export const PHONE_SILENT_MS = 90_000;
/** A check-in or test call still unresolved this long after it was placed is given up on (the system's fault). */
export const PHONE_GIVE_UP_MS = 3 * 60_000;
/** Check-in calls in a row that never connect before a player's line is paused. */
export const LINE_PAUSE_AFTER = 2;
/** The switchboard's health check runs this often while the lines are down. */
export const HEALTH_EVERY_MS = 15 * 60_000;
export const CALLER_NAME_MAX = 40;

/**
 * Every line the police say on a call. A pack can reword any of them (GamePack.police.lines) or record it as
 * public/audio/police/<line>.mp3 (GamePack.police.recordings), which is played instead of read out. The question and
 * a test call's code are always read out.
 */
export const VOICE_LINES = [
  'intro-watch',
  'intro-tip',
  'key-in',
  'again',
  'pass',
  'fail',
  'no-answer',
  'closed',
  'moved',
  'test-intro',
  'test-again',
  'test-key-in',
  'test-pass',
  'test-fail',
] as const;
export type VoiceLineKey = (typeof VOICE_LINES)[number];

export const isVoiceLine = (key: string): key is VoiceLineKey => (VOICE_LINES as readonly string[]).includes(key);

/** Country calling codes for the regions a pack's locale may name, so "07700 900123" can be read without a "+". */
const CALLING_CODES: Readonly<Record<string, string>> = {
  GB: '44',
  IE: '353',
  US: '1',
  CA: '1',
  AU: '61',
  NZ: '64',
  FR: '33',
  DE: '49',
  ES: '34',
  IT: '39',
  NL: '31',
  BE: '32',
};

const E164 = /^\+[1-9]\d{7,14}$/;
/** North America has no national 0, and Italy dials its 0 even from abroad. */
const KEEPS_ZERO: ReadonlySet<string> = new Set(['1', '39']);

/** The locale's country calling code ("en-GB" → "44"), or null when it names no region we know. */
export function callingCode(locale: string): string | null {
  const region = locale.split('-')[1]?.toUpperCase();
  return (region && CALLING_CODES[region]) || null;
}

/**
 * A phone number as typed, in E.164 ("+447700900123"), or null when it can't be one. Takes "+44 7700 900123",
 * "0044…", "+44 (0)7700…" and, with the locale's country, a national "07700 900123".
 */
export function normalisePhone(raw: unknown, locale: string): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  let s = raw.trim().replace(/\(0\)/g, '').replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    // "+44 07700…": the national 0 doesn't belong after a country code (Italy keeps it).
    const cc = Object.values(CALLING_CODES).find((c) => !KEEPS_ZERO.has(c) && s.startsWith(`+${c}0`));
    if (cc) s = `+${cc}${s.slice(cc.length + 2)}`;
    return E164.test(s) ? s : null;
  }
  const cc = callingCode(locale);
  if (!cc || !/^\d+$/.test(s)) return null;
  if (s.startsWith('0')) s = KEEPS_ZERO.has(cc) ? s : s.slice(1);
  else if (cc !== '1') return null;
  const e164 = `+${cc}${s}`;
  return E164.test(e164) ? e164 : null;
}

/** How the number reads to its owner: "07700 900123" in their own country, "+49 151 2345678" style otherwise. */
export function formatPhone(e164: string, locale: string): string {
  const cc = callingCode(locale);
  if (cc && cc !== '1' && e164.startsWith(`+${cc}`)) {
    const national = `0${e164.slice(cc.length + 1)}`;
    return national.length === 11 ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
  }
  return e164;
}

/** The last few digits only, for anywhere other people might see it. */
export const maskPhone = (e164: string): string => `•••${e164.slice(-3)}`;

/**
 * What a Twilio CallStatus means for the game:
 * - 'pending': not ringing yet (queued, initiated)
 * - 'reached': ringing or answered: it got through
 * - 'answered-ended': they picked up and the call has ended
 * - 'unanswered': rang out or was declined: the player's
 * - 'never-connected': failed or canceled: the system's
 */
export type CallStatusMeaning = 'pending' | 'reached' | 'answered-ended' | 'unanswered' | 'never-connected';

export function callStatusMeaning(status: string): CallStatusMeaning {
  switch (status) {
    case 'ringing':
    case 'in-progress':
    case 'answered':
      return 'reached';
    case 'completed':
      return 'answered-ended';
    case 'busy':
    case 'no-answer':
      return 'unanswered';
    case 'failed':
    case 'canceled':
      return 'never-connected';
    default:
      return 'pending';
  }
}

/** True when Twilio's AnsweredBy says a machine took the call (voicemail or fax). */
export const answeredByMachine = (answeredBy: string | null | undefined): boolean =>
  typeof answeredBy === 'string' && (answeredBy.startsWith('machine') || answeredBy === 'fax');

/**
 * Errors that mean the account or the caller ID is broken, so no call can connect: they switch the whole game to the
 * app at once, from any call. 'not-set-up' is ours: the server has no Twilio configuration.
 */
export const ACCOUNT_ERROR_CODES: readonly string[] = ['not-set-up', '10001', '20003', '20005', '21210', '21212'];
/**
 * Permission errors (geo permissions, a trial account's unverified numbers). On a check-in call (to a line that has
 * already passed a test) they mean the account changed, so they trip the switchboard too; on a test call they only
 * fail that number (a foreign number the account may not ring).
 */
export const PERMISSION_ERROR_CODES: readonly string[] = ['21215', '21219'];

/** True when this error, on this kind of call, switches every check-in to the app at once. */
export function tripsAtOnce(code: string | null, kind: 'checkin' | 'test'): boolean {
  if (code === null) return false;
  return ACCOUNT_ERROR_CODES.includes(code) || (kind === 'checkin' && PERMISSION_ERROR_CODES.includes(code));
}

/** Our own codes for calls that went quiet or couldn't reach Twilio: the system's fault, never the line's. */
export const SYSTEM_ERROR_CODES: readonly string[] = ['no-status', 'no-result', 'network'];

/** True when a call that never connected is down to the number itself, so it counts against the player's line. */
export const linesFault = (code: string | null): boolean =>
  code === null || !(ACCOUNT_ERROR_CODES.includes(code) || PERMISSION_ERROR_CODES.includes(code) || SYSTEM_ERROR_CODES.includes(code));

const ERROR_WORDS: Readonly<Record<string, string>> = {
  'not-set-up': "Phone calls aren't set up on the server",
  'no-status': 'No word from Twilio within 90 s',
  'no-result': 'The call never finished',
  network: "Couldn't reach Twilio",
  '10001': 'The Twilio account is not active (10001)',
  '20003': 'Twilio refused the account: wrong keys, or the account is suspended (20003)',
  '20005': 'The Twilio account is not active (20005)',
  '21210': "The caller ID isn't verified on the Twilio account (21210)",
  '21212': "The caller ID isn't a valid number (21212)",
  '21215': "Twilio's geo permissions don't allow calls to this number (21215)",
  '21219': 'A trial Twilio account can only ring verified numbers (21219)',
  '21211': "The number isn't valid (21211)",
  '21217': "The number doesn't look valid (21217)",
  '13224': "Twilio can't ring this number (13224)",
};

/** A short sentence for an error code, for the GM's log and the player's line status. */
export function describePhoneError(code: string | null): string {
  if (code === null) return "The call didn't connect";
  return ERROR_WORDS[code] ?? `Twilio error ${code}`;
}

/** How a test call went, in words for the player. */
export function describeTestResult(result: PhoneTestResult, code: string | null): string {
  switch (result) {
    case 'passed':
      return 'The code came back right';
    case 'wrong-code':
      return "The code keyed in didn't match";
    case 'no-digits':
      return 'Nothing was keyed in';
    case 'no-answer':
      return 'Nobody answered';
    case 'busy':
      return 'The call was declined';
    case 'voicemail':
      return 'Voicemail answered';
    case 'never-connected':
      return describePhoneError(code);
  }
}

/**
 * Calls on the simulated line (the mock and the emulators, where nothing may ring a real phone) have ids starting
 * with this, so the app knows to play the phone for them.
 */
export const SIMULATED_SID_PREFIX = 'SIM-';

/** True when this call id is the simulated line's: no real phone is ringing. */
export const isSimulatedSid = (sid: string | null | undefined): boolean => typeof sid === 'string' && sid.startsWith(SIMULATED_SID_PREFIX);

/** What the player does on a simulated call, standing in for what Twilio would report. */
export type SimulatedAction = 'ring' | 'answer' | 'keys' | 'decline' | 'no-answer' | 'hang-up';

/** One turn of a simulated call, as the app shows it: what the police said, the keypad if they wait for digits, and whether they hung up. */
export interface SimulatedTurn {
  said: string[];
  /** `attempt` goes back with the digits; `digits` is how many they take (null: any number, then #). */
  keypad: { attempt: number; digits: number | null } | null;
  ended: boolean;
}

/** "What's 7 × 8?" as a voice reads it: "What's 7 times 8?". */
export function spokenQuestion(question: string): string {
  return question.replace(/\s*×\s*/g, ' times ').replace(/\s*\+\s*/g, ' plus ').replace(/\s+/g, ' ').trim();
}

/** A code spoken digit by digit, with a pause between: "4, 8, 2". */
export const spokenDigits = (code: string): string => code.split('').join(', ');

/** vCard text values escape commas, semicolons, backslashes and new lines. */
const vEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** vCard lines longer than 75 characters are folded: CRLF, then a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

/** The police as a contact (vCard 3.0), so the call shows a name: `photo` is an optional base64 PNG. */
export function policeVCard(opts: { name: string; number: string; photo?: string | null }): string {
  const name = vEscape(opts.name.trim() || 'Police');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name};;;;`, `ORG:${name}`, `TEL;TYPE=CELL,VOICE:${opts.number}`];
  if (opts.photo) lines.push(`PHOTO;ENCODING=b;TYPE=PNG:${opts.photo}`);
  lines.push('END:VCARD');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
