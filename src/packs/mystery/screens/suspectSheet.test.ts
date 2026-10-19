import { describe, expect, it } from 'vitest';
import type { Doc, Player } from '../../../shared';
import { frameAfter, linesNote, nearLines, sheetEdge, stampFor, suspectSheet, type SheetSettings } from './suspectSheet';

const settings: SheetSettings = { confidantAbove: 10, poiBelow: -10, framePoints: 5, pointsFloorZero: false };

const player = (id: string, displayName: string, points: number, extra: Partial<Player> = {}) =>
  ({ id, displayName, points, photoURL: null, ...extra }) as unknown as Doc<Player>;

// The table in the mockup: you on +5, third.
const table = [
  player('ruth', 'Ruth', -3),
  player('maya', 'Maya', 15),
  player('jonah', 'Jonah', -15),
  player('me', 'Me', 5),
  player('theo', 'Theo', 8),
  player('priya', 'Priya', -9),
  player('sam', 'Sam', 2),
];

describe('frameAfter', () => {
  it('takes the frame off', () => {
    expect(frameAfter(-3, settings)).toBe(-8);
    expect(frameAfter(2, { ...settings, framePoints: 50 })).toBe(-48);
  });
  it('stops at zero with the zero floor on, and leaves a negative score where it is', () => {
    const floor = { ...settings, pointsFloorZero: true };
    expect(frameAfter(3, floor)).toBe(0);
    expect(frameAfter(12, floor)).toBe(7);
    expect(frameAfter(-4, floor)).toBe(-4);
  });
});

describe('stampFor', () => {
  it('stamps the lines a frame crosses', () => {
    expect(stampFor(15, 10, 5, settings)).toBe('loses-confidant');
    expect(stampFor(-9, -14, 5, settings)).toBe('onto-watch-list');
  });
  it('stamps passing you, dropping under zero, and a person of interest already watched', () => {
    expect(stampFor(8, 3, 5, settings)).toBe('drops-below-you');
    expect(stampFor(2, -3, 5, settings)).toBe('under-suspicion');
    expect(stampFor(0, -5, 5, settings)).toBe('under-suspicion');
    expect(stampFor(-15, -20, 5, settings)).toBe('already-watched');
  });
  it('stamps nothing when nothing changes', () => {
    expect(stampFor(-3, -8, 5, settings)).toBeNull();
    expect(stampFor(10, 5, 5, settings)).toBeNull(); // on the line is not above it
    expect(stampFor(-6, -11, 5, settings)).toBe('onto-watch-list');
    expect(stampFor(-5, -10, 5, settings)).toBeNull(); // on the line is not below it
  });
  it('puts a line first, and passing you before zero', () => {
    expect(stampFor(12, 7, 9, settings)).toBe('loses-confidant');
    expect(stampFor(3, -2, 0, settings)).toBe('drops-below-you');
    expect(stampFor(6, 1, 6, settings)).toBeNull(); // level with you is not past you
  });
  it('follows the GM moving or switching off the lines', () => {
    expect(stampFor(15, 10, 5, { confidantAbove: 12, poiBelow: -10 })).toBe('loses-confidant');
    expect(stampFor(15, 10, null, { confidantAbove: null, poiBelow: null })).toBeNull();
    expect(stampFor(-15, -20, null, { confidantAbove: null, poiBelow: null })).toBeNull();
  });
});

describe('suspectSheet', () => {
  it('lists everyone by score with you in place, each suspect now and after', () => {
    const rows = suspectSheet(table, 'me', settings);
    expect(rows.map((r) => [r.name, r.points, r.after, r.stamp])).toEqual([
      ['Maya', 15, 10, 'loses-confidant'],
      ['Theo', 8, 3, 'drops-below-you'],
      ['Me', 5, null, null],
      ['Sam', 2, -3, 'under-suspicion'],
      ['Ruth', -3, -8, null],
      ['Priya', -9, -14, 'onto-watch-list'],
      ['Jonah', -15, -20, 'already-watched'],
    ]);
    expect(rows[2]!.me).toBe(true);
    expect(rows.map((r) => r.standing)).toEqual(['confidant', null, null, null, null, null, 'poi']);
  });
  it('leaves out players who left, and breaks ties by name', () => {
    const rows = suspectSheet([player('b', 'Bea', 5), player('a', 'Al', 5), player('x', 'Xan', 9, { left: 'frozen' } as Partial<Player>), player('me', 'Me', 0)], 'me', settings);
    expect(rows.map((r) => r.name)).toEqual(['Al', 'Bea', 'Me']);
  });
  it('shows a frame already sent at the new score', () => {
    const rows = suspectSheet(table, 'me', settings, { uid: 'ruth', after: -8 });
    const ruth = rows.find((r) => r.uid === 'ruth')!;
    expect([ruth.points, ruth.after]).toEqual([-8, -13]);
    expect(rows.map((r) => r.name).indexOf('Ruth')).toBe(4);
  });
  it('works without you on the sheet', () => {
    const rows = suspectSheet([player('a', 'Al', 8), player('b', 'Bea', 2)], 'gm', settings);
    expect(rows.map((r) => r.stamp)).toEqual([null, 'under-suspicion']);
  });
});

describe('sheetEdge', () => {
  it('is the Board scale: ±25 until someone goes past it', () => {
    expect(sheetEdge(suspectSheet(table, 'me', settings), settings)).toBe(25);
    expect(sheetEdge(suspectSheet([player('a', 'Al', 24), player('me', 'Me', 0)], 'me', settings), settings)).toBe(25);
    expect(sheetEdge(suspectSheet([player('a', 'Al', -23), player('me', 'Me', 0)], 'me', settings), settings)).toBe(30);
  });
  it('keeps the lines on the track', () => {
    expect(sheetEdge(suspectSheet([player('a', 'Al', 1), player('me', 'Me', 0)], 'me', settings), { confidantAbove: 40, poiBelow: null })).toBe(40);
  });
});

describe('nearLines', () => {
  it('lists who a frame would take across a line, and how far they are from it', () => {
    expect(nearLines(suspectSheet(table, 'me', settings), settings)).toEqual([
      { uid: 'maya', name: 'Maya', points: 15, line: 'confidant', gap: 5 },
      { uid: 'priya', name: 'Priya', points: -9, line: 'poi', gap: 1 },
    ]);
  });
  it('is empty with the lines off', () => {
    const off = { ...settings, confidantAbove: null, poiBelow: null };
    expect(nearLines(suspectSheet(table, 'me', off), off)).toEqual([]);
  });
});

describe('linesNote', () => {
  it('names the lines that are on', () => {
    expect(linesNote(settings)).toBe('lines at +10 and −10');
    expect(linesNote({ confidantAbove: 20, poiBelow: null })).toBe('line at +20');
    expect(linesNote({ confidantAbove: null, poiBelow: -5 })).toBe('line at −5');
    expect(linesNote({ confidantAbove: null, poiBelow: null })).toBeNull();
  });
});
