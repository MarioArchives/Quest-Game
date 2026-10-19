// The simulated line in the app (the mock and the emulators, where no real phone may ring): which call to me is
// ringing on it, and its keypad. Pure, no pack.
import { isSimulatedSid, type Doc, type PlayerPhone, type PoliceCall } from '../shared';

/** How long a simulated call rings before it rings out, as Twilio's do. */
export const RING_MS = 25_000;
/** The most a keypad takes before it stops adding digits. */
const KEYPAD_MAX = 20;

export type SimulatedTarget = { test: string } | { call: string };

/** A call to me on the simulated line: `key` tells one call from the next. */
export interface SimulatedRing {
  key: string;
  target: SimulatedTarget;
  kind: 'test' | 'checkin';
}

/** The call ringing me on the simulated line, if any: my test call first, else an open check-in by phone. */
export function simulatedRing(line: PlayerPhone | null | undefined, call: Doc<PoliceCall> | null | undefined): SimulatedRing | null {
  const test = line?.test;
  if (test && test.result === null && isSimulatedSid(test.sid)) return { key: `test:${test.id}`, target: { test: test.id }, kind: 'test' };
  const phone = call?.phone;
  if (call && call.status === 'open' && call.channel === 'phone' && phone && phone.result === null && isSimulatedSid(phone.sid)) {
    return { key: `call:${call.id}`, target: { call: call.id }, kind: 'checkin' };
  }
  return null;
}

/**
 * One keypad press: digits and * add up (to `digits` of them when the police said how many), # sends what's there
 * (even nothing, as a real keypad does), and a code sends itself once it's all in.
 */
export function pressKey(typed: string, key: string, digits: number | null): { typed: string; send: boolean } {
  if (key === '#') return { typed, send: true };
  if (!/^[\d*]$/.test(key)) return { typed, send: false };
  const next = (typed + key).slice(0, digits ?? KEYPAD_MAX);
  return { typed: next, send: digits !== null && next.length >= digits };
}
