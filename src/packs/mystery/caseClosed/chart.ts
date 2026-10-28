// The numbers behind the desk's points page: everyone's points through the night as steps (the red-pen chart), the
// table at any minute (the race under it), and your biggest swings, ringed in red. Pure.
import type { CaseLine } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';

export interface Step {
  t: number;
  points: number;
}

/** A player's points after each of their lines, starting from 0 at `from`. */
export function seriesOf(timeline: readonly CaseLine[], uid: string, from: number): Step[] {
  const out: Step[] = [{ t: from, points: 0 }];
  let points = 0;
  for (const l of timeline) {
    if (l.uid !== uid) continue;
    points += l.delta;
    out.push({ t: Math.max(from, l.t), points });
  }
  return out;
}

/** A player's points at minute `t`. */
export function pointsAt(timeline: readonly CaseLine[], uid: string, t: number): number {
  let points = 0;
  for (const l of timeline) if (l.uid === uid && l.t <= t) points += l.delta;
  return points;
}

/** The chart's span: whole tens that hold every value with room to spare, and always both standing lines and zero. */
export function chartDomain(values: readonly number[], lines: { confidantAbove: number | null; poiBelow: number | null }): [number, number] {
  const marks = [0, ...values, ...(lines.confidantAbove !== null ? [lines.confidantAbove + 10] : []), ...(lines.poiBelow !== null ? [lines.poiBelow - 10] : [])];
  const lo = Math.floor((Math.min(...marks) - 2) / 10) * 10;
  const hi = Math.ceil((Math.max(...marks) + 2) / 10) * 10;
  return [lo, hi];
}

/** An SVG step path: flat until each change, then straight up or down, flat on to `to`. */
export function stepPath(series: readonly Step[], x: (t: number) => number, y: (v: number) => number, to: number): string {
  let d = `M${x(series[0].t).toFixed(1)} ${y(series[0].points).toFixed(1)}`;
  for (const s of series.slice(1)) d += `H${x(s.t).toFixed(1)}V${y(s.points).toFixed(1)}`;
  return `${d}H${x(to).toFixed(1)}`;
}

export interface Swing {
  /** When it ended, and where the line stood then. */
  t: number;
  points: number;
  /** How much it moved. */
  delta: number;
}

/**
 * Your biggest moves: lines the same way within `withinMin` of the first in a run count as one swing; the `n` largest
 * by size (the earlier on a tie), in time order.
 */
export function swings(timeline: readonly CaseLine[], uid: string, n = 3, withinMin = 10): Swing[] {
  const runs: Swing[] = [];
  let start = -Infinity;
  let points = 0;
  for (const l of timeline) {
    if (l.uid !== uid) continue;
    points += l.delta;
    const last = runs[runs.length - 1];
    if (last && l.t - start <= withinMin * 60_000 && Math.sign(l.delta) === Math.sign(last.delta)) {
      last.delta += l.delta;
      last.t = l.t;
      last.points = points;
    } else {
      start = l.t;
      runs.push({ t: l.t, points, delta: l.delta });
    }
  }
  return runs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Math.abs(b.s.delta) - Math.abs(a.s.delta) || a.i - b.i)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map(({ s }) => s);
}

/** Names at the ends of the lines, top to bottom, pushed apart so no two are closer than `gap`. */
export function spreadLabels<T extends { y: number }>(labels: readonly T[], gap: number): T[] {
  const out = [...labels].sort((a, b) => a.y - b.y).map((l) => ({ ...l }));
  for (let i = 1; i < out.length; i++) if (out[i].y - out[i - 1].y < gap) out[i].y = out[i - 1].y + gap;
  return out;
}

export interface RaceRow {
  uid: string;
  points: number;
}

/** The table at minute `t`: most points first, then by name, as the standings break ties. */
export function tableAt(timeline: readonly CaseLine[], players: ReadonlyArray<{ uid: string; name: string }>, t: number): RaceRow[] {
  const name = new Map(players.map((p) => [p.uid, p.name]));
  return players
    .map((p) => ({ uid: p.uid, points: pointsAt(timeline, p.uid, t) }))
    .sort((a, b) => b.points - a.points || (name.get(a.uid) ?? '').localeCompare(name.get(b.uid) ?? ''));
}

/** The last line at or before minute `t`, for the race's "what just happened". */
export function lastLine(timeline: readonly CaseLine[], t: number): CaseLine | null {
  let last: CaseLine | null = null;
  for (const l of timeline) if (l.t <= t) last = l;
  return last;
}

/** Signed points as the papers print them: +5, −5, ±0. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0';
}
