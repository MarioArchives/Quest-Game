// A run of the torch tour as a pure state machine: the lights going down ('in'), the specimen night lit stop by stop
// ('on'), the lights going down again ('out') and coming back up on the app ('gone'). Moving on to a stop somewhere
// else goes by its hops, the pen pointing at each thing you'd tap: Next during a hop skips straight to the stop, Back
// stays put, and Back never hops. TourFrame.tsx runs the timers; this only says what happens next.
import { STOPS, type Hop } from './stops';

export type Phase = 'in' | 'on' | 'out' | 'gone';

export interface Run {
  stop: number;
  /** The stops this run covers (the whole tour, or one part), both included. */
  from: number;
  to: number;
  phase: Phase;
  /** Ended at the last stop rather than left early. */
  done?: boolean;
  /** Why it ended early, when something else needed the player (a toast says so). */
  why?: string;
  /** On the way to stop `to`: showing its i-th hop. */
  hop?: { to: number; i: number };
}

export type RunAction =
  /** The lights are down: the specimen night shows. */
  | { type: 'lit' }
  /** Next (1) or Back (-1). */
  | { type: 'step'; by: 1 | -1 }
  /** That hop has been pointed out (or there was nothing to point at): on to the next, or the stop. */
  | { type: 'hopShown'; to: number; i: number }
  /** Done at the last stop, Skip, Escape, Back on the phone, or something else needing the player (`why`). */
  | { type: 'finish'; done: boolean; why?: string }
  /** The lights are down again: the app is put back under them. */
  | { type: 'dark' };

/** A new run over `from`–`to`, starting with the lights going down. */
export const startRun = (from: number, to: number): Run => ({ stop: from, from, to, phase: 'in', hop: undefined });

/** The hops on the way to stop `i` (only ever going forwards). */
const hopsTo = (i: number, stops: ReadonlyArray<{ via?: Hop[] }>): Hop[] => stops[i]?.via ?? [];

export function runReducer(run: Run, action: RunAction, stops: ReadonlyArray<{ via?: Hop[] }> = STOPS): Run {
  switch (action.type) {
    case 'lit':
      return run.phase === 'in' ? { ...run, phase: 'on' } : run;
    case 'step': {
      if (run.phase !== 'on') return run;
      if (run.hop) return action.by === 1 ? { ...run, stop: run.hop.to, hop: undefined } : { ...run, hop: undefined };
      const to = run.stop + action.by;
      if (to > run.to) return { ...run, phase: 'out', done: true, hop: undefined };
      if (to < run.from) return run;
      if (action.by === 1 && hopsTo(to, stops).length > 0) return { ...run, hop: { to, i: 0 } };
      return { ...run, stop: to };
    }
    case 'hopShown': {
      const hop = run.hop;
      if (run.phase !== 'on' || !hop || hop.to !== action.to || hop.i !== action.i) return run; // overtaken
      if (hop.i + 1 >= hopsTo(hop.to, stops).length) return { ...run, stop: hop.to, hop: undefined };
      return { ...run, hop: { to: hop.to, i: hop.i + 1 } };
    }
    case 'finish':
      if (run.phase !== 'on' && run.phase !== 'in') return run;
      return { ...run, phase: 'out', hop: undefined, done: action.done, why: action.why };
    case 'dark':
      return run.phase === 'out' ? { ...run, phase: 'gone' } : run;
  }
}

/** How far through the run this stop is: the `at`th of `of` (a part counts only its own stops). */
export const progressOf = (run: Pick<Run, 'stop' | 'from' | 'to'>) => ({ at: run.stop - run.from + 1, of: run.to - run.from + 1 });

/** What the toast says as the run ends. */
export function goodbye(run: Pick<Run, 'done' | 'why'>): string {
  if (run.why) return `Tour closed: ${run.why}.`;
  return run.done ? 'Tour done. It stays in My file: How tonight works.' : 'Tour closed. Pick it up in My file whenever you like.';
}
