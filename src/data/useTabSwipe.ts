import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { isTabSwipe, swipeBlocked, swipeLock, swipeTab, turnOutcome, turnProgress, type SwipeNode, type TabId } from '../lib/nav';
import { brand } from '../pack';
import { canTurn, startTurn, type Turn } from './tabTurn';

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const SLIDER = '[role="slider"], input[type="range"]';
const DIALOG = '[role="dialog"], dialog, .sheet-root';
/** How long the slide-in class stays on the screen (matches AppFrame.css). */
const SLIDE_MS = 250;

/** How much of the finger's last movement counts for the speed it lets go at, in ms. */
const VELOCITY_MS = 100;

/** Whether this pack turns pages with the finger (and this browser can), rather than sliding on release. */
const turnsPages = () => brand.tabSwipe === 'turn' && canTurn();

/** One element on the way up from the touch, as plain data for swipeBlocked. */
function nodeOf(el: Element): SwipeNode {
  const overflowX = getComputedStyle(el).overflowX;
  return {
    ownSwipe: el.hasAttribute('data-own-swipe'),
    scrollsX: (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1,
    field: el.matches(FIELD),
    slider: el.matches(SLIDER),
    dialog: el.matches(DIALOG),
  };
}

/**
 * Swipe sideways on the screen to move to the next or previous bottom tab. Touch only, with passive listeners so
 * scrolling stays smooth; anything that uses sideways movement itself (see swipeBlocked) keeps it.
 * A pack with `tabSwipe: 'turn'` turns the page following the finger (pointer events, see tabTurn.ts); otherwise the
 * new screen slides in after the release.
 * `tabs` is the bottom bar in order, `lit` the one showing; `enabled` is false on screens that pan (the map).
 */
export function useTabSwipe(
  ref: RefObject<HTMLElement | null>,
  tabs: readonly { id: TabId; to: string }[],
  lit: TabId | null,
  enabled: boolean,
) {
  const navigate = useNavigate();
  // The latest values, so the listeners are set up once.
  const latest = useRef({ tabs, lit, enabled, navigate });
  latest.current = { tabs, lit, enabled, navigate };

  useEffect(() => {
    const main = ref.current;
    if (!main) return;
    let start: { x: number; y: number; t: number; blocked: boolean } | null = null;
    let slide: number | undefined;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (turnsPages()) return; // the pointer handlers below take this gesture
      if (e.touches.length !== 1 || !(e.target instanceof Element)) return;
      const chain: SwipeNode[] = [];
      for (let el: Element | null = e.target; el && el !== main; el = el.parentElement) chain.push(nodeOf(el));
      const { clientX: x, clientY: y } = e.touches[0]!;
      start = { x, y, t: e.timeStamp, blocked: swipeBlocked(chain) };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      const c = e.changedTouches[0];
      if (!s || s.blocked || !c || e.touches.length > 0) return;
      const { tabs, lit, enabled, navigate } = latest.current;
      const dx = c.clientX - s.x;
      if (!enabled || !isTabSwipe({ dx, dy: c.clientY - s.y, ms: e.timeStamp - s.t })) return;
      const to = swipeTab(tabs.map((t) => t.id), lit, dx);
      const tab = tabs.find((t) => t.id === to);
      if (!tab) return;
      navigate(tab.to);
      // A short slide in from the side the finger moved towards.
      const dir = dx < 0 ? 'app__main--from-right' : 'app__main--from-left';
      main.classList.remove('app__main--from-right', 'app__main--from-left');
      void main.offsetWidth;
      main.classList.add(dir);
      window.clearTimeout(slide);
      slide = window.setTimeout(() => main.classList.remove(dir), SLIDE_MS);
    };
    const onCancel = () => {
      start = null;
    };

    // The page turn: pointer events, since the turn swaps the screen mid-drag and touch events would keep targeting the old node.
    let g: {
      id: number; x: number; y: number; width: number;
      turn: Turn | null; dir: 1 | -1; p: number; samples: { t: number; p: number }[];
    } | null = null;
    const letGo = (outcome?: 'commit' | 'cancel', velocity = 0) => {
      const done = g;
      g = null;
      if (done?.turn) void done.turn.release(outcome ?? 'cancel', outcome ? velocity : 0);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (g) return letGo(); // a second finger
      g = null;
      if (!e.isPrimary || !turnsPages() || !(e.target instanceof Element)) return;
      const { lit, enabled } = latest.current;
      if (!enabled || lit === null) return;
      const chain: SwipeNode[] = [];
      for (let el: Element | null = e.target; el && el !== main; el = el.parentElement) chain.push(nodeOf(el));
      if (swipeBlocked(chain)) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, width: main.clientWidth, turn: null, dir: 1, p: 0, samples: [] };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      if (!g.turn) {
        const lock = swipeLock({ dx, dy: e.clientY - g.y });
        if (lock === 'y') g = null;
        if (lock !== 'x' || !g) return;
        const { tabs, lit, navigate } = latest.current;
        const tab = tabs.find((t) => t.id === swipeTab(tabs.map((x) => x.id), lit, dx));
        const dir = dx < 0 ? 1 : -1;
        const turn = tab ? startTurn({ to: tab.to, dir, navigate }) : null;
        if (!turn) {
          g = null;
          return;
        }
        g.turn = turn;
        g.dir = dir;
        try {
          main.setPointerCapture(e.pointerId);
        } catch {
          // the pointer is gone; the release will say so
        }
      }
      g.p = turnProgress(dx, g.width, g.dir);
      g.turn.drag(g.p);
      g.samples.push({ t: e.timeStamp, p: g.p });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0]!.t > VELOCITY_MS) g.samples.shift();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const { samples, p } = g;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocity = first && last && last.t > first.t ? ((last.p - first.p) / (last.t - first.t)) * 1000 : 0;
      letGo(turnOutcome({ progress: p, velocity }), velocity);
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (g && e.pointerId === g.id) letGo();
    };
    // Nothing scrolls under a turn.
    const onTouchMove = (e: TouchEvent) => {
      if (g?.turn && e.cancelable) e.preventDefault();
    };

    main.addEventListener('pointerdown', onPointerDown);
    main.addEventListener('pointermove', onPointerMove);
    main.addEventListener('pointerup', onPointerUp);
    main.addEventListener('pointercancel', onPointerCancel);
    main.addEventListener('touchmove', onTouchMove, { passive: false });
    main.addEventListener('touchstart', onStart, { passive: true });
    main.addEventListener('touchend', onEnd, { passive: true });
    main.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.clearTimeout(slide);
      letGo();
      main.removeEventListener('pointerdown', onPointerDown);
      main.removeEventListener('pointermove', onPointerMove);
      main.removeEventListener('pointerup', onPointerUp);
      main.removeEventListener('pointercancel', onPointerCancel);
      main.removeEventListener('touchmove', onTouchMove);
      main.removeEventListener('touchstart', onStart);
      main.removeEventListener('touchend', onEnd);
      main.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);
}
