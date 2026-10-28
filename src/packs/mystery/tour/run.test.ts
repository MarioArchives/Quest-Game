// Torch tour plan edge cases 8–12: a run's moves, its hops, its parts and how it ends.
import { describe, expect, it } from 'vitest';
import { goodbye, progressOf, runReducer, startRun, type Run, type RunAction } from './run';
import { STOPS } from './stops';

const play = (run: Run, ...actions: RunAction[]) => actions.reduce((r, a) => runReducer(r, a), run);
const lit = (from = 0, to = STOPS.length - 1) => play(startRun(from, to), { type: 'lit' });
const next: RunAction = { type: 'step', by: 1 };
const back: RunAction = { type: 'step', by: -1 };
/** Stop 3 (the Map) is reached by one hop; stop 8 (Call them out) by three. */
const MAP = 2;
const ACCUSE = 7;

describe('8. hops and Back', () => {
  it('a run starts with the lights going down, then shows its first stop', () => {
    const r = startRun(0, 9);
    expect(r).toMatchObject({ stop: 0, phase: 'in' });
    expect(runReducer(r, next)).toBe(r); // nothing moves in the dark
    expect(runReducer(r, { type: 'lit' }).phase).toBe('on');
  });

  it('Next to a stop elsewhere plays each of its hops in order, then lands', () => {
    let r = play(lit(), { type: 'step', by: 1 }); // stop 2: no hops
    expect(r).toMatchObject({ stop: 1, hop: undefined });
    r = play(lit(6, 9), next);
    expect(r.hop).toEqual({ to: ACCUSE, i: 0 });
    r = play(r, { type: 'hopShown', to: ACCUSE, i: 0 });
    expect(r.hop).toEqual({ to: ACCUSE, i: 1 });
    r = play(r, { type: 'hopShown', to: ACCUSE, i: 1 }, { type: 'hopShown', to: ACCUSE, i: 2 });
    expect(r).toMatchObject({ stop: ACCUSE, hop: undefined });
  });

  it('a hop that says it was shown after it was overtaken changes nothing', () => {
    const r = play(lit(6, 9), next, { type: 'hopShown', to: ACCUSE, i: 0 });
    expect(play(r, { type: 'hopShown', to: ACCUSE, i: 0 })).toBe(r);
    expect(play(r, { type: 'hopShown', to: MAP, i: 0 })).toBe(r);
  });

  it('Next during a hop jumps to the stop; Back during a hop stays put', () => {
    const hopping = play(lit(1, 4), next);
    expect(hopping).toMatchObject({ stop: 1, hop: { to: MAP, i: 0 } });
    expect(play(hopping, next)).toMatchObject({ stop: MAP, hop: undefined });
    expect(play(hopping, back)).toMatchObject({ stop: 1, hop: undefined });
  });

  it('Back never hops, and goes nowhere on a run’s first stop', () => {
    const atMap = play(lit(1, 4), next, next);
    expect(play(atMap, back)).toMatchObject({ stop: 1, hop: undefined });
    const first = lit(4, 6);
    expect(play(first, back)).toBe(first);
  });

  it('Next on the last stop ends the run as done', () => {
    const r = play(lit(9, 9), next);
    expect(r).toMatchObject({ phase: 'out', done: true });
    expect(goodbye(r)).toBe('Tour done. Good luck tonight.');
  });
});

describe('9. the progress bar', () => {
  it('counts every stop of the tour, and each hop lands on the next', () => {
    let r = lit();
    expect(progressOf(r)).toEqual({ at: 1, of: 10 });
    r = play(r, next, next, next); // stop 3, the Map, by its hop (Next skips it)
    expect(r).toMatchObject({ stop: MAP, hop: undefined });
    expect(progressOf(r)).toEqual({ at: 3, of: 10 });
  });
});

describe('10–11. leaving, once', () => {
  it('Skip, Escape and Back on the phone end it without touring it', () => {
    const r = play(lit(), next, { type: 'finish', done: false });
    expect(r).toMatchObject({ phase: 'out', done: false, hop: undefined });
    expect(goodbye(r)).toBe('Tour closed.');
  });

  it('ends once: a second finish, or a step on the way out, changes nothing', () => {
    const out = play(lit(), { type: 'finish', done: false });
    expect(play(out, { type: 'finish', done: true })).toBe(out);
    expect(play(out, next)).toBe(out);
    const gone = play(out, { type: 'dark' });
    expect(gone.phase).toBe('gone');
    expect(play(gone, { type: 'dark' })).toBe(gone);
  });

  it('something else needing the player ends it even while the lights go down, and says why', () => {
    const r = play(startRun(0, 9), { type: 'finish', done: false, why: 'a vote needs you' });
    expect(r.phase).toBe('out');
    expect(goodbye(r)).toBe('Tour closed: a vote needs you.');
  });
});

describe('12. a hop never hangs the run', () => {
  it('a hop whose target is missing moves on as soon as it says so', () => {
    const r = play(lit(1, 4), next, { type: 'hopShown', to: MAP, i: 0 });
    expect(r).toMatchObject({ stop: MAP, hop: undefined });
  });
});
