// What the police say on a phone call, and the TwiML that says it. Pure: the voice webhook (functions/src/firebase)
// renders a VoiceReply with the URLs it knows; the game decides the reply.
import type { GamePack, LineText, Officer } from '../shared/packs/types.js';
import { accusation, ACCUSED_LINE, CALLER_NAME_MAX, CHAT_LINES, type ChatLineKey, type VoiceLineKey } from '../shared/phone.js';
import { termForms } from '../shared/packs/terms.js';
import type { Settings } from '../shared/types.js';

/** Something said: `line` names the recording that may replace it (the question and a code have none). */
export interface Speech {
  text: string;
  line?: VoiceLineKey;
}

/** One TwiML verb: say something, gather keypad digits (saying something meanwhile), or hang up. */
export type VoiceStep =
  | { kind: 'say'; speech: Speech }
  | {
      kind: 'gather';
      speech: Speech[];
      /** The query for Twilio's next request with the digits: { call, step: 'gather', try: '2' }. */
      next: Record<string, string>;
      timeoutSec: number;
      /** Submit after this many digits without waiting for #. */
      numDigits?: number;
    }
  | { kind: 'hangup' };

/** A whole reply; empty for a status callback (Twilio ignores the body). */
export type VoiceReply = VoiceStep[];

export interface VoiceConfig {
  voice: string;
  language: string;
}

export const DEFAULT_VOICE: VoiceConfig = { voice: 'Polly.Brian', language: 'en-GB' };

/**
 * The engine's wording. {caller} is settings.policeCallerName, {name} the player's first name, {check} a police check-in,
 * and in 'accused' {accusation} what the tipper wrote.
 */
export const DEFAULT_LINES: Readonly<Record<VoiceLineKey, string>> = {
  'intro-watch': 'This is {caller}, with a {check} for {name}.',
  'intro-tip': "This is {caller}. We've had a tip-off about you, {name}.",
  accused: ACCUSED_LINE,
  purpose: 'Just a quick check.',
  ask: '{question}',
  'key-in': 'Key in your answer, then press hash.',
  again: "We didn't hear an answer. Once more.",
  pass: "Correct. You're free to go. Goodbye.",
  fail: "That's not right. That will cost you. Goodbye.",
  'no-answer': 'No answer, so that counts as a miss. Goodbye.',
  closed: 'This {check} is closed. Goodbye.',
  moved: "We couldn't hold this line, so your {check} is waiting in the app. Goodbye.",
  'test-intro': 'This is {caller}, testing your line. Your code is',
  'test-again': 'Once more. Your code is',
  'test-key-in': 'Key it in now.',
  'test-pass': "That's the code. Your line is ready. Goodbye.",
  'test-fail': "That's not the code. Try again from the app. Goodbye.",
};

/** The caller's name as spoken: the GM's setting, trimmed, or "the police". */
export function callerName(settings: Pick<Settings, 'policeCallerName'>): string {
  const name = typeof settings.policeCallerName === 'string' ? settings.policeCallerName.trim().slice(0, CALLER_NAME_MAX) : '';
  return name || 'the police';
}

/**
 * How a call's lines are chosen: `seed` (the call's or the test's id) picks each line's variant and the officer, the
 * same every time for one call; `chat` says the call is answered in the chat (Telegram), so the chat lines are used.
 */
export interface VoiceOpts {
  seed?: string;
  chat?: boolean;
}

/** FNV-1a, 32 bits: a steady number for a string (a call's id and a line's key), so a retry picks what the first try did. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** One of `list`, picked by `key` (the first without one). */
const pickBy = <T>(list: readonly T[], key: string | undefined): T => list[key === undefined ? 0 : fnv1a(key) % list.length]!;

/** The officer making a call (from the pack's officers, picked by the call's seed); null when the pack has none. */
export function officerFor(pack: GamePack, seed: string): Officer | null {
  const officers = pack.policeVoice?.officers;
  return officers?.length ? pickBy(officers, `${seed}:officer`) : null;
}

