// The tour over the specimen night: everything dark but a torch's spot on the stop's element, a kraft tag tied to a
// brass tack on it (hanging under it, or turned over above it so the twine never crosses the tag), the SPECIMEN NIGHT
// badge at the top, and at the foot a progress bar and Skip. The spot, the twine, the tack and the tag glide from stop
// to stop (or jump, with reduced motion); the tag swings a little as it lands. On the way to somewhere else the torch
// goes to each thing you'd tap (a hop), the red pen (Marks.tsx) drawing an arrow to it unless the hop says not to.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ArrowIcon, CheckIcon, HangTag, Tack, TagText, tagWords } from './HangTag';
import { boxIn, place, type Limits, type Placement } from './layout';
import { badgeLow, hopArrow, padded, union, within, type Box, type HopArrow } from './marks';
import { Arrow } from './Marks';
import type { Phase } from './run';
import { selectorOf, STOPS, TILT } from './stops';
import type { TourStop } from './words';

/** A hop on the way to a stop elsewhere, as the tour shows it: what to point at, from where, and when to look. */
export interface HopView {
  /** Which hop: the stop it leads to and its place among that stop's hops. */
  to: number;
  i: number;
  /** The thing you'd tap: a selector, or a data-tour name. */
  target: string;
  /** What was lit before it (names or selectors), for the arrow to start from. */
  from: string[];
  /** What a screen reader hears on the way ("the Map"); nothing is written on the screen. */
  label: string;
  /** Wait this long first (the page turning to the hop's screen). */
  settle: number;
  /** On a screen other than the stop's (so nothing the stop lit is there). */
  elsewhere: boolean;
  /** Draw the pen's arrow to it (the torch goes there either way). */
  arrow: boolean;
}

/** The tag's width: the stop's own, else 220, never wider than the phone allows. */
const tagWidth = (stop: TourStop, phone: number) => Math.min(stop.width ?? 220, phone - 24);

function limits(root: HTMLElement, top: HTMLElement | null): Limits {
  const bar = root.querySelector<HTMLElement>('.tr-bar');
  const nav = bar?.querySelector<HTMLElement>('.tabbar');
  const inset = nav ? parseFloat(getComputedStyle(nav).paddingBottom) || 0 : 0;
  return {
    top: top ? top.offsetTop + top.offsetHeight + 2 : 40,
    bottom: bar ? bar.offsetTop + bar.offsetHeight - inset - 6 : root.clientHeight - 8,
    width: root.clientWidth,
    floor: root.clientHeight,
  };
}

/** The visible part of what `names` light, in the root; null when none of it is on the page. */
function litBox(root: HTMLElement, names: string[], lim: Limits): Box | null {
  const boxes = names.flatMap((name) => {
    const el = root.querySelector(selectorOf(name));
    return el && (el as HTMLElement).offsetParent ? [boxIn(el, root)] : [];
  });
  const u = union(boxes);
  return u ? within(u, lim.top, lim.bottom) : null;
}

