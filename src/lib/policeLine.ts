// Police phone calls in words (packs with police, phone calls on): a player's line status, a test call as it goes,
// how a check-in reached the player (for the GM's log and the player's card) and the switchboard. Pure, no pack.
import { describePhoneError, type PhoneStatus, type PhoneTest, type PoliceCall, type Switchboard } from '../shared';

/** The tag on a line. */
export const LINE_LABEL: Record<PhoneStatus, string> = {
  unverified: 'Not tested',
  verified: 'Phone ✓',
  failed: "Didn't verify",
  paused: 'Paused',
  'app-only': 'App only',
};

/** A test call still under way, as the player sees it; null once it has a result. */
export function testProgress(test: PhoneTest | null | undefined): string | null {
  if (!test || test.result !== null) return null;
  if (test.status === 'ringing') return 'Ringing your phone…';
  if (test.status === 'in-progress') return 'Answered: key in the code you hear.';
  return 'Calling your phone…';
}

/** How a phone call went, from what Twilio said. */
function phoneWords(call: PoliceCall): string {
  const phone = call.phone!;
  switch (phone.result) {
    case 'answered':
      return call.answer !== null ? `keyed ${call.answer}` : 'answered';
    case 'no-answer':
      return 'rang out, no answer';
    case 'busy':
      return 'declined';
    case 'voicemail':
      return 'voicemail';
    case 'no-digits':
      return 'picked up, nothing keyed';
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
    return `Phone · ${phoneWords(call)}${resent}`;
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

/** The switchboard's state in a word or two. */
export function switchboardLabel(sb: Pick<Switchboard, 'mode' | 'manual'>): string {
  if (sb.mode === 'phone') return 'Lines up';
  if (sb.mode === 'probation') return 'On trial';
  return sb.manual ? 'App (by hand)' : 'Lines down';
}
