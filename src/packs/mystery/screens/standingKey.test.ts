import { describe, expect, it } from 'vitest';
import { standingKeyLines } from './standingKey';

describe('standingKeyLines', () => {
  it('has no lines when both standings are off', () => {
    expect(standingKeyLines({ confidantAbove: null, poiBelow: null }, true)).toEqual([]);
  });

  it('reads both live lines, signed with a real minus, confidant first', () => {
    expect(standingKeyLines({ confidantAbove: 15, poiBelow: -5 }, true)).toEqual([
      { standing: 'confidant', rule: 'above +15', brings: 'can tip off the police' },
      { standing: 'poi', rule: 'below −5', brings: 'police check-ins' },
    ]);
  });

  it('shows only the line that is set', () => {
    expect(standingKeyLines({ confidantAbove: 10, poiBelow: null }, true).map((l) => l.standing)).toEqual(['confidant']);
    expect(standingKeyLines({ confidantAbove: null, poiBelow: -10 }, true).map((l) => l.standing)).toEqual(['poi']);
  });

  it('says 0 for a line on zero', () => {
    expect(standingKeyLines({ confidantAbove: 0, poiBelow: 0 }, false).map((l) => l.rule)).toEqual(['above 0', 'below 0']);
  });

  it('leaves out what a standing brings without police check-ins', () => {
    expect(standingKeyLines({ confidantAbove: 10, poiBelow: -10 }, false).map((l) => l.brings)).toEqual([null, null]);
  });
});