export function TourLayer({
  root,
  stops,
  stop,
  phase,
  first,
  last,
  progress,
  reduced,
  hop,
  onHopShown,
  onBack,
  onNext,
  onEnd,
}: {
  root: RefObject<HTMLDivElement | null>;
  stops: TourStop[];
  stop: number;
  phase: Phase;
  /** No stop before this one in this run (Back has nowhere to go). */
  first: boolean;
  /** The run's last stop: Next says Done. */
  last: boolean;
  /** How far through the run this stop is: the `at`th of `of` (a part of the tour counts only its own stops). */
  progress: { at: number; of: number };
  reduced: boolean;
  /** On the way to the next stop: what's being pointed at. */
  hop: HopView | null;
  /** That hop has been pointed out (or there was nothing to point at): the tour can move on. */
  onHopShown: (to: number, i: number) => void;
  onBack: () => void;
  onNext: () => void;
  onEnd: () => void;
}) {
  const tag = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<Placement | null>(null);
  /** The first placement (and one after a resize) lands without gliding. */
  const [jump, setJump] = useState(true);
  const s = stops[stop]!;
  const [width, setWidth] = useState(() => tagWidth(s, root.current?.clientWidth ?? 390));
  const [screen, setScreen] = useState({ w: 390, h: 844, top: 40 });

  const relayout = useCallback(
    (instant: boolean) => {
      const el = root.current;
      const t = tag.current;
      if (!el || !t) return;
      const w = tagWidth(s, el.clientWidth);
      if (w !== width) {
        setWidth(w); // measured again once it's that wide
        return;
      }
      const lim = limits(el, top.current);
      setScreen({ w: el.clientWidth, h: el.clientHeight, top: lim.top });
      const p = place(el, s, { w, h: t.offsetHeight }, lim);
      if (!p) return;
      if (instant) setJump(true);
      setAt(p);
      const behavior = reduced || instant ? 'auto' : 'smooth';
      if (p.scroller && p.scrollTop !== null) p.scroller.scrollTo({ top: p.scrollTop, behavior });
      // A tab with nothing lit on it goes back to its top, rather than staying wherever the last stop left it.
      const tab = el.querySelector<HTMLElement>(`.tr-pane--${s.tab}[data-scroller]`);
      if (tab && tab.scrollTop > 0 && !s.lit.some((name) => tab.querySelector(selectorOf(name)))) tab.scrollTo({ top: 0, behavior });
    },
    [root, s, width, reduced],
  );

  const latest = useRef(relayout);
  latest.current = relayout;

  // Each stop (and the moment the specimen night is in place): measure, then hang.
  useLayoutEffect(() => {
    if (phase !== 'on') return;
    relayout(at === null);
  }, [phase, stop, width, relayout]);

  // After a jump, glide again from the next stop on.
  useEffect(() => {
    if (!jump || !at) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setJump(false));
    });
    return () => cancelAnimationFrame(id);
  }, [jump, at]);

  // The phone turning, the browser's bars, the fonts arriving: hang it again where it now belongs, without a glide.
  useEffect(() => {
    const el = root.current;
    if (!el || phase !== 'on') return;
    let size = `${el.clientWidth}x${el.clientHeight}`;
    const seen = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now === size) return;
      size = now;
      latest.current(true);
    });
    seen.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => live && latest.current(true));
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [root, phase]);

  // The tag swings as it lands on a new stop, and keeps the keyboard on Next.
  const landed = useRef(stop);
  useEffect(() => {
    if (!at) return;
    go.current?.focus({ preventScroll: true });
    if (landed.current === stop) return;
    landed.current = stop;
    if (reduced) return;
    tag.current?.animate([{ rotate: '5deg' }, { rotate: '-3deg' }, { rotate: '1.4deg' }, { rotate: '-0.5deg' }, { rotate: '0deg' }], {
      duration: 1300,
      easing: 'ease-out',
    });
  }, [at, stop, reduced]);

  // A hop: the page brought round to it if it's scrolled away, then the arrow from what was lit to the thing to tap,
  // the torch going with it unless that thing is inside what's lit already.
  const [hopAt, setHopAt] = useState<(HopArrow & { key: string }) | null>(null);
  /** Where the torch is on a hop elsewhere; it stays there between one hop and the next, until the stop. */
  const [hopSpot, setHopSpot] = useState<Box | null>(null);
  useEffect(() => {
    if (!hop) setHopSpot(null);
  }, [hop]);
  const atRef = useRef(at);
  atRef.current = at;
  const shownRef = useRef(onHopShown);
  shownRef.current = onHopShown;
  useEffect(() => {
    setHopAt(null);
    const el = root.current;
    if (!hop || phase !== 'on' || !el) return;
    const done = () => shownRef.current(hop.to, hop.i);
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    later(() => {
      const target = el.querySelector<HTMLElement>(selectorOf(hop.target));
      if (!target) return done();
      const lim = limits(el, top.current);
      const scroller = target.closest<HTMLElement>('[data-scroller]');
      const r = boxIn(target, el);
      let wait = 0;
      if (scroller && (r.y < lim.top + 10 || r.y + r.h > lim.bottom - 10)) {
        const by = r.y < lim.top + 10 ? r.y - lim.top - 24 : r.y + r.h - lim.bottom + 24;
        scroller.scrollBy({ top: by, behavior: reduced ? 'auto' : 'smooth' });
        wait = reduced ? 0 : 420;
      }
      later(() => {
        const to = boxIn(target, el);
        const arrow = hopArrow({
          to,
          lit: litBox(el, hop.from, lim),
          spot: atRef.current?.spot ?? null,
          tag: tag.current ? boxIn(tag.current, el) : null,
          elsewhere: hop.elsewhere,
        });
        setHopAt({ ...arrow, key: hop.target });
        if (!arrow.inner) setHopSpot(padded(to, el.clientWidth));
        // The arrow and its head take this long to draw (or, without one, the torch to get there); a moment, then on.
        later(done, reduced ? 650 : !hop.arrow ? 900 : arrow.inner ? 1050 : 1250);
      }, wait);
    }, hop.settle);
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [hop, phase, root, reduced]);

  const shown = phase === 'on' && at;
  // On a hop elsewhere the torch goes to the thing to tap and the tag steps back; on one inside what's lit, both stay.
  const away = !!hop && !(hopAt?.inner ?? false);
  const spot = (hop && hopSpot) || at?.spot;

  return (
    <div className={`tr-tour is-${phase}${jump ? ' is-jump' : ''}`}>
      <div className="tr-catch" aria-hidden="true" />
      <span
        className={`tr-spot${spot ? '' : ' is-none'}`}
        style={spot ? { left: spot.x, top: spot.y, width: spot.w, height: spot.h } : { left: '50%', top: '45%', width: 0, height: 0 }}
        aria-hidden="true"
      />
      {shown && !hop && s.pen === 'swipe' ? (
        <span className="tr-pen" style={{ left: at.spot.x + at.spot.w / 2, top: at.spot.y + 18 }} aria-hidden="true">
          <svg viewBox="0 0 250 40">
            <path d="M8 22 C 70 14, 170 14, 242 20" />
            <path d="M20 12l-12 10 13 8" />
            <path d="M230 9l12 11-13 9" />
          </svg>
        </span>
      ) : null}
      {shown ? (
        <svg className="tr-marks" aria-hidden="true">
          {hopAt && hop?.arrow ? <Arrow key={`hop-${hopAt.key}`} from={hopAt.from} to={hopAt.to} screen={screen} away={hopAt.away} delay={hopAt.inner ? 0 : 0.25} /> : null}
        </svg>
      ) : null}
      <div className={`tr-hang${shown && !away ? ' is-shown' : ''}`}>
        {at ? <span className="tr-cord" style={{ left: at.cord.x - 1.5, top: at.cord.y1, height: Math.max(0, at.cord.y2 - at.cord.y1) }} /> : null}
        {at?.tacks.map((t, i) => <Tack key={i} x={t.x} y={t.y} />)}
        <HangTag
          width={width}
          tilt={TILT[stop] ?? 0}
          flip={at?.flip}
          className="tr-ht--tour"
          style={at ? { left: at.tag.x, top: at.tag.y } : { left: 0, top: 0 }}
          ref={tag}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="tr-stop-title" aria-describedby="tr-stop-text">
            <p className="tr-ht__no">
              <span>No. {stop + 1}</span>
              <span>of {STOPS.length}</span>
            </p>
            <p className="tr-ht__sec" id="tr-stop-title">
              {s.title}
            </p>
            <p className="tr-ht__t" id="tr-stop-text">
              <TagText text={s.text} />
            </p>
            <p className="tr-ht__foot">
              <button type="button" className="tr-ht__back" onClick={onBack} disabled={first}>
                Back
              </button>
              <button type="button" className="tr-ht__go" onClick={onNext} ref={go}>
                {last ? (
                  <>
                    Done <CheckIcon />
                  </>
                ) : (
                  <>
                    Next <ArrowIcon />
                  </>
                )}
              </button>
            </p>
          </div>
        </HangTag>
      </div>
      <span className="tr-black" aria-hidden="true" />
      <div className={`tr-strip${spot && badgeLow(spot, screen.w) ? ' is-low' : ''}`} ref={top} aria-hidden="true">
        <span className="tr-specimen">Specimen night</span>
      </div>
      <div className="tr-dock">
        <div
          className="tr-progress"
          role="progressbar"
          aria-label="The tour"
          aria-valuemin={1}
          aria-valuemax={progress.of}
          aria-valuenow={progress.at}
          aria-valuetext={`Stop ${progress.at} of ${progress.of}`}
        >
          {Array.from({ length: progress.of }, (_, i) => (
            <span key={i} className={i < progress.at - 1 ? 'is-done' : i === progress.at - 1 ? 'is-on' : undefined} />
          ))}
        </div>
        <button type="button" className="tr-skip" onClick={onEnd}>
          Skip
        </button>
      </div>
      <p className="tr-sr" aria-live="polite">
        {hop ? `On the way: ${hop.label}.` : shown ? `Stop ${progress.at} of ${progress.of}: ${s.title}. ${tagWords(s.text)}` : ''}
      </p>
    </div>
  );
}
