// The spring that carries a page turn home once the finger lets go: position and velocity, stepped frame by frame.

export interface Spring {
  x: number;
  v: number;
}

/** How hard the spring pulls towards its target (per turn, per second squared). */
const STIFFNESS = 170;
/** How hard it drags against its own speed. */
const DAMPING = 26;
/** The fixed sub-step the frame is integrated in, in seconds. */
const STEP_S = 1 / 240;
/** The longest frame counted, in seconds, so a stall never makes it jump. */
const MAX_DT_S = 0.05;

/** One frame of `dt` seconds towards `target`. */
export function springStep(s: Spring, target: number, dt: number): Spring {
  let { x, v } = s;
  let left = Math.min(Math.max(dt, 0), MAX_DT_S);
  while (left > 1e-12) {
    const h = Math.min(STEP_S, left);
    v += (-STIFFNESS * (x - target) - DAMPING * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

/** Close enough to `target`, and slow enough, to stop. */
export function springSettled(s: Spring, target: number): boolean {
  return Math.abs(s.x - target) < 0.0005 && Math.abs(s.v) < 0.005;
}
