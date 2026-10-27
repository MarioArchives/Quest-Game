// The tip line beside the points chip (packs with police): whether the signed-in player can tip off the police right
// now (a trusted confidant with the cooldown clear), is waiting out the cooldown, or isn't a confidant yet.
import type { LineText } from '../../functions/src/shared/packs/types.ts';
import { accusation, ACCUSED_LINE } from '../../functions/src/shared/phone.ts';
import { cooldownLeftMs } from '../../functions/src/shared/police.ts';
import { standingOf } from '../../functions/src/shared/standing.ts';
import type { GameStatus, Settings } from '../shared';

const MIN_MS = 60_000;

export interface TipLineInput {
  /** The pack has police (features.police). */
  police: boolean;
  status: GameStatus;
  /** The signed-in player, or null when there is no player doc (a GM who doesn't play). */
  me: { points: number; left: boolean; lastSnitchedMs: number | null } | null;
  settings: Pick<Settings, 'confidantAbove' | 'poiBelow' | 'policeTipEveryMin'>;
  nowMs: number;
}

export type TipLineState =
  | { kind: 'hidden' }
  /** A confidant with the cooldown clear. `period` names this open spell (it changes with each tip), so it is announced once. */
  | { kind: 'ready'; period: string }
  /** A confidant waiting: `waitMs` to go (`remaining` of the full cooldown, 0–1), opening at `opensAtMs`. */
  | { kind: 'cooldown'; waitMs: number; fullMs: number; remaining: number; opensAtMs: number }
  /** Not a confidant: `need` points make one; they have `points`. */
  | { kind: 'locked'; need: number; points: number };

/**
 * Milliseconds until the next tip; 0 when it is open. Never more than the full cooldown: `now` ticks on a timer, so
 * right after a tip it can lag the server's stamp.
 */
export function tipWaitMs(lastMs: number | null, everyMin: number, nowMs: number): number {
  return Math.min(cooldownLeftMs(lastMs, everyMin, nowMs), Math.max(0, everyMin) * MIN_MS);
}

/** Whole minutes to wait, rounded up and at least 1: "23" for 22 min 10 s. */
export function waitMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / MIN_MS));
}

/** The tip line's state: hidden, ready, cooling down or locked. */
export function tipLineState({ police, status, me, settings, nowMs }: TipLineInput): TipLineState {
  if (!police || !me || me.left || status !== 'active' || settings.confidantAbove == null) return { kind: 'hidden' };
  if (standingOf(me.points, settings) !== 'confidant') {
    // Strictly above the line: +10 is not enough, +11 is.
    return { kind: 'locked', need: Math.floor(settings.confidantAbove) + 1, points: me.points };
  }
  const fullMs = Math.max(0, settings.policeTipEveryMin) * MIN_MS;
  const waitMs = tipWaitMs(me.lastSnitchedMs, settings.policeTipEveryMin, nowMs);
  if (waitMs > 0) return { kind: 'cooldown', waitMs, fullMs, remaining: waitMs / fullMs, opensAtMs: nowMs + waitMs };
  return { kind: 'ready', period: me.lastSnitchedMs == null ? 'never' : String(me.lastSnitchedMs) };
}

/**
 * What the police will say about the tip, as the tipper types it: the pack's 'accused' line (`template`, its first
 * variant; the engine's when missing) with their note, the target's first name, the caller and "an officer"; "…" until
 * they write something.
 */
export function accusedPreview(template: LineText | undefined, note: string, name: string, caller: string): string {
  const what = accusation(note);
  const line = (typeof template === 'string' ? template : template?.[0]) ?? ACCUSED_LINE;
  return line
    .replace(what ? /\{accusation\}/g : /\{accusation\}\.?/g, () => what || '…')
    .replace(/\{name\}/g, () => name)
    .replace(/\{caller\}/g, () => caller)
    .replace(/\{officer\}/g, () => 'an officer');
}
