// What the police say on a phone call, and the TwiML that says it. Pure: the voice webhook (functions/src/firebase)
// renders a VoiceReply with the URLs it knows; the game decides the reply.
import type { GamePack } from '../shared/packs/types.js';
import { CALLER_NAME_MAX, type VoiceLineKey } from '../shared/phone.js';
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

/** The engine's wording. {caller} is settings.policeCallerName, {name} the player's first name, {check} a police check-in. */
export const DEFAULT_LINES: Readonly<Record<VoiceLineKey, string>> = {
  'intro-watch': 'This is {caller}, with a {check} for {name}.',
  'intro-tip': "This is {caller}. We've had a tip-off about you, {name}.",
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

/** The pack's lines with {caller}, {check} and {name} filled in. */
export function voiceScript(pack: GamePack, settings: Pick<Settings, 'policeCallerName'>): (line: VoiceLineKey, name?: string) => Speech {
  const check = termForms(pack.terms).policeCall.one;
  const caller = callerName(settings);
  return (line, name = '') => {
    const template = pack.policeVoice?.lines?.[line] ?? DEFAULT_LINES[line];
    const text = template.replace(/\{caller\}/g, caller).replace(/\{check\}/g, check).replace(/\{name\}/g, name).replace(/\s+([,.!?])/g, '$1').trim();
    return { text, line };
  };
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
