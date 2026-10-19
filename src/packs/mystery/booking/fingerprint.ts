// A made-up fingerprint (from the UI mocks' booking desk), the same every time for the same seed (the player's uid): a
// loop (nested hairpins that open to one side) or a whorl (rings round a core), with a few ridge endings, bent by one
// smooth warp so the ridges never cross. Drawn in a 200 × 240 box and clipped to FINGER. Cosmetic: nothing is read.

export const PRINT_W = 200;
export const PRINT_H = 240;

/** The fingertip: round at the top, the crease along the bottom. */
export const FINGER = 'M100 12C152 12 180 58 180 118C180 170 168 208 152 230L48 230C32 208 20 170 20 118C20 58 48 12 100 12Z';

export interface Print {
  /** One `d` per ridge piece. */
  ridges: string[];
  pattern: 'loop' | 'whorl';
  /** For the scanner's readout. */
  ridgeCount: number;
  minutiae: number;
  quality: number;
}

/** FNV-1a: some text to a seed. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (const ch of text.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded random in [0, 1). */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

const SPACING = 6.4;
const REACH = 150;

/** Points to a smooth path: through the midpoints, each point a control point. */
function smooth(points: Pt[]): string {
  if (points.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    d += `Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const last = points[points.length - 1]!;
  return `${d}L${f(last[0])} ${f(last[1])}`;
}

/** Cut a ridge into pieces at a few random places (ridge endings), dropping a short gap at each. */
function breakUp(points: Pt[], rng: () => number, counter: { n: number }): Pt[][] {
  const pieces: Pt[][] = [];
  const cuts = points.length > 40 ? (rng() < 0.7 ? 1 : 0) + (rng() < 0.35 ? 1 : 0) : rng() < 0.3 ? 1 : 0;
  const at = Array.from({ length: cuts }, () => Math.floor(6 + rng() * (points.length - 12))).sort((a, b) => a - b);
  let from = 0;
  for (const cut of at) {
    if (cut - from < 4) continue;
    pieces.push(points.slice(from, cut));
    from = cut + 2 + Math.floor(rng() * 2);
    counter.n += 2;
  }
  pieces.push(points.slice(from));
  return pieces.filter((p) => p.length > 2);
}

export function makePrint(seed: string): Print {
  const rng = seeded(hashText(seed || 'suspect'));
  const pattern: Print['pattern'] = rng() < 0.65 ? 'loop' : 'whorl';
  const cx = 100 + (rng() - 0.5) * 18;
  const cy = 112 + (rng() - 0.5) * 22;
  // A loop opens down and to one side.
  const left = rng() < 0.5;
  const open = ((left ? 118 : 62) + (rng() - 0.5) * 30) * (Math.PI / 180);
  const squash = 0.88 + rng() * 0.1;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const wx = rng() * Math.PI * 2;
  const wy = rng() * Math.PI * 2;

  // One smooth warp for every point, small enough that neighbouring ridges stay apart.
  const warp = ([x, y]: Pt): Pt => [x + 5 * Math.sin(y / 38 + wx), y + 4 * Math.sin(x / 46 + wy)];
  // Rings a little oval and lumpy, the lumps shared so the rings stay parallel.
  const ring = (r: number, a: number): Pt => {
    const k = 1 + 0.05 * Math.sin(2 * a + p1) + 0.035 * Math.sin(3 * a + p2);
    return [cx + Math.cos(a) * r * k * squash, cy + Math.sin(a) * r * k * 1.12];
  };

  const ridges: string[] = [];
  const counter = { n: 0 };
  let count = 0;
  for (let r = pattern === 'loop' ? 3.5 : 4; r < REACH; r += SPACING) {
    count += 1;
    const steps = Math.max(18, Math.round(r * 0.9));
    const points: Pt[] = [];
    if (pattern === 'whorl') {
      const start = rng() * Math.PI * 2;
      for (let i = 0; i <= steps; i += 1) points.push(warp(ring(r, start + (i / steps) * Math.PI * 2)));
    } else {
      // A hairpin: half a ring round the closed end, then both arms run straight out the open side.
      const dir: Pt = [Math.cos(open), Math.sin(open)];
      const armA = ring(r, open + Math.PI / 2);
      const armB = ring(r, open - Math.PI / 2);
      const tail = 170;
      for (let i = 12; i >= 1; i -= 1) points.push(warp([armA[0] + dir[0] * (tail * i) / 12, armA[1] + dir[1] * (tail * i) / 12]));
      for (let i = 0; i <= steps; i += 1) points.push(warp(ring(r, open + Math.PI / 2 + (i / steps) * Math.PI)));
      for (let i = 1; i <= 12; i += 1) points.push(warp([armB[0] + dir[0] * (tail * i) / 12, armB[1] + dir[1] * (tail * i) / 12]));
    }
    for (const piece of breakUp(points, rng, counter)) ridges.push(smooth(piece));
  }
  return { ridges, pattern, ridgeCount: count, minutiae: counter.n + 6 + Math.floor(rng() * 8), quality: 91 + Math.floor(rng() * 8) };
}
