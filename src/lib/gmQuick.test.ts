// The GM's one-tap −10 / +10 buttons (plan edge case 16).
import { describe, expect, it } from 'vitest';
import { QUICK_POINTS, quickAdjustment } from './gmQuick';

describe('quickAdjustment', () => {
  it('is exactly ten points either way', () => {
    expect(QUICK_POINTS).toBe(10);
    expect(quickAdjustment(-1, '').delta).toBe(-10);
    expect(quickAdjustment(1, '').delta).toBe(10);
  });

  it.each([
    ['an empty', ''],
    ['a blank', '   '],
  ])('defaults %s reason to "Penalty" for -10 and "Bonus" for +10', (_label, reason) => {
    expect(quickAdjustment(-1, reason)).toEqual({ delta: -10, reason: 'Penalty' });
    expect(quickAdjustment(1, reason)).toEqual({ delta: 10, reason: 'Bonus' });
  });

  it('uses the typed reason, trimmed', () => {
    expect(quickAdjustment(-1, '  Late back from the bar  ')).toEqual({ delta: -10, reason: 'Late back from the bar' });
    expect(quickAdjustment(1, 'Bought the GM a pint')).toEqual({ delta: 10, reason: 'Bought the GM a pint' });
  });
});
