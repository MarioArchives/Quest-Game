import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from '../firebase';
import { shouldSendLocation } from '../lib/geo';
import { useSession } from '../session/SessionProvider';
import { useGame } from './GameProvider';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: number;
}

export interface LocationValue {
  /** The player has location sharing switched on (the app is watching their position). */
  sharing: boolean;
  /** Latest known position while sharing, else null. */
  position: Fix | null;
  /** When we last wrote locations/{uid}. */
  lastSentAt: number | null;
  /** Something the player should know (permission denied, no signal). */
  problem: string | null;
  supported: boolean;
  /**
   * True exactly once per sharing session, the first time it is asked after a fix has arrived. The map
   * uses it to fly to the player once when sharing starts, not on every fix or every visit.
   */
  takeFirstFix(): boolean;
  setSharing(on: boolean): Promise<void>;
  /** Stop watching and delete locations/{uid} (used on sign-out). */
  stopAndClear(): Promise<void>;
}

const LocationContext = createContext<LocationValue | null>(null);

const storageKey = (uid: string) => `fq:share-location:${uid}`;

export const PERMISSION_DENIED_MESSAGE =
  'Location is blocked for this site. Allow it in your browser settings, then switch sharing on again.';
export const POSITION_UNAVAILABLE_MESSAGE =
  "Your device couldn't work out where you are. On a desktop, location is often approximate — it comes from your network — so try on your phone, or move somewhere with a better signal.";
export const TIMEOUT_MESSAGE = "Finding you is taking too long. We'll keep trying; check that location is on for your browser.";

/**
 * Optional, foreground-only location sharing. Off by default; while on, navigator.geolocation.watchPosition
 * feeds locations/{uid} (throttled by shouldSendLocation) but only while the game is active.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { user, player } = useSession();
  const { state } = useGame();
  const uid = user?.uid ?? null;
  const isPlayer = Boolean(player);
  const active = state.status === 'active';
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const [sharing, setSharingState] = useState(false);
  const [position, setPosition] = useState<Fix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  // Per sharing session: has any fix arrived, did the map already take its "fly to me", did the watch (the
  // accurate source) report yet.
  const gotFix = useRef(false);
  const gotWatchFix = useRef(false);
  const flownToFirst = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Restore the player's previous choice (still off until they have ever turned it on).
  useEffect(() => {
    if (!uid || !isPlayer || !supported) {
      setSharingState(false);
      return;
    }
    try {
      setSharingState(localStorage.getItem(storageKey(uid)) === 'on');
    } catch {
      setSharingState(false);
    }
  }, [uid, isPlayer, supported]);

  useEffect(() => {
    if (!sharing || !uid || !supported) {
      setPosition(null);
      return;
    }
    setProblem(null);
    gotFix.current = false;
    gotWatchFix.current = false;
    flownToFirst.current = false;
    // The quick one-off fix can land after sharing was switched off again; it must not draw or write anything then.
    let live = true;

    const onFix = (pos: GeolocationPosition, fromWatch: boolean) => {
      if (!live) return;
      // The quick coarse fix only fills the gap until the watch reports; it never overwrites a better one.
      if (fromWatch) gotWatchFix.current = true;
      else if (gotWatchFix.current) return;
      gotFix.current = true;
      const fix: Fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        at: Date.now(),
      };
      setPosition(fix);
      setProblem(null);
      if (!activeRef.current) return;
      // The throttle also keeps the quick fix and the first watch fix from writing twice.
      if (!shouldSendLocation(lastSent.current, fix, fix.at)) return;
      lastSent.current = { lat: fix.lat, lng: fix.lng, at: fix.at };
      setDoc(doc(db, 'locations', uid), {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        updatedAt: serverTimestamp(),
      }).then(
        () => setLastSentAt(Date.now()),
        () => {
          // The game may have just been paused; try again on the next fix.
          lastSent.current = null;
        },
      );
    };

    const onError = (err: GeolocationPositionError) => {
      if (!live) return;
      if (err.code === err.PERMISSION_DENIED) {
        setProblem(PERMISSION_DENIED_MESSAGE);
        setSharingState(false);
        try {
          localStorage.removeItem(storageKey(uid));
        } catch {
          /* ignore */
        }
      } else if (gotFix.current) {
        // We already know roughly where they are; a hiccup in the stream is not worth alarming anyone.
        return;
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setProblem(POSITION_UNAVAILABLE_MESSAGE);
      } else if (err.code === err.TIMEOUT) {
        setProblem(TIMEOUT_MESSAGE);
      } else {
        setProblem("Can't get a location fix right now.");
      }
    };

    // A fast, coarse first fix (network location) so the map shows something quickly; the high-accuracy
    // watch below refines it. Its errors are ignored: the watch reports the real problem.
    navigator.geolocation.getCurrentPosition((pos) => onFix(pos, false), () => undefined, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 10_000,
    });
    const watchId = navigator.geolocation.watchPosition((pos) => onFix(pos, true), onError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 45_000,
    });
    return () => {
      live = false;
      navigator.geolocation.clearWatch(watchId);
      lastSent.current = null;
    };
  }, [sharing, uid, supported]);

  // A new "active" phase (resumed after a pause) should send straight away.
  useEffect(() => {
    if (active) lastSent.current = null;
  }, [active]);

  const clear = useCallback(async () => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'locations', uid));
    } catch {
      /* nothing to delete, or not allowed: either way we are not sharing */
    }
    setLastSentAt(null);
  }, [uid]);

  const setSharing = useCallback(
    async (on: boolean) => {
      if (!uid) return;
      try {
        if (on) localStorage.setItem(storageKey(uid), 'on');
        else localStorage.removeItem(storageKey(uid));
      } catch {
        /* private mode: the choice just will not persist */
      }
      setSharingState(on);
      if (!on) {
        setPosition(null);
        await clear();
      }
    },
    [uid, clear],
  );

  const takeFirstFix = useCallback(() => {
    if (!gotFix.current || flownToFirst.current) return false;
    flownToFirst.current = true;
    return true;
  }, []);

  const stopAndClear = useCallback(async () => {
    if (!sharing) return;
    setSharingState(false);
    setPosition(null);
    try {
      if (uid) localStorage.removeItem(storageKey(uid));
    } catch {
      /* ignore */
    }
    await clear();
  }, [sharing, uid, clear]);

  const value = useMemo<LocationValue>(
    () => ({ sharing, position, lastSentAt, problem, supported, takeFirstFix, setSharing, stopAndClear }),
    [sharing, position, lastSentAt, problem, supported, takeFirstFix, setSharing, stopAndClear],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationSharing(): LocationValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationSharing must be used inside <LocationProvider>');
  return ctx;
}
