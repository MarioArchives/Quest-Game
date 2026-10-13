import { describe, expect, it } from 'vitest';
import { distanceMeters } from './geo';
import { bearingDeg, footprintsAlong, metresPerPixel } from './footprints';

const A = { lat: 53.41, lng: -2.23 };
const north = { lat: 53.412, lng: -2.23 }; // ~222 m due north
const east = { lat: 53.41, lng: -2.227 }; // ~200 m due east

describe('bearingDeg', () => {
  it('is 0 north, 90 east, 180 south, 270 west', () => {
    expect(bearingDeg(A, north)).toBeCloseTo(0, 5);
    expect(bearingDeg(A, east)).toBeCloseTo(90, 1);
    expect(bearingDeg(north, A)).toBeCloseTo(180, 5);
    expect(bearingDeg(east, A)).toBeCloseTo(270, 1);
  });
});

describe('metresPerPixel', () => {
  it('halves with each zoom level and shrinks away from the equator', () => {
    expect(metresPerPixel(17, 53)).toBeCloseTo(metresPerPixel(16, 53) / 2, 6);
    expect(metresPerPixel(16, 53)).toBeLessThan(metresPerPixel(16, 0));
    expect(metresPerPixel(16, 0)).toBeCloseTo(2.39, 1);
  });
});

describe('footprintsAlong', () => {
  it('spaces prints about spacingM apart along the line', () => {
    const prints = footprintsAlong(A, north, { spacingM: 30 });
    expect(prints.length).toBe(7); // 222 m / 30 m
    for (let i = 1; i < prints.length; i++) {
      expect(distanceMeters(prints[i - 1], prints[i])).toBeGreaterThan(25);
      expect(distanceMeters(prints[i - 1], prints[i])).toBeLessThan(35);
    }
  });

  it('alternates right and left, starting with the right foot', () => {
    const sides = footprintsAlong(A, north, { spacingM: 30 }).map((p) => p.side);
    expect(sides.slice(0, 4)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('turns every print to the walking direction', () => {
    expect(footprintsAlong(A, north, { spacingM: 30 }).every((p) => Math.abs(p.bearing) < 1e-6)).toBe(true);
    expect(footprintsAlong(A, east, { spacingM: 30 })[0].bearing).toBeCloseTo(90, 1);
  });

  it('puts the right foot to the right of the walk and the left to the left', () => {
    const [r, l] = footprintsAlong(A, north, { spacingM: 30, offsetM: 2 });
    expect(r.lng).toBeGreaterThan(A.lng); // walking north, right is east
    expect(l.lng).toBeLessThan(A.lng);
    expect(distanceMeters({ lat: r.lat, lng: r.lng }, { lat: r.lat, lng: A.lng })).toBeCloseTo(2, 1);
    const [er, el] = footprintsAlong(A, east, { spacingM: 30, offsetM: 2 });
    expect(er.lat).toBeLessThan(A.lat); // walking east, right is south
    expect(el.lat).toBeGreaterThan(A.lat);
  });

  it('stays clear of both ends by the margin', () => {
    const prints = footprintsAlong(A, north, { spacingM: 30, marginM: 20 });
    for (const p of prints) {
      expect(distanceMeters(p, A)).toBeGreaterThanOrEqual(20);
      expect(distanceMeters(p, north)).toBeGreaterThanOrEqual(20);
    }
  });

  it('gives a short leg one print in the middle, and nothing when the margins fill it', () => {
    const near = { lat: 53.4101, lng: -2.23 }; // ~11 m
    const one = footprintsAlong(A, near, { spacingM: 30 });
    expect(one.length).toBe(1);
    expect(distanceMeters(one[0], A)).toBeCloseTo(distanceMeters(near, A) / 2, 0);
    expect(footprintsAlong(A, near, { spacingM: 30, marginM: 10 })).toEqual([]);
  });

  it('gives nothing for identical points or a bad spacing, and respects the cap', () => {
    expect(footprintsAlong(A, A, { spacingM: 30 })).toEqual([]);
    expect(footprintsAlong(A, north, { spacingM: 0 })).toEqual([]);
    expect(footprintsAlong(A, north, { spacingM: NaN })).toEqual([]);
    expect(footprintsAlong(A, north, { spacingM: 1, max: 5 }).length).toBe(5);
  });
});
