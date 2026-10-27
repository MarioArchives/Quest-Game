// The countdown to the GM's start time, and the one place the app opens the game at zero. Pack-neutral: packs draw the
// countdown their own way from what this returns (the app bar chip, and a pack's own screens).
import { useEffect, useRef } from 'react';
import { openOnTime } from '../api';
import { countdownStage, type CountdownStage } from '../lib/countdown';
import { useSession } from '../session/SessionProvider';
import { useGame } from './GameProvider';
import { tsMs, useNow } from './hooks';

export interface Opening {
  opensAtMs: number;
  /** Negative once the time has passed and the server hasn't opened the game yet. */
  remainingMs: number;
  stage: CountdownStage;
}

const DAY_MS = 86_400_000;
/** How often to ask again while the game still hasn't opened, and for how long. */
const RETRY_MS = 5_000;
const GIVE_UP_MS = 120_000;

/** The pending start time (null unless the game is in the lobby with one). */
export function useOpening(): Opening | null {
  const { state } = useGame();
  const { player, isAdmin } = useSession();
  const opensAtMs = state.status === 'lobby' && state.opensAt ? tsMs(state.opensAt) : 0;
  // A tick a second inside the last day, a minute before it, an hour with no start time (useNow only re-renders; the
  // time is read fresh below, so a start time that arrives late is never measured against an old tick).
  const left = opensAtMs - Date.now();
  useNow(opensAtMs === 0 ? 3_600_000 : left <= DAY_MS ? 1000 : 60_000);
  const remainingMs = opensAtMs - Date.now();
  const inGame = Boolean(player) || isAdmin;

  // At zero: ask the server to open the game, once per start time, again every 5 s for two minutes while it is still
  // in the lobby. Errors are swallowed: the five-minute timer opens it anyway.
  const stillLobby = useRef(false);
  stillLobby.current = opensAtMs > 0;
  const due = opensAtMs > 0 && remainingMs <= 0 && inGame;
  useEffect(() => {
    if (!due) return;
    const started = Date.now();
    let stopped = false;
    let timer = 0;
    const ask = async () => {
      let wait = RETRY_MS;
      try {
        const { opened, inMs } = await openOnTime();
        if (opened) return;
        if (inMs && inMs > 0) wait = Math.max(wait, Math.min(inMs, 30_000));
      } catch {
        /* the timer is the backstop */
      }
      if (stopped || !stillLobby.current || Date.now() - started > GIVE_UP_MS) return;
      timer = window.setTimeout(() => void ask(), wait);
    };
    void ask();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [due, opensAtMs]);

  if (!opensAtMs) return null;
  return { opensAtMs, remainingMs, stage: countdownStage(remainingMs) };
}
