// Where the torch's spot, the brass tack, the twine and the hanging tag go for one stop. `place` measures the lit
// elements where they will rest (by offsets, which ignore transforms, so a screen still sliding in or a sheet still
// rising counts as arrived) and hands the boxes to `planPlacement`, which is pure: a screen that scrolls is scrolled, as
// little as it can be, so the element and its tag both fit. The tag hangs under the spot from a tack on its bottom edge
// when there's room; otherwise it sits above the spot turned over, its eyelet at the foot, tied by a short strand to a
// tack on the spot's top edge, so the twine never crosses the tag. When neither fits (a short screen), the smaller
// `core` box is tried, and last of all the tag hangs under a shortened spot (or over one cut down from the top), kept
// on the screen even if that means over the spot.
import { union, type Box } from './marks';
import { selectorOf } from './stops';

export interface Placement {
  spot: Box;
  /** The tag's top left corner. */
  tag: { x: number; y: number };
  /** The twine, a straight drop. */
  cord: { x: number; y1: number; y2: number };
  tacks: { x: number; y: number }[];
  /** Where to scroll the stop's scroller to, or null to leave it. */
  scrollTop: number | null;
  /** The tag sits above the spot, turned over: eyelet and twine at its foot. */
  flip: boolean;
  /** The last resort on a short screen (the spot cut short to keep clear of the tag). */
  squeezed: boolean;
}

/** The free space the tag may hang in: under the overlay's top strip, above the tab bar's home-indicator inset. */
export interface Limits {
  top: number;
  bottom: number;
  width: number;
  /** The foot of the screen the tour is over: no light goes past it (the tour's dock is under it). */
  floor: number;
}

/** One lit element: in its scroller's content when `scrolled`, else in the root. */
export interface Lit {
  box: Box;
  scrolled: boolean;
}

/** The scroller the lit elements sit in: its visible box in the root, where it's scrolled to and how far it can go. */
export interface View {
  x: number;
  top: number;
  h: number;
  now: number;
  max: number;
}

/** The elements a stop lights, measured: `lit`, and the smaller `core` (when the stop has one). */
export interface Lits {
  lit: Lit[];
  core?: Lit[] | null;
}

/** Light around an element. */
const PAD = 8;
/** The spot keeps this far inside the phone's sides. */
const SIDE = 4;
/** The tag keeps this far inside the phone's sides. */
export const TAG_SIDE = 10;
/** Under the spot: its tack sits 8px inside the bottom edge, the twine drops 24px to the knot and the tag's top is
 * 20px under the knot, so the tag starts this far below the spot. */
const BELOW = 36;
/** Over the spot, the same turned over: the tack 8px inside its top edge, 24px of twine up to the knot, and the tag's
 * foot 20px over the knot, so the tag ends this far above the tack. */
const ABOVE = 44;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The lowest the spot's top may be for a turned-over tag to fit above it, under the strip. */
const roomAbove = (tag: { h: number }, lim: Limits) => lim.top + 4 + tag.h + ABOVE - PAD;

/** Lays one stop out from its measured elements; null while none of them are on the page. */
export function planPlacement(lits: Lits, view: View | null, tag: { w: number; h: number }, lim: Limits, growTop = 0): Placement | null {
  const tries = lits.core?.length ? [lits.lit, lits.core] : [lits.lit];
  for (const set of tries) {
    if (!set.length) continue;
    const fit = fitWith(set, view, tag, lim, growTop);
    if (fit) return fit;
  }
  const last = lits.core?.length ? lits.core : lits.lit;
  return last.length ? squeeze(last, view, tag, lim, growTop) : null;
}

