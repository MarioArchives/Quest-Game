// The crawl page's numbers: the stops projected onto the paper map, the red yarn strung between their pins, and your
// points at each bar. Pure.
import type { CaseLine } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';

export interface Place {
  lat: number;
  lng: number;
}

export interface Projection {
  /** Metres to pixels. */
  k: number;
  at: (p: Place) => [number, number];
}

const M_PER_DEG = 111_320;

/**
 * Fits the stops into a w×h box with `pad` to spare on every side, north up, metres the same both ways; a single stop
 * (or none) sits in the middle at a street scale.
 */
export function project(stops: readonly Place[], w: number, h: number, pad: number): Projection {
  const lat0 = stops.length ? stops.reduce((a, s) => a + s.lat, 0) / stops.length : 0;
  const mLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const xs = stops.map((s) => s.lng * mLng);
  const ys = stops.map((s) => -s.lat * M_PER_DEG);
  const spanX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const spanY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const k = Math.min((w - 2 * pad) / Math.max(spanX, 1), (h - 2 * pad) / Math.max(spanY, 1), 0.6);
  const cx = xs.length ? (Math.max(...xs) + Math.min(...xs)) / 2 : 0;
  const cy = ys.length ? (Math.max(...ys) + Math.min(...ys)) / 2 : 0;
  return { k, at: (p) => [w / 2 + (p.lng * mLng - cx) * k, h / 2 + (-p.lat * M_PER_DEG - cy) * k] };
}

/** The yarn: pin to pin, sagging a little between each pair. */
export function yarnPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (!points.length) return '';
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const sag = Math.min(16, Math.hypot(bx - ax, by - ay) * 0.12);
    d += ` Q${((ax + bx) / 2 + sag * 0.5).toFixed(1)} ${((ay + by) / 2 + sag).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  return d;
}

/** A scale bar: the round distance (100 m, 200 m, 500 m, 1 km…) closest under `maxPx` long. */
export function scaleBar(k: number, maxPx: number): { metres: number; px: number; label: string } {
  const steps = [50, 100, 200, 500, 1000, 2000, 5000];
  const metres = [...steps].reverse().find((m) => m * k <= maxPx) ?? steps[0];
  return { metres, px: metres * k, label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m` };
}

export interface TimedStop {
  startMs: number | null;
  /** When the group left: its own leave time, else the next stop's start; null for open-ended. */
  leaveMs: number | null;
}

/**
 * Your points at each stop: every line from when the group got there until it left (the last one until the end).
 * Null for a stop with no arrival time, which can't be told apart.
 */
export function pointsByStop(timeline: readonly CaseLine[], uid: string, stops: readonly TimedStop[]): Array<number | null> {
  return stops.map((s) => {
    if (s.startMs === null) return null;
    const until = s.leaveMs ?? Infinity;
    return timeline.filter((l) => l.uid === uid && l.t >= s.startMs! && l.t < until).reduce((a, l) => a + l.delta, 0);
  });
}

/** Which stop the group was at, at `t`: the last one it had got to and not yet left; null before the first or between. */
export function stopAt<T extends TimedStop>(stops: readonly T[], t: number): T | null {
  let at: T | null = null;
  for (const s of stops) if (s.startMs !== null && s.startMs <= t && (s.leaveMs === null || t < s.leaveMs)) at = s;
  return at;
}