/** The engine's wording for the lines said differently on a line answered in the chat (Telegram). */
export const DEFAULT_CHAT_LINES: Readonly<Record<ChatLineKey, string>> = {
  ask: '{question} Reply to our message with your answer.',
  again: "I didn't catch that. Reply with the number.",
  'test-key-in': 'Reply in our chat with the code.',
};

/** A line's variants as a list (a bare string is one wording). */
const variants = (text: LineText): readonly string[] => (typeof text === 'string' ? [text] : text);

/**
 * The pack's lines with {caller}, {check}, {name}, {officer} and `vars` ({question}, {accusation}) filled in. A line with
 * variants says one, picked by the call's seed and the line's key (the first without a seed). On a call answered in the
 * chat, the chat lines come first for the keys in CHAT_LINES.
 */
export function voiceScript(
  pack: GamePack,
  settings: Pick<Settings, 'policeCallerName'>,
  opts: VoiceOpts = {},
): (line: VoiceLineKey, name?: string, vars?: Record<string, string>) => Speech {
  const check = termForms(pack.terms).policeCall.one;
  const caller = callerName(settings);
  const { seed, chat } = opts;
  const officer = (seed === undefined ? pack.policeVoice?.officers?.[0] : officerFor(pack, seed))?.name ?? 'an officer';
  return (line, name = '', vars = {}) => {
    const onChat = chat && (CHAT_LINES as readonly string[]).includes(line);
    const given = onChat ? (pack.policeVoice?.chatLines?.[line as ChatLineKey] ?? DEFAULT_CHAT_LINES[line as ChatLineKey]) : (pack.policeVoice?.lines?.[line] ?? DEFAULT_LINES[line]);
    const template = pickBy(variants(given), seed === undefined ? undefined : `${seed}:${line}`);
    const fill: Record<string, string> = { ...vars, caller, check, name, officer };
    const text = template
      .replace(/\{(\w+)\}/g, (whole, key: string) => fill[key] ?? whole)
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
    return { text, line };
  };
}

/**
 * What the tipper accused the player of, as the police say it after a tip-off's intro: the pack's 'accused' line with
 * the note in it. Always read out (no `line`, so no recording replaces it); null without a note.
 */
export function accusedSpeech(pack: GamePack, settings: Pick<Settings, 'policeCallerName'>, note: unknown, name = '', opts: VoiceOpts = {}): Speech | null {
  const what = accusation(note);
  if (!what) return null;
  return { text: voiceScript(pack, settings, opts)('accused', name, { accusation: what }).text };
}

/** The voice a pack's police use. */
export const voiceOf = (pack: GamePack): VoiceConfig => pack.policeVoice?.voice ?? DEFAULT_VOICE;

const XML: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => XML[c]!);

export interface RenderOptions {
  /** The full webhook URL for a query (for <Gather action>). */
  action(query: Record<string, string>): string;
  voice: VoiceConfig;
  /** The URL of a recorded line, or null to read it out. */
  recording(line: VoiceLineKey): string | null;
}

function speak(speech: Speech, opts: RenderOptions): string {
  const url = speech.line ? opts.recording(speech.line) : null;
  if (url) return `<Play>${escapeXml(url)}</Play>`;
  return `<Say voice="${escapeXml(opts.voice.voice)}" language="${escapeXml(opts.voice.language)}">${escapeXml(speech.text)}</Say>`;
}

/** TwiML for a reply. */
export function renderTwiml(reply: VoiceReply, opts: RenderOptions): string {
  const body = reply
    .map((step) => {
      if (step.kind === 'say') return speak(step.speech, opts);
      if (step.kind === 'hangup') return '<Hangup/>';
      const digits = step.numDigits ? ` numDigits="${step.numDigits}"` : '';
      const inner = step.speech.map((s) => speak(s, opts)).join('');
      return `<Gather input="dtmf" finishOnKey="#" timeout="${step.timeoutSec}" actionOnEmptyResult="true" method="POST" action="${escapeXml(opts.action(step.next))}"${digits}>${inner}</Gather>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
