// Edge cases 40 (location throttle) and 43 (distance to a venue).
import { describe, expect, it } from 'vitest';
import type { Venue } from '../../functions/src/shared/types';
import { distanceMeters, FESTIVAL_CENTRE, festivalDistanceLabel, nearestVenue, shouldSendLocation } from './geo';

const CASTLE = { lat: 54.049526, lng: -2.804843 };
const PRIORY = { lat: 54.050591, lng: -2.805768 };
/** A point `m` metres due north of `p` (1° of latitude ≈ 111 195 m). */
const north = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });

const venue = (id: string, p: { lat: number; lng: number } | null): Venue => ({
  id, name: id, lat: p?.lat ?? null, lng: p?.lng ?? null, address: null,
});

describe('distanceMeters', () => {
  it('is 0 for the same point', () => {
    expect(distanceMeters(CASTLE, CASTLE)).toBe(0);
  });

  it('measures short distances accurately', () => {
    expect(distanceMeters(CASTLE, north(CASTLE, 100))).toBeCloseTo(100, 0);
    const d = distanceMeters(CASTLE, PRIORY);
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(145);
  });
});

describe('nearestVenue', () => {
  const venues = [venue('castle', CASTLE), venue('priory', PRIORY), venue('busk', null)];

  it('counts 75 m as at the venue and 76 m as not', () => {
    expect(nearestVenue(north(CASTLE, 74.9), [venue('castle', CASTLE)])?.venue.id).toBe('castle');
    expect(nearestVenue(north(CASTLE, 76), [venue('castle', CASTLE)])).toBeNull();
  });

  it('includes the radius boundary itself', () => {
    const pos = north(CASTLE, 40);
    const d = distanceMeters(pos, CASTLE);
    expect(nearestVenue(pos, [venue('castle', CASTLE)], d)?.venue.id).toBe('castle');
  });

  it('picks the closest venue in range and reports the distance', () => {
    const res = nearestVenue(north(CASTLE, 10), venues)!;
    expect(res.venue.id).toBe('castle');
    expect(res.distance).toBeCloseTo(10, 0);
  });

  it('skips venues without coordinates and returns null with no venues', () => {
    expect(nearestVenue(CASTLE, [venue('busk', null)])).toBeNull();
    expect(nearestVenue(CASTLE, [])).toBeNull();
  });
});

describe('shouldSendLocation', () => {
  const t0 = 1_000_000;
  const last = { ...CASTLE, at: t0 };

  it('always sends the first fix', () => {
    expect(shouldSendLocation(null, CASTLE, t0)).toBe(true);
  });

  it('skips when under 60 s and under 50 m', () => {
    expect(shouldSendLocation(last, north(CASTLE, 40), t0 + 59_000)).toBe(false);
    expect(shouldSendLocation(last, CASTLE, t0 + 30_000)).toBe(false);
  });

  it('sends after 60 s even without moving', () => {
    expect(shouldSendLocation(last, CASTLE, t0 + 60_000)).toBe(true);
  });

  it('sends after moving 50 m, but not more than once every 15 s', () => {
    expect(shouldSendLocation(last, north(CASTLE, 60), t0 + 15_000)).toBe(true);
    expect(shouldSendLocation(last, north(CASTLE, 60), t0 + 10_000)).toBe(false);
  });
});

describe('festivalDistanceLabel (V20)', () => {
  it('says nothing within 2 km of the festival centre', () => {
    expect(festivalDistanceLabel(FESTIVAL_CENTRE)).toBeNull();
    expect(festivalDistanceLabel(north(FESTIVAL_CENTRE, 1_990))).toBeNull();
  });

  it('gives one decimal under 10 km and whole km beyond', () => {
    expect(festivalDistanceLabel(north(FESTIVAL_CENTRE, 2_500))).toBe("You're 2.5 km from the festival");
    expect(festivalDistanceLabel(north(FESTIVAL_CENTRE, 12_400))).toBe("You're 12 km from the festival");
  });

  it('works for somewhere far away (Manchester is about 70 km)', () => {
    const label = festivalDistanceLabel({ lat: 53.4808, lng: -2.2426 });
    expect(label).toMatch(/^You're (6\d|7\d) km from the festival$/);
  });
});
