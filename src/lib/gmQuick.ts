// The GM's one-tap −/+ points buttons: 10 points, or the pack's own step (`gmQuickPoints`).

export const QUICK_POINTS = 10;

export function quickAdjustment(sign: 1 | -1, reason: string, step = QUICK_POINTS): { delta: number; reason: string } {
  return { delta: sign * step, reason: reason.trim() || (sign === -1 ? 'Penalty' : 'Bonus') };
}
