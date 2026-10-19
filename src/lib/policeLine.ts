// Police phone calls in words (packs with police, phone calls on): a player's line status, a test call as it goes,
// how a check-in reached the player (for the GM's log and the player's card) and the switchboard. Pure, no pack.
import { isTelegramPolice } from './telegram';
import { describePhoneError, isTelegramSid, type PhoneStatus, type PhoneTest, type PoliceCall, type Switchboard } from '../shared';

/** The tag on a line. */
export const LINE_LABEL: Record<PhoneStatus, string> = {
  unverified: 'Not tested',
  verified: 'Phone ✓',
  failed: "Didn't verify",
  paused: 'Paused',
  'app-only': 'App only',
};

/** A test call still under way, as the player sees it; null once it has a result. */
export function testProgress(test: PhoneTest | null | undefined, via: 'phone' | 'telegram' = 'phone'): string | null {
  if (!test || test.result !== null) return null;
  if (via === 'telegram') {
    if (test.status === 'ringing') return 'Ringing you on Telegram…';
    if (test.status === 'in-progress') return 'Answered: reply in our chat with the code you hear.';
    return 'Calling you on Telegram…';
  }
  if (test.status === 'ringing') return 'Ringing your phone…';
  if (test.status === 'in-progress') return 'Answered: key in the code you hear.';
  return 'Calling your phone…';
}

/** How a phone call went, from what Twilio said. */
function phoneWords(call: PoliceCall): string {
  const phone = call.phone!;
  const telegram = isTelegramSid(phone.sid);
  switch (phone.result) {
    case 'answered':
      return call.answer !== null ? `${telegram ? 'replied' : 'keyed'} ${call.answer}` : 'answered';
    case 'no-answer':
      return 'rang out, no answer';
    case 'busy':
      return 'declined';
    case 'voicemail':
      return 'voicemail';
    case 'no-digits':
      return telegram ? 'picked up, no reply' : 'picked up, nothing keyed';
    case 'never-connected':
      return `never connected (${describePhoneError(phone.errorCode)})`;
    default:
      break;
  }
  if (phone.status === 'pending' || phone.status === 'dialling' || phone.status === 'queued' || phone.status === 'initiated') return 'calling';
  if (phone.status === 'ringing') return 'ringing';
  if (phone.status === 'in-progress') return 'on the line';
  return phone.status;
}

/**
 * One line for the GM's log: by phone and how it went, or in the app and why ("Phone · rang out, no answer",
 * "Phone · never connected (…) · then the app", "App · no working line").
 */
export function callChannelLine(call: PoliceCall): string {
  if (call.phone) {
    const resent = call.channel === 'app' ? ' · then the app' : '';
    return `${isTelegramSid(call.phone.sid) ? 'Telegram' : 'Phone'} · ${phoneWords(call)}${resent}`;
  }
  if (call.fallbackReason === 'no-line') return 'App · no working line';
  if (call.fallbackReason === 'lines-down') return 'App · phone lines down';
  return 'App';
}

/** Why an open check-in is in the app, for the player's card; null when there's nothing worth saying. */
export function fallbackNote(call: PoliceCall): string | null {
  if (call.fallbackReason === 'never-connected') return "We couldn't ring you, so it's here instead. No fine for that.";
  if (call.fallbackReason === 'lines-down') return "The phone lines are down, so it's here instead.";
  return null;
}

/** Which line a check-in call is on: Telegram by its id, else by whether the police ring on Telegram (settings). */
export function lineVia(call: PoliceCall, settings: { policeTelegram?: string; policeTelegramNumber?: string }): 'phone' | 'telegram' {
  return isTelegramSid(call.phone?.sid) || (!call.phone?.sid && isTelegramPolice(settings)) ? 'telegram' : 'phone';
}

/** What a ringing check-in asks of the player and what each outcome costs. */
export function ringingRule(call: PoliceCall, via: 'phone' | 'telegram'): string {
  const heard = call.heardPenalty ?? call.failPenalty;
  const rest = "If the call can't get through, it comes here instead, with no fine.";
  if (via === 'telegram') {
    return `Answer, then reply in their chat: +${call.passPoints} if you're right, \u2212${heard} if you pick up but get it wrong or don't reply, \u2212${call.failPenalty} if you don't answer. ${rest}`;
  }
  return `Pick up and key in your answer on the keypad: +${call.passPoints} if you're right, \u2212${call.failPenalty} if you're wrong or don't answer. ${rest}`;
}

/** The switchboard's state in a word or two. */
export function switchboardLabel(sb: Pick<Switchboard, 'mode' | 'manual'>): string {
  if (sb.mode === 'phone') return 'Lines up';
  if (sb.mode === 'probation') return 'On trial';
  return sb.manual ? 'App (by hand)' : 'Lines down';
}
