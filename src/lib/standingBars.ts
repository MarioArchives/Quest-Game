// Standings as bars from zero on a squared grid: positive scores on one side, negative ones on the other,
// 0 on the zero line. The grid starts at ±25 in squares of 5 points and widens when someone goes past it.
import type { Doc, Player } from '../shared';

export interface StandingBar {
  uid: string;
  name: string;
  photoURL: string | null;
  points: number;
  /** 'plus' above 0, 'minus' below 0, 'zero' on the line. */
  side: 'plus' | 'minus' | 'zero';
  /** "+420", "−25" (a real minus sign) or "0". */
  label: string;
  me: boolean;
}

/** "+420", "−25" (a real minus sign) or "0". */
export function signed(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
}

/** One bar per player still on the leaderboard (not kicked out), highest score first, ties by name. */
export function standingBars(players: ReadonlyArray<Doc<Player>>, meUid: string | null): StandingBar[] {
  return players
    .filter((p) => p.left !== 'out')
    .map((p) => ({ p, points: p.points ?? 0 }))
    .sort((a, b) => b.points - a.points || a.p.displayName.localeCompare(b.p.displayName))
    .map(({ p, points }) => ({
      uid: p.id,
      name: p.displayName,
      photoURL: p.photoURL ?? null,
      points,
      side: points > 0 ? 'plus' : points < 0 ? 'minus' : 'zero',
      label: signed(points),
      me: p.id === meUid,
    }));
}

export interface StandingScale {
  /** Points at the outermost line on each side. */
  max: number;
  /** Points per square. */
  step: number;
  /** Squares on each side of zero (max / step). */
  squares: number;
}

export interface ScaleBase {
  max: number;
  step: number;
  /** The most squares a side may have before the squares get bigger. */
  maxSquares: number;
}

const BASE: ScaleBase = { max: 25, step: 5, maxSquares: 10 };

/** 5, 10, 20, 25, 50, 100, 200, 250, 500, … from `from` up: whole points only. */
function* niceSteps(from: number): Generator<number> {
  for (let mag = 10 ** Math.floor(Math.log10(from)); ; mag *= 10) {
    for (const m of [1, 2, 2.5, 5]) if (m * mag >= from && Number.isInteger(m * mag)) yield m * mag;
  }
}

/**
 * The grid for these scores: ±`base.max` in squares of `base.step` while everyone fits. When someone goes past it,
 * the same squares stretch out to cover them (up to `maxSquares` a side), then the squares get bigger
 * (10, 20, 25, 50… points), always ending on a whole square.
 */
export function standingScale(points: readonly number[], base: ScaleBase = BASE): StandingScale {
  const largest = Math.max(0, ...points.map((p) => Math.abs(p)));
  if (largest <= base.max) return { max: base.max, step: base.step, squares: Math.round(base.max / base.step) };
  for (const step of niceSteps(base.step)) {
    const squares = Math.ceil(largest / step);
    if (squares <= base.maxSquares) return { max: squares * step, step, squares };
  }
  throw new Error('unreachable');
}

export interface ScaleTick {
  /** Points at this line. */
  value: number;
  /** Shown above the grid; null when there are too many squares to label them all (every other one is). */
  label: string | null;
}

/** One line per square edge from +max to −max (0 included), labelled every square, or every other past 6 a side. */
export function scaleTicks(scale: StandingScale): ScaleTick[] {
  const every = scale.squares <= 6 ? 1 : 2;
  const ticks: ScaleTick[] = [];
  for (let i = scale.squares; i >= -scale.squares; i -= 1) {
    const value = i * scale.step;
    ticks.push({ value, label: i % every === 0 ? signed(value) : null });
  }
  return ticks;
}

export interface RowSize {
  /** A player's row, in px. */
  row: number;
  /** The face and the bar's thickness, in px. */
  face: number;
}

/** The smallest row (and its face); rows grow from it to `ROW_GROW` times as big. */
const ROW_MIN: RowSize = { row: 58, face: 40 };
const ROW_GROW = 1.5;

/**
 * Rows sharing `space` px between `rows` players, so a few players fill the sheet: never smaller than `min` (the
 * sheet scrolls instead) and never more than `grow` times as big. The face keeps its share of the row.
 */
export function standingRowSize(space: number, rows: number, min: RowSize = ROW_MIN, grow = ROW_GROW): RowSize {
  if (!(space > 0) || rows <= 0) return min;
  const row = Math.min(Math.round(min.row * grow), Math.max(min.row, Math.floor(space / rows)));
  return { row, face: Math.round((row * min.face) / min.row) };
}
