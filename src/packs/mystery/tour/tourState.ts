// The torch tour's small, always-loaded half: who may be offered it, what this device remembers about it, and the
// one run there can be at a time. The offer on Missions (TourOffer.tsx), the only way in, calls `startTour`; the
// pack's layer (TourHost.tsx) loads the heavy TourFrame when a run starts. A run adds one history entry, so Back on the
// phone ends it rather than leaving the screen underneath; it's taken off again when the run ends.
import { useSyncExternalStore } from 'react';
import type { GameStatus } from '../../../shared';

/* ---------------------------------------------------------------- what this device remembers */

/**
 * Taken or put off, for this player on this device, and the booking it answers (the player's `bookedAt` then, in ms):
 * after a reset and a fresh booking the offer comes back.
 */
export interface TourMark {
  offer: 'taken' | 'later';
  booked?: number;
}

export const markKey = (uid: string) => `mystery.tour.${uid}`;

/** A stored mark, or null for anything that isn't one. */
export function parseMark(raw: string | null): TourMark | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TourMark> | null;
    if (!v || (v.offer !== 'taken' && v.offer !== 'later')) return null;
    return typeof v.booked === 'number' && Number.isFinite(v.booked) ? { offer: v.offer, booked: v.booked } : { offer: v.offer };
  } catch {
    return null;
  }
}

/** Where marks go: localStorage in the app, anything shaped like it in a test. */
export interface MarkStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** This session's marks, for when the device won't store them: the offer still goes when answered, and comes back next visit. */
const session = new Map<string, TourMark>();
const listeners = new Set<() => void>();
let version = 0;

function storage(): MarkStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The player's mark: this session's latest, else the device's. Storage that is blocked or throws counts as none. */
export function readMark(uid: string, store: MarkStore | null = storage()): TourMark | null {
  const latest = session.get(uid);
  if (latest) return latest;
  try {
    return parseMark(store?.getItem(markKey(uid)) ?? null);
  } catch {
    return null;
  }
}

/** Forgets this session's marks (tests, and a fresh visit, start with none). */
export function forgetSession(): void {
  session.clear();
  version++;
}

/** Remembers the mark (on the device when it can); true when stored for later visits too. */
export function writeMark(uid: string, mark: TourMark, store: MarkStore | null = storage()): boolean {
  session.set(uid, mark);
  version++;
  listeners.forEach((fn) => fn());
  try {
    if (!store) return false;
    store.setItem(markKey(uid), JSON.stringify(mark));
    return true;
  } catch {
    return false;
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The mark for `uid`, kept up to date as the offer, the card and the tour write it. */
export function useTourMark(uid: string | null): TourMark | null {
  // The version stands in for the mark, so a re-read only happens after a write.
  const v = useSyncExternalStore(subscribe, () => version);
  return uid ? markAt(uid, v) : null;
}

let cached: { uid: string; v: number; mark: TourMark | null } | null = null;
function markAt(uid: string, v: number): TourMark | null {
  if (cached && cached.uid === uid && cached.v === v) return cached.mark;
  const mark = readMark(uid);
  cached = { uid, v, mark };
  return mark;
}

/* ---------------------------------------------------------------- who is offered it */

/** Booked in after the case opened (a doc from before the booking desk has no booking time: not late). */
export const lateJoiner = (bookedAtMs: number | null, startedAtMs: number | null) => bookedAtMs !== null && startedAtMs !== null && bookedAtMs > startedAtMs;

/**
 * Whether a mark answers the player's booking: one written for an earlier booking (the game reset, and they booked in
 * again), or before marks noted their booking, doesn't. A file from before the booking desk has no booking: any mark.
 */
export const markHolds = (mark: TourMark | null, bookedAtMs: number | null): boolean =>
  mark !== null && (bookedAtMs === null || (mark.booked ?? -Infinity) >= bookedAtMs);

/**
 * Whether the offer hangs on the Missions folder: for a player (never a GM, even one who plays) who hasn't taken it or
 * put it off since booking in, before the case opens (the sealed file, or the empty folder without a start time), or
 * once the case is open for someone who booked in after it opened; never while a run is on.
 */
export function offerShown(input: {
  gm: boolean;
  player: boolean;
  status: GameStatus;
  late: boolean;
  mark: TourMark | null;
  bookedAt: number | null;
  running: boolean;
}): boolean {
  if (input.gm || !input.player || input.running || markHolds(input.mark, input.bookedAt)) return false;
  if (input.status === 'lobby') return true;
  return (input.status === 'active' || input.status === 'paused') && input.late;
}

/* ---------------------------------------------------------------- the run */

/** A run asked for, and what had focus, to give it back afterwards. */
export interface TourRequest {
  id: number;
  opener: HTMLElement | null;
}

let current: TourRequest | null = null;
let nextId = 1;
/** The history entry this run added is still the current one. */
let pushed = false;
const runListeners = new Set<() => void>();
const backListeners = new Set<() => void>();
const emitRun = () => runListeners.forEach((fn) => fn());

function onPop() {
  pushed = false;
  // A frame on screen leaves the tour its own way; one still loading is just dropped.
  if (backListeners.size > 0) backListeners.forEach((fn) => fn());
  else closeTour();
}

/**
 * Starts a run unless one is on (a second tap, or a start from elsewhere, gives the same one run). `opener` is what was
 * tapped, to give focus back to afterwards (a tap doesn't focus a button everywhere); else whatever has focus.
 */
export function startTour(opener?: HTMLElement | null): boolean {
  if (current) return false;
  const active = opener ?? (typeof document !== 'undefined' ? document.activeElement : null);
  const isEl = typeof HTMLElement !== 'undefined' && active instanceof HTMLElement && active !== document.body;
  current = { id: nextId++, opener: isEl ? active : null };
  if (typeof window !== 'undefined') {
    try {
      window.history.pushState({ ...(window.history.state as object | null), tour: current.id }, '');
      pushed = true;
      window.addEventListener('popstate', onPop);
    } catch {
      pushed = false;
    }
  }
  emitRun();
  return true;
}

/** The run is over (or never got going): takes its history entry back off and lets another start. */
export function closeTour(): void {
  if (!current) return;
  const id = current.id;
  current = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('popstate', onPop);
    if (pushed && (window.history.state as { tour?: number } | null)?.tour === id) window.history.back();
  }
  pushed = false;
  emitRun();
}

/** Back on the phone while a run is on: `fn` ends it. */
export function onTourBack(fn: () => void): () => void {
  backListeners.add(fn);
  return () => void backListeners.delete(fn);
}

const subscribeRun = (fn: () => void) => {
  runListeners.add(fn);
  return () => void runListeners.delete(fn);
};

/** The run asked for, while there is one. */
export function useTourRequest(): TourRequest | null {
  return useSyncExternalStore(subscribeRun, () => current);
}

/** The heavy half: the specimen screens and the tour over them. */
export const loadFrame = () => import('./TourFrame');

/** Fetches the heavy half ahead of a tap (while the offer or the card is on screen). */
export function prefetchTour(): void {
  void loadFrame().catch(() => {
    /* tried again when a run starts */
  });
}
