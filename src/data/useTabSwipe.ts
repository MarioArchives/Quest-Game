import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { isTabSwipe, swipeBlocked, swipeTab, type SwipeNode, type TabId } from '../lib/nav';

const FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const SLIDER = '[role="slider"], input[type="range"]';
const DIALOG = '[role="dialog"], dialog, .sheet-root';
/** How long the slide-in class stays on the screen (matches AppFrame.css). */
const SLIDE_MS = 250;

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

    main.addEventListener('touchstart', onStart, { passive: true });
    main.addEventListener('touchend', onEnd, { passive: true });
    main.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.clearTimeout(slide);
      main.removeEventListener('touchstart', onStart);
      main.removeEventListener('touchend', onEnd);
      main.removeEventListener('touchcancel', onCancel);
    };
  }, [ref]);
}
