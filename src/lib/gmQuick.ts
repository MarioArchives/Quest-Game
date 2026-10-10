// The GM's one-tap −10 / +10 points buttons.

export const QUICK_POINTS = 10;

export function quickAdjustment(sign: 1 | -1, reason: string): { delta: number; reason: string } {
  return { delta: sign * QUICK_POINTS, reason: reason.trim() || (sign === -1 ? 'Penalty' : 'Bonus') };
}
