// Natalia's desk: a dark room, lamp light on a wooden desk, and the night's papers landing on it one at a time (wait,
// or tap the right of the screen for the next and the left to go back; swipe works too). The editions, then your
// crawl and your points open on top, then your profile, folded; the last tap unfolds it to fill the screen. Drawn on
// a 390×844 stage scaled to the screen; with reduced motion nothing falls or folds.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BobFigure } from './art';

export const STAGE_W = 390;
export const STAGE_H = 844;

/** A paper that lands on the pile: drawn landing (falling onto the desk) or already there. */
export interface DeskItem {
  key: string;
  /** What a screen reader hears when it lands. */
  label: string;
  /** How long it stays before the next lands by itself. */
  hold: number;
  hint?: string;
  render: (state: { landing: boolean; top: boolean }) => ReactNode;
}

const LIGHTS_HOLD = 1800;
const FOLD_HOLD = 2600;
/** The fold opening: the flap comes down, then the page grows to fill the screen. */
const UNFOLD_MS = 1650;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Desk({
  items,
  fold,
  sheet,
  plate,
  onClose,
}: {
  items: DeskItem[];
  /** The last paper, folded on the pile: the top of the sheet shows; the flap is the rest. */
  fold: { label: string; hint: string; pose: { x: number; y: number; r: number } };
  /** The page it unfolds into, drawn at the screen's own width. */
  sheet: ReactNode;
  plate: { title: string; sub: string };
  onClose: () => void;
}) {
  // Pages: 0 the lights, 1..n each item landing, n+1 the folded profile, n+2 it open.
  const last = items.length + 2;
  const [cur, setCur] = useState(0);
  const [moved, setMoved] = useState<{ from: number; animate: boolean }>({ from: -1, animate: false });
  const [playing, setPlaying] = useState(true);
  const [size, setSize] = useState({ w: STAGE_W, h: STAGE_H });
  const box = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  const at = useRef(0);
  const go = useCallback(
    (to: number, auto = false) => {
      const from = at.current;
      const next = Math.max(0, Math.min(last, to));
      if (next === from) return;
      at.current = next;
      setMoved({ from, animate: next === from + 1 && !reducedMotion() });
      // Going back to look again stops the papers landing by themselves.
      if (!auto && next < from) setPlaying(false);
      setCur(next);
    },
    [last],
  );

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const seen = new ResizeObserver(fit);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  // Wait, and the next paper lands by itself.
  const hold = cur === 0 ? LIGHTS_HOLD : cur <= items.length ? items[cur - 1].hold : cur === items.length + 1 ? FOLD_HOLD : null;
  useEffect(() => {
    if (!playing || hold === null) return;
    const id = window.setTimeout(() => go(cur + 1, true), hold);
    return () => window.clearTimeout(id);
  }, [cur, hold, playing, go]);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  const open = cur === last;
  const s = Math.min(size.w / STAGE_W, size.h / STAGE_H);
  const landed = Math.min(cur, items.length);
  const unfolding = open && moved.from === last - 1 && moved.animate;

  const onPointerDown = (e: PointerEvent) => {
    if (open || (e.target as Element).closest('button, a')) return;
    down.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || open) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return go(cur + (dx < 0 ? 1 : -1));
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const r = box.current!.getBoundingClientRect();
      go(cur + ((e.clientX - r.left) / r.width < 0.3 ? -1 : 1));
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (open) return;
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      go(cur + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(cur - 1);
    }
  };

  const hint = cur === 0 ? 'Tap for tonight’s papers' : cur <= items.length ? (items[cur - 1].hint ?? '') : cur === items.length + 1 ? fold.hint : '';
  const said = cur === 0 ? plate.title : cur <= items.length ? items[cur - 1].label : fold.label;

  return (
    <div
      className={`cc-desk${open ? ' is-open' : ''}${unfolding ? ' is-unfolding' : ''}`}
      ref={box}
      tabIndex={-1}
      role="group"
      aria-roledescription="case file"
      aria-label="Case closed: tap the right side for the next paper, the left side to go back"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (down.current = null)}
      onKeyDown={onKeyDown}
    >
      <div className="cc-desk__wood" />
      <div className="cc-desk__stage" style={{ transform: `translate(${(size.w - STAGE_W * s) / 2}px, ${(size.h - STAGE_H * s) / 2}px) scale(${s})` }}>
        <BobFigure className="cc-desk__bob" />
        <i className="cc-desk__ring" />
        <i className="cc-desk__pen" />
        {cur <= 1 ? (
          <div className={`cc-desk__plate${cur === 0 && moved.from === -1 ? ' is-lit' : ''}`}>
            <b>{plate.title}</b>
            <span>{plate.sub}</span>
          </div>
        ) : null}
        <div className="cc-desk__pile">
          {items.slice(0, landed).map((item, i) => (
            <div key={item.key} className="cc-desk__item">
              {item.render({ landing: moved.animate && i === landed - 1 && moved.from === i && cur === i + 1, top: i === landed - 1 })}
            </div>
          ))}
          {/* The rest of the desk goes dark under the profile as it opens. */}
          {unfolding ? <i className="cc-desk__hush" /> : null}
          {cur >= items.length + 1 ? (
            <div
              className={`cc-fold${moved.animate && cur === items.length + 1 ? ' is-landing' : ''}${unfolding ? ' is-opening' : ''}`}
              style={{ '--x': `${fold.pose.x}px`, '--y': `${fold.pose.y}px`, '--r': `${fold.pose.r}deg` } as CSSProperties}
              aria-hidden="true"
            >
              <div className="cc-fold__top">{sheet}</div>
              <div className="cc-fold__flap">
                <div className="cc-fold__front">
                  <div className="cc-fold__shift">{sheet}</div>
                </div>
                <div className="cc-fold__back" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="cc-desk__light" />
      {open ? (
        <div className="cc-desk__open" style={unfolding ? { animationDelay: `${UNFOLD_MS}ms` } : undefined}>
          {sheet}
          <p className="cc-desk__again">
            <button type="button" className="cc-desk__back" onClick={() => go(last - 1)}>
              Back to the desk
            </button>
          </p>
        </div>
      ) : null}
      <div className="cc-desk__top">
        <div className="cc-desk__progress" aria-hidden="true">
          {open
            ? null
            : Array.from({ length: last + 1 }, (_, i) => <i key={i} className={i <= cur ? 'is-on' : ''} />)}
        </div>
        <button type="button" className="cc-desk__close" onClick={onClose} aria-label="Close the case file">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {hint ? (
        <p className="cc-desk__hint" aria-hidden="true">
          {hint}
        </p>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