/** The lit boxes in the root with the scroller at `s`, padded, as the spot; the light stops at a scroller's edges. */
function spotAt(lits: Lit[], view: View | null, s: number, lim: Limits, growTop: number): Box {
  const boxes = lits.map((l) => (l.scrolled && view ? { ...l.box, x: view.x + l.box.x, y: view.top + l.box.y - s } : l.box));
  const u = union(boxes)!;
  const x0 = clamp(u.x - PAD, SIDE, lim.width - SIDE);
  const x1 = clamp(u.x + u.w + PAD, SIDE, lim.width - SIDE);
  let y0 = u.y - PAD - growTop;
  let y1 = Math.min(u.y + u.h + PAD, lim.floor - 3);
  if (view && lits.some((l) => l.scrolled)) {
    y0 = Math.max(y0, view.top);
    y1 = Math.min(y1, view.top + view.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The tag centred under (or over) the spot, inside the phone's sides; the twine's x follows its knot. */
function tagX(spot: Box, tag: { w: number }, lim: Limits) {
  const x = clamp(spot.x + spot.w / 2 - tag.w / 2, TAG_SIDE, lim.width - TAG_SIDE - tag.w);
  return { x, knot: x + tag.w / 2 + 2 };
}

function hangBelow(spot: Box, tag: { w: number; h: number }, lim: Limits, scrollTop: number | null, squeezed: boolean, tagTop?: number): Placement {
  const { x, knot } = tagX(spot, tag, lim);
  const tack = spot.y + spot.h - PAD;
  const y = tagTop ?? tack + 44;
  return { spot, tag: { x, y }, cord: { x: knot, y1: tack, y2: y - 20 }, tacks: [{ x: knot, y: tack }], scrollTop, flip: false, squeezed };
}

/** Above the spot, turned over: the eyelet at the tag's foot, one strand down from the knot to a tack on the spot. */
function hangAbove(spot: Box, tag: { w: number; h: number }, lim: Limits, scrollTop: number | null, squeezed: boolean): Placement {
  const { x, knot } = tagX(spot, tag, lim);
  const tack = spot.y + PAD;
  const y = tack - ABOVE - tag.h;
  return { spot, tag: { x, y }, cord: { x: knot, y1: y + tag.h + 20, y2: tack }, tacks: [{ x: knot, y: tack }], scrollTop, flip: true, squeezed };
}

/** How much of a scroller's top the overlay's strip (the badge) covers: lit parts scroll no higher. */
const under = (view: View, lim: Limits) => Math.max(0, lim.top - view.top);

const fitsBelow = (spot: Box, tag: { h: number }, lim: Limits) => spot.y + spot.h + BELOW + tag.h <= lim.bottom;
const fitsAbove = (spot: Box, tag: { h: number }, lim: Limits) => roomAbove(tag, lim) <= spot.y;

function fitWith(lits: Lit[], view: View | null, tag: { w: number; h: number }, lim: Limits, growTop: number): Placement | null {
  const scrolled = lits.filter((l) => l.scrolled);
  if (!view || !scrolled.length) {
    const spot = spotAt(lits, null, 0, lim, growTop);
    if (fitsBelow(spot, tag, lim)) return hangBelow(spot, tag, lim, null, false);
    if (fitsAbove(spot, tag, lim)) return hangAbove(spot, tag, lim, null, false);
    return null;
  }
  // The scrolled part's top and bottom in the scroller's content.
  const part = union(scrolled.map((l) => l.box))!;
  const top = part.y;
  const bottom = part.y + part.h;
  /** Scrolled no further than `hi`, the lit part's top (and its light, where it can) stays on screen, below the
   * overlay's top strip; at least `seen`, its bottom does. */
  const hi = clamp(top - PAD - growTop - under(view, lim), 0, view.max);
  const seen = clamp(bottom + PAD - view.h, 0, view.max);
  const ok = (s: number, room: (spot: Box) => boolean) => {
    const shown = top - s >= -0.5 && bottom - s <= view.h + 0.5;
    const spot = spotAt(lits, view, s, lim, growTop);
    return shown && room(spot) ? spot : null;
  };
  const scrollTo = (s: number) => (Math.abs(s - view.now) > 1 ? s : null);

  // Under the spot: scroll down just enough for the tag to fit below it.
  const lo = Math.max(seen, view.top + bottom + PAD + BELOW + tag.h - lim.bottom, 0);
  if (lo <= hi) {
    const s = Math.round(clamp(view.now, lo, hi));
    const spot = ok(s, (b) => fitsBelow(b, tag, lim));
    if (spot) return hangBelow(spot, tag, lim, scrollTo(s), false);
  }
  // Above it: scroll up just enough for the turned-over tag to fit above the spot.
  const hiAbove = Math.min(hi, view.top + top - PAD - growTop - roomAbove(tag, lim));
  if (seen <= hiAbove) {
    const s = Math.round(clamp(view.now, seen, hiAbove));
    const spot = ok(s, (b) => fitsAbove(b, tag, lim));
    if (spot) return hangAbove(spot, tag, lim, scrollTo(s), false);
  }
  return null;
}

/**
 * Last resort on a short screen: the element at the top, the tag under it as far down as it can go and the spot cut
 * short where the tag's twine begins, so nothing lit hides behind the tag. When even that would push the tag off the
 * foot of the screen (the element sits low, on a sheet that doesn't scroll), the tag goes above it turned over, as high
 * as it can, and the spot's top is cut down to just under its knot instead.
 */
function squeeze(lits: Lit[], view: View | null, tag: { w: number; h: number }, lim: Limits, growTop: number): Placement {
  const scrolled = lits.filter((l) => l.scrolled);
  let s = 0;
  if (view && scrolled.length) {
    const part = union(scrolled.map((l) => l.box))!;
    s = Math.round(clamp(part.y - PAD - growTop - under(view, lim), 0, view.max));
  }
  const full = spotAt(lits, view, s, lim, growTop);
  const scrollTop = view && scrolled.length && Math.abs(s - view.now) > 1 ? s : null;
  const lowest = Math.max(lim.top + 60, lim.bottom - tag.h);
  const below = { ...full, h: Math.max(48, Math.min(full.h, lowest - BELOW - full.y)) };
  const belowTop = Math.max(lowest, below.y + below.h + BELOW);
  const top = roomAbove(tag, lim);
  if (belowTop + tag.h > lim.bottom + 2 && full.y + full.h - top >= 40) {
    const y = Math.max(full.y, top);
    return onScreen(hangAbove({ ...full, y, h: full.y + full.h - y }, tag, lim, scrollTop, true), tag, lim);
  }
  return onScreen(hangBelow(below, tag, lim, scrollTop, true, belowTop), tag, lim);
}

/** The tag kept between the strip and the dock whatever it costs (on a screen too short for it and the spot both, it
 * goes over the spot, hanging on its own knot: no twine down to a tack it would hide). */
function onScreen(p: Placement, tag: { h: number }, lim: Limits): Placement {
  const y = clamp(p.tag.y, lim.top, Math.max(lim.top, lim.bottom - tag.h));
  if (y === p.tag.y) return p;
  return { ...p, tag: { ...p.tag, y }, cord: { x: p.cord.x, y1: y, y2: y }, tacks: [] };
}

/* ---------------------------------------------------------------- measuring, in the DOM */

/** Where `el` sits inside `ancestor` (one of its offset parents), ignoring transforms and the ancestor's scroll. */
export function offsetIn(el: HTMLElement, ancestor: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  // The scroll of anything between them (a carousel scrolled sideways) moves the element too.
  for (let up = el.parentElement; up && up !== ancestor; up = up.parentElement) {
    x -= up.scrollLeft;
    y -= up.scrollTop;
  }
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) break;
    if (parent !== ancestor) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }
  return { x, y };
}

/** Where `el` is in the root, from its place on screen (the hops measure once everything has settled). */
export function boxIn(el: Element, root: Element): Box {
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
}

/**
 * Calls `then` once `scroller` has come to rest: at `to` when a scroll there was just asked for, else (a scroll that may
 * still be under way, a fling) unmoved for a few frames running; never later than `max` ms. A smooth scroll takes as
 * long as the phone likes, so whatever a hop measures after it is measured where it stays. Returns a cancel.
 */
export function whenStill(scroller: Pick<HTMLElement, 'scrollTop'>, then: () => void, to: number | null = null, max = 1500): () => void {
  let start: number | null = null;
  let last = scroller.scrollTop;
  let still = 0;
  let id = 0;
  const tick = (now: number) => {
    start ??= now;
    const y = scroller.scrollTop;
    still = Math.abs(y - last) < 0.5 ? still + 1 : 0;
    last = y;
    // Asked to go somewhere, it's there; or it never set off (nowhere further to go), or stopped short.
    const rest = to === null ? still >= 3 : (Math.abs(y - to) < 1 && still >= 1) || still >= 10;
    if (rest || now - start > max) return then();
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

/** Where a scroll by `by` ends: as far as the scroller goes. */
export const scrollEnd = (scroller: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>, by: number) =>
  Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + by));

/** The scroller (a page, or a sheet) a lit element sits in. */
const scrollerOf = (el: HTMLElement, root: HTMLElement) => {
  const sc = el.parentElement?.closest<HTMLElement>('[data-scroller]') ?? null;
  return sc && root.contains(sc) ? sc : null;
};

function measure(root: HTMLElement, names: readonly string[], scroller: HTMLElement | null): Lit[] {
  const out: Lit[] = [];
  for (const name of names) {
    const el = root.querySelector<HTMLElement>(selectorOf(name));
    if (!el || !el.offsetParent) continue;
    const sc = scrollerOf(el, root);
    const scrolled = !!sc && sc === scroller;
    const at = offsetIn(el, scrolled ? sc : root);
    out.push({ box: { x: at.x, y: at.y, w: el.offsetWidth, h: el.offsetHeight }, scrolled });
  }
  return out;
}

function viewOf(el: HTMLElement, root: HTMLElement): View {
  const at = offsetIn(el, root);
  return { x: at.x + el.clientLeft, top: at.y + el.clientTop, h: el.clientHeight, now: el.scrollTop, max: Math.max(0, el.scrollHeight - el.clientHeight) };
}

/** The stop's shape, as `place` needs it. */
export interface StopShape {
  lit: string[];
  core?: string[];
  growTop?: number;
}

/** Lays one stop out in `root`; the scroll it asks for comes with its scroller. */
export function place(root: HTMLElement, stop: StopShape, tag: { w: number; h: number }, lim: Limits): (Placement & { scroller: HTMLElement | null }) | null {
  // The scroller is the first lit element's (they share one: a page, or a sheet).
  const first = [...stop.lit, ...(stop.core ?? [])].map((name) => root.querySelector<HTMLElement>(selectorOf(name))).find((el) => el?.offsetParent);
  const scroller = first ? scrollerOf(first, root) : null;
  const view = scroller ? viewOf(scroller, root) : null;
  const p = planPlacement({ lit: measure(root, stop.lit, scroller), core: stop.core ? measure(root, stop.core, scroller) : null }, view, tag, lim, stop.growTop ?? 0);
  return p ? { ...p, scroller } : null;
}
