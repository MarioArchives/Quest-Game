import { describe, expect, it } from 'vitest';
import { bandFor, tapeTimeLeft } from './standingBand';

const lines = { confidantAbove: 10, poiBelow: -10 };

describe('bandFor', () => {
  it('clears a trusted confidant above the line', () => {
    expect(bandFor(15, false, lines)).toEqual({ standing: 'confidant', word: 'Cleared (for\u00a0now)', rule: 'score above +10' });
  });
  it('puts a person of interest on the watch list below the line', () => {
    expect(bandFor(-15, false, lines)).toEqual({ standing: 'poi', word: 'Watch list', rule: 'score below −10' });
  });
  it('draws no band between the lines, on them, or for missing points', () => {
    for (const points of [10, -10, 0, 2, null, undefined]) expect(bandFor(points, false, lines)).toBeNull();
  });
  it('follows the GM moving the lines', () => {
    expect(bandFor(5, false, { confidantAbove: 0, poiBelow: -10 })?.rule).toBe('score above 0');
    expect(bandFor(5, false, { confidantAbove: 20, poiBelow: 8 })?.standing).toBe('poi');
    expect(bandFor(-50, false, { confidantAbove: 10, poiBelow: null })).toBeNull();
    expect(bandFor(50, false, { confidantAbove: null, poiBelow: null })).toBeNull();
  });
  it('draws none for a player who has left', () => {
    expect(bandFor(15, true, lines)).toBeNull();
    expect(bandFor(-15, true, lines)).toBeNull();
  });
});

describe('tapeTimeLeft', () => {
  const now = 1_000_000;
  it('rounds whole minutes up', () => {
    expect(tapeTimeLeft(now + 5 * 60_000, now)).toBe('5 min left');
    expect(tapeTimeLeft(now + 2 * 60_000 + 1, now)).toBe('3 min left');
    expect(tapeTimeLeft(now + 60_000, now)).toBe('1 min left');
  });
  it('says under a minute for the last minute', () => expect(tapeTimeLeft(now + 59_999, now)).toBe('under a minute left'));
  it('is null once the time is up', () => {
    expect(tapeTimeLeft(now, now)).toBeNull();
    expect(tapeTimeLeft(now - 1, now)).toBeNull();
    expect(tapeTimeLeft(0, now)).toBeNull();
  });
});
