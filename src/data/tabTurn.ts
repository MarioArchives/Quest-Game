import type { NavigateFunction } from 'react-router';
import { springSettled, springStep, type Spring } from '../lib/spring';

// A page turn between bottom tabs, built on the browser's View Transitions (see the block in AppFrame.css). The old screen
// is a snapshot, the new one is live; the finger (or a tap's tween, or a spring) writes one number, --turn on <html>, and
// the pseudo-elements' CSS reads it. The transition's own animations are switched off and a long do-nothing animation on
// ::view-transition keeps it open, so nothing is paused or scrubbed (Safari is shaky at that); skipTransition() ends it.

/** How long the safety wait for a lazily loaded screen (or the history to settle) may last, in ms. */
const WAIT_MS = 1500;
/** A tap's turn, in ms. */
const PLAY_MS = 450;

export interface Turn {
  /** The finger moved: `progress` is 0–1. */
  drag(progress: number): void;
  /** The finger let go: spring to the end (commit) or back (cancel), then end the turn. */
  release(outcome: 'commit' | 'cancel', velocity: number): Promise<void>;
  /** A tap: turn 0 → 1 in about half a second, then end the turn. */
  play(): Promise<void>;
}

/** Whether this browser can turn pages and the person hasn't asked for less motion. */
export function canTurn(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

let running = false;

/** Whether a turn is on screen now (taps wait for it to finish). */
export const turning = () => running;

const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Wait (polling) until `done()` holds or WAIT_MS has passed. */
async function until(done: () => boolean) {
  for (let waited = 0; !done() && waited < WAIT_MS; waited += 50) await sleep(50);
}

/** The first background colour that isn't transparent, from `el` up through the page. */
function paperBehind(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return 'white';
}

/**
 * Starts a turn to `to`, `dir` 1 going on (the old screen turns away), -1 going back (the previous one comes down on top).
 * Null when one is already running, the browser can't, or the screen isn't there.
 */
export function startTurn(opts: { to: string; dir: 1 | -1; navigate: NavigateFunction }): Turn | null {
  const { to, dir, navigate } = opts;
  const main = document.querySelector<HTMLElement>('main.app__main');
  const appbar = document.querySelector<HTMLElement>('.appbar');
  const tabbar = document.querySelector<HTMLElement>('.tabbar');
  if (running || !canTurn() || !main) return null;
  running = true;

  const root = document.documentElement;
  const sourceHash = window.location.hash;
  const savedScrollY = window.scrollY;
  const classes = ['tab-turning', dir === 1 ? 'tab-turn-fwd' : 'tab-turn-back'];
  const props = ['--turn', '--turn-origin-old', '--turn-origin-new', '--turn-paper'];

  // Measured before the old capture: everything set here is in the old snapshot. The page turns about the middle of the
  // visible stretch between the bars, so the hinge sits there on the page's own height.
  const mainRect = main.getBoundingClientRect();
  const top = appbar ? appbar.getBoundingClientRect().bottom : 0;
  const bottom = tabbar ? tabbar.getBoundingClientRect().top : window.innerHeight;
  const midY = (Math.max(top, 0) + Math.min(bottom, window.innerHeight)) / 2;
  root.style.setProperty('--turn', '0');
  root.style.setProperty('--turn-origin-old', `${midY - mainRect.top}px`);
  root.style.setProperty('--turn-paper', paperBehind(main));
  root.classList.add(...classes, 'tab-turn-old');

  let went = false;
  let ended = false;
  let p = 0;
  let releasing = false;
  const setTurn = (x: number) => {
    p = Math.min(1, Math.max(0, x));
    root.style.setProperty('--turn', String(p));
  };

  const transition = document.startViewTransition(async () => {
    root.classList.replace('tab-turn-old', 'tab-turn-new');
    navigate(to, { flushSync: true });
    went = true;
    window.scrollTo(0, 0);
    await until(() => !main.querySelector('.app__loader'));
    const rect = main.getBoundingClientRect();
    root.style.setProperty('--turn-origin-new', `${midY - rect.top}px`);
  });
  transition.ready.catch(() => {});
  const callbackDone = transition.updateCallbackDone.catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => {
      ended = true;
      root.classList.remove(...classes, 'tab-turn-old', 'tab-turn-new');
      for (const name of props) root.style.removeProperty(name);
      running = false;
    });

  /** Back to the screen the turn began on, without a trace: used when the turn is cancelled. */
  const goBack = async () => {
    if (!went) return;
    navigate(-1);
    await until(() => window.location.hash === sourceHash && !main.querySelector('.app__loader'));
    // AppFrame scrolls to the top on every path change; put the page back after that has run.
    await frame();
    await frame();
    window.scrollTo(0, savedScrollY);
    await frame();
  };

  const end = () => {
    if (!ended) transition.skipTransition();
  };

  /** Runs `step` each frame until it says it's done. */
  const animate = async (step: (dt: number, now: number) => boolean) => {
    let last = await frame();
    const t0 = last;
    for (;;) {
      const now = await frame();
      if (ended) return;
      const done = step(Math.min((now - last) / 1000, 0.05), now - t0);
      last = now;
      if (done) return;
    }
  };

  const settle = async (outcome: 'commit' | 'cancel', run: (target: number) => Promise<void>) => {
    if (releasing) return;
    releasing = true;
    await callbackDone;
    if (ended) {
      if (outcome === 'cancel') await goBack();
      return;
    }
    await run(outcome === 'commit' ? 1 : 0);
    if (outcome === 'cancel') await goBack();
    end();
  };

  return {
    drag(progress) {
      if (!ended && !releasing) setTurn(progress);
    },
    release(outcome, velocity) {
      return settle(outcome, async (target) => {
        let s: Spring = { x: p, v: velocity };
        await animate((dt) => {
          s = springStep(s, target, dt);
          setTurn(s.x);
          return springSettled(s, target) || (Math.abs(s.x - target) < 0.004 && Math.abs(s.v) < 0.05);
        });
        setTurn(target);
      });
    },
    play() {
      return settle('commit', async () => {
        const from = p;
        await animate((_dt, ms) => {
          const k = Math.min(1, ms / PLAY_MS);
          setTurn(from + (1 - from) * (1 - (1 - k) ** 3));
          return k >= 1;
        });
        setTurn(1);
      });
    },
  };
}
