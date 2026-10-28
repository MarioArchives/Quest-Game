// The tour's geometry, pure: boxes, the red pen's curved arrows (as on the game's map, its "next?" arrow), where a hop's
// arrow sets off from, and when the SPECIMEN NIGHT badge steps out of the torch's way. Marks.tsx draws the arrows.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** An arrow shorter than this would be a stub: it isn't drawn (the torch still moves). */
export const MIN_ARROW = 28;

const n = (v: number) => Math.round(v * 10) / 10;
export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export function union(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The part of `b` between `top` and `bottom`; scrolled right off, a sliver at the edge it went off. */
export function within(b: Box, top: number, bottom: number): Box {
  const y0 = Math.min(Math.max(b.y, top), bottom - 6);
  const y1 = Math.max(Math.min(b.y + b.h, bottom), y0 + 6);
  return { ...b, y: y0, h: y1 - y0 };
}

export const contains = (b: Box, p: Pt) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** How much two boxes overlap, in px each way (0 when they don't). */
export function overlap(a: Box, b: Box): { w: number; h: number } {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? { w, h } : { w: 0, h: 0 };
}

/** Light round a box, inside the phone's sides. */
export function padded(b: Box, width: number, pad = 6): Box {
  const x0 = Math.max(4, b.x - pad);
  const x1 = Math.min(width - 4, b.x + b.w + pad);
  return { x: x0, y: b.y - pad, w: x1 - x0, h: b.h + pad * 2 };
}

/** Where `b`'s edge meets the line from its centre towards `p`, pushed out by `gap`. */
function edge(b: Box, p: Pt, gap: number): Pt {
  const c = center(b);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (!dx && !dy) return c;
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy);
  return { x: c.x + dx * s + (dx / len) * gap, y: c.y + dy * s + (dy / len) * gap };
}

/** Whether the curve p0–c–p1 stays on the screen, sampled along its length. */
function onScreen(p0: Pt, c: Pt, p1: Pt, screen: { w: number; h: number }): boolean {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
    const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
    if (x < 3 || x > screen.w - 3 || y < 3 || y > screen.h - 3) return false;
  }
  return true;
}

export interface ArrowPaths {
  shaft: string;
  head: string;
  /** The shaft's ends and the bow's control point, as drawn. */
  p0: Pt;
  c: Pt;
  p1: Pt;
}

/**
 * A curved arrow from box `a` to box `b`: the shaft and the head, bowed towards the middle of the screen, or away from
 * `away` (the tag, for an arrow setting off from its side), or the other way if that keeps it on the screen; null
 * when neither does, or when it would be a stub.
 */
export function arrowPaths(a: Box, b: Box, screen: { w: number; h: number }, away?: Pt): ArrowPaths | null {
  const p0 = edge(a, center(b), 6);
  const p1 = edge(b, center(a), 9);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < MIN_ARROW) return null;
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  // The bow: perpendicular to the line, first on whichever side faces the middle of the screen.
  let nx = -dy / len;
  let ny = dx / len;
  const toward = away ? { x: 2 * mid.x - away.x, y: 2 * mid.y - away.y } : { x: screen.w / 2, y: screen.h / 2 };
  if ((toward.x - mid.x) * nx + (toward.y - mid.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(56, len * 0.28);
  const tries: Pt[] = [
    { x: mid.x + nx * bow, y: mid.y + ny * bow },
    { x: mid.x - nx * bow, y: mid.y - ny * bow },
  ];
  const c = tries.find((t) => onScreen(p0, t, p1, screen));
  if (!c) return null;
  // The head: two strokes back from the tip along the curve's last direction.
  const tx = p1.x - c.x;
  const ty = p1.y - c.y;
  const tl = Math.hypot(tx, ty) || 1;
  const back = (turn: number) => {
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const ux = (-tx / tl) * cos - (-ty / tl) * sin;
    const uy = (-tx / tl) * sin + (-ty / tl) * cos;
    return `${n(p1.x + ux * 13)} ${n(p1.y + uy * 13)}`;
  };
  return {
    shaft: `M${n(p0.x)} ${n(p0.y)} Q${n(c.x)} ${n(c.y)} ${n(p1.x)} ${n(p1.y)}`,
    head: `M${back(0.5)} L${n(p1.x)} ${n(p1.y)} L${back(-0.5)}`,
    p0,
    c,
    p1,
  };
}

/**
 * Where an arrow from the tag sets off: from its side facing the target, a third of the way down, so the arrow has
 * room to sweep out and round even when the target sits right by the tag.
 */
export function tagSide(tag: Box, to: Box): Box {
  const left = to.x + to.w / 2 < tag.x + tag.w / 2;
  return { x: left ? tag.x - 2 : tag.x + tag.w - 2, y: tag.y + tag.h * 0.35, w: 4, h: 4 };
}

/** A hop as drawn: the box the arrow leaves, the one it reaches, and whether the torch stays where it is. */
export interface HopArrow {
  from: Box;
  to: Box;
  /** The thing to tap is inside what's lit: the torch and the tag stay, and the arrow comes from the tag's side. */
  inner: boolean;
  /** The tag's middle, for an arrow from its side to bow away from. */
  away?: Pt;
}

/**
 * Where a hop's arrow sets off: from what was lit when the target is outside it, else from the torch's spot, else
 * (the target inside both, so the arrow would point back into itself) from the tag's side. On a screen other than the
 * stop's (`elsewhere`), nothing the stop lit is there, so the target is never "inside".
 */
export function hopArrow({ to, lit, spot, tag, elsewhere }: { to: Box; lit: Box | null; spot: Box | null; tag: Box | null; elsewhere: boolean }): HopArrow {
  const mid = center(to);
  const inner = !elsewhere && !!spot && contains(spot, mid);
  const outside = (b: Box | null) => (b && !contains(b, mid) ? b : null);
  const plain = inner ? null : (outside(lit) ?? outside(spot));
  if (plain) return { from: plain, to, inner };
  if (tag) return { from: tagSide(tag, to), to, inner, away: center(tag) };
  return { from: to, to, inner };
}

/**
 * Whether the SPECIMEN NIGHT badge steps down under the case number: when the torch is on it where it hangs, at the
 * top in the middle, and not on the place it would step down to.
 */
export function badgeLow(spot: Box, width: number): boolean {
  const hits = (x: number, y: number, w: number, h: number) => spot.x < x + w && spot.x + spot.w > x && spot.y < y + h && spot.y + spot.h > y;
  return hits(width / 2 - 80, 0, 160, 40) && !hits(4, 46, 156, 38);
}
