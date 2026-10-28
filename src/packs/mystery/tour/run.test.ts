// Torch tour plan edge cases 8–12: a run's moves, its hops, its parts and how it ends.
import { describe, expect, it } from 'vitest';
import { goodbye, progressOf, runReducer, startRun, type Run, type RunAction } from './run';
import { PARTS, runRange, STOPS } from './stops';

const play = (run: Run, ...actions: RunAction[]) => actions.reduce((r, a) => runReducer(r, a), run);
const lit = (from = 0, to = STOPS.length - 1) => play(startRun(from, to), { type: 'lit' });
const next: RunAction = { type: 'step', by: 1 };
const back: RunAction = { type: 'step', by: -1 };
/** Stop 5 (the Map) is reached by one hop; stop 11 (Press charges) by three. */
const MAP = 4;
const ACCUSE = 10;

describe('8. hops and Back', () => {
  it('a run starts with the lights going down, then shows its first stop', () => {
    const r = startRun(0, 18);
    expect(r).toMatchObject({ stop: 0, phase: 'in' });
    expect(runReducer(r, next)).toBe(r); // nothing moves in the dark
    expect(runReducer(r, { type: 'lit' }).phase).toBe('on');
  });

  it('Next to a stop elsewhere plays each of its hops in order, then lands', () => {
    let r = play(lit(), { type: 'step', by: 1 }); // stop 2: no hops
    expect(r).toMatchObject({ stop: 1, hop: undefined });
    r = play(lit(9, 14), next);
    expect(r.hop).toEqual({ to: ACCUSE, i: 0 });
    r = play(r, { type: 'hopShown', to: ACCUSE, i: 0 });
    expect(r.hop).toEqual({ to: ACCUSE, i: 1 });
    r = play(r, { type: 'hopShown', to: ACCUSE, i: 1 }, { type: 'hopShown', to: ACCUSE, i: 2 });
    expect(r).toMatchObject({ stop: ACCUSE, hop: undefined });
  });

  it('a hop that says it was shown after it was overtaken changes nothing', () => {
    const r = play(lit(9, 14), next, { type: 'hopShown', to: ACCUSE, i: 0 });
    expect(play(r, { type: 'hopShown', to: ACCUSE, i: 0 })).toBe(r);
    expect(play(r, { type: 'hopShown', to: MAP, i: 0 })).toBe(r);
  });

  it('Next during a hop jumps to the stop; Back during a hop stays put', () => {
    const hopping = play(lit(3, 7), next);
    expect(hopping).toMatchObject({ stop: 3, hop: { to: MAP, i: 0 } });
    expect(play(hopping, next)).toMatchObject({ stop: MAP, hop: undefined });
    expect(play(hopping, back)).toMatchObject({ stop: 3, hop: undefined });
  });

  it('Back never hops, and goes nowhere on a run’s first stop', () => {
    const atMap = play(lit(3, 7), next, next);
    expect(play(atMap, back)).toMatchObject({ stop: 3, hop: undefined });
    const first = lit(5, 7);
    expect(play(first, back)).toBe(first);
  });

  it('Next on the last stop ends the run as done', () => {
    const r = play(lit(18, 18), next);
    expect(r).toMatchObject({ phase: 'out', done: true });
    expect(goodbye(r)).toBe('Tour done. It stays in My file: How tonight works.');
  });
});

describe('9. a part of the tour', () => {
  it('Accusing counts its own stops, 1 to 5, while each keeps its number in the tour', () => {
    const { from, to } = runRange(PARTS.findIndex((p) => p.label === 'Accusing'));
    let r = lit(from, to); // a part starts on its first stop, no hops
    expect(r).toMatchObject({ stop: 10, hop: undefined });
    expect(progressOf(r)).toEqual({ at: 1, of: 5 });
    r = play(r, next, next, next, next, next, next, next); // each stop after it by its hop (Next skips it)
    expect(r.stop).toBe(14);
    expect(progressOf(r)).toEqual({ at: 5, of: 5 });
    expect(play(r, next)).toMatchObject({ phase: 'out', done: true });
  });

  it('the whole tour is every stop', () => {
    expect(runRange(null)).toEqual({ from: 0, to: STOPS.length - 1 });
  });
});

describe('10–11. leaving, once', () => {
  it('Skip, Escape and Back on the phone end it without touring it', () => {
    const r = play(lit(), next, { type: 'finish', done: false });
    expect(r).toMatchObject({ phase: 'out', done: false, hop: undefined });
    expect(goodbye(r)).toBe('Tour closed. Pick it up in My file whenever you like.');
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
    const r = play(startRun(0, 18), { type: 'finish', done: false, why: 'a vote needs you' });
    expect(r.phase).toBe('out');
    expect(goodbye(r)).toBe('Tour closed: a vote needs you.');
  });
});

describe('12. a hop never hangs the run', () => {
  it('a hop whose target is missing moves on as soon as it says so', () => {
    const r = play(lit(3, 7), next, { type: 'hopShown', to: MAP, i: 0 });
    expect(r).toMatchObject({ stop: MAP, hop: undefined });
  });
});
