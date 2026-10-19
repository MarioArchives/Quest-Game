// The switchboard (packs with police, phone calls on), as pure rules: where a new police check-in goes (the phone or
// the app), and what a phone call's outcome does to the game-wide breaker and to the player's own line. The game
// code (functions/src/game/policePhone.ts) reads and writes the documents; everything decided here is plain data.
import { LINE_PAUSE_AFTER, linesFault, tripsAtOnce } from './phone.ts';
import type { PhoneStatus, PlayerPhone, PoliceChannel, PoliceFallbackReason, Switchboard, TS } from './types.ts';

/** A game with no game/switchboard doc yet: the lines are up. */
export const SWITCHBOARD_DEFAULT: Switchboard = {
  mode: 'phone',
  manual: false,
  since: null,
  streak: 0,
  streakUids: [],
  trialCallId: null,
  lastError: null,
  health: null,
};

/** game/switchboard over the defaults, so a partial or missing doc still works. */
export const switchboardOf = (data: Partial<Switchboard> | undefined): Switchboard => ({ ...SWITCHBOARD_DEFAULT, ...data });

/** Where a new check-in goes, and why it isn't ringing when it isn't. */
export interface CallRoute {
  channel: PoliceChannel;
  fallbackReason: PoliceFallbackReason | null;
  /** The switchboard is on probation and this call is its trial. */
  trial: boolean;
}

/**
 * The route for a new check-in:
 * - phone calls off: the app, as before (no reason);
 * - no verified line (no number, untested, failed, paused, app only): the app, 'no-line';
 * - lines down: the app, 'lines-down';
 * - on probation: the first call to come along rings as the trial, the rest wait in the app ('lines-down');
 * - otherwise it rings.
 */
export function routeCall(input: { phoneOn: boolean; line: Pick<PlayerPhone, 'status'> | null | undefined; switchboard: Switchboard; trialTaken: boolean }): CallRoute {
  const app = (fallbackReason: PoliceFallbackReason | null): CallRoute => ({ channel: 'app', fallbackReason, trial: false });
  if (!input.phoneOn) return app(null);
  if (input.line?.status !== 'verified') return app('no-line');
  const sb = input.switchboard;
  if (sb.mode === 'app') return app('lines-down');
  if (sb.mode === 'probation') {
    if (sb.trialCallId !== null || input.trialTaken) return app('lines-down');
    return { channel: 'phone', fallbackReason: null, trial: true };
  }
  return { channel: 'phone', fallbackReason: null, trial: false };
}

/** What happened to one phone call, as the breaker sees it. */
export interface CallOutcome {
  /** A check-in (counts towards the streak) or a test call (only an account error trips on it). */
  kind: 'checkin' | 'test';
  /** It reached the phone: rang, was answered, or rang out or was declined. False: it never connected. */
  connected: boolean;
  uid: string;
  /** The check-in's id (null for a test call). */
  callId: string | null;
  code: string | null;
  message: string;
  at: TS;
  /** settings.policeBreakerAt. */
  threshold: number;
}

/** The switchboard after a call's outcome, and whether that tripped it (everyone to the app) or restored it. */
export function afterOutcome(sb: Switchboard, o: CallOutcome): { next: Switchboard; change: 'tripped' | 'restored' | null } {
  if (o.connected) {
    const next: Switchboard = { ...sb, streak: 0, streakUids: [] };
    // The trial got through: the lines are back.
    if (o.kind === 'checkin' && sb.mode === 'probation' && sb.trialCallId !== null && sb.trialCallId === o.callId) {
      return { next: { ...next, mode: 'phone', manual: false, since: o.at, trialCallId: null }, change: 'restored' };
    }
    return { next, change: null };
  }

  const lastError = { code: o.code, message: o.message, at: o.at };
  const atOnce = tripsAtOnce(o.code, o.kind);
  const down = (more: Partial<Switchboard>): { next: Switchboard; change: 'tripped' } => ({
    next: { ...sb, ...more, mode: 'app', manual: false, since: o.at, trialCallId: null, lastError },
    change: 'tripped',
  });
  if (sb.mode === 'app') return { next: { ...sb, lastError }, change: null };
  if (sb.mode === 'probation') {
    // The trial failed, or the account is broken: back to the app until the next health check.
    if (atOnce || (o.kind === 'checkin' && sb.trialCallId !== null && sb.trialCallId === o.callId)) return down({});
    return { next: { ...sb, lastError }, change: null };
  }
  if (o.kind === 'test') return atOnce ? down({}) : { next: { ...sb, lastError }, change: null };

  const streak = sb.streak + 1;
  const streakUids = sb.streakUids.includes(o.uid) ? sb.streakUids : [...sb.streakUids, o.uid];
  // One bad number must not take everyone off the phone, hence at least two players.
  if (atOnce || (streak >= Math.max(1, o.threshold) && streakUids.length >= 2)) return down({ streak, streakUids });
  return { next: { ...sb, streak, streakUids, lastError }, change: null };
}

/**
 * The player's line after a check-in call's outcome: a call that connected clears its count; one that never
 * connected adds to it (unless it was the account's or the system's fault), and the second in a row pauses a verified
 * line.
 * Null when nothing changes.
 */
export function lineAfterOutcome(
  line: Pick<PlayerPhone, 'status' | 'failures'>,
  connected: boolean,
  code: string | null,
  reason: string,
): { failures: number; status?: PhoneStatus; reason?: string } | null {
  if (connected) return line.failures > 0 ? { failures: 0 } : null;
  if (!linesFault(code)) return null;
  const failures = line.failures + 1;
  if (line.status === 'verified' && failures >= LINE_PAUSE_AFTER) return { failures, status: 'paused', reason };
  return { failures };
}
