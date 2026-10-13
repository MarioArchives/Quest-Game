import type { Venue } from '../../../functions/src/shared/types';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius in metres. */
const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How many of `points` are within `radiusM` (inclusive) of `target`, e.g. players at a stop. */
export function countWithin(points: readonly LatLng[], target: LatLng, radiusM: number): number {
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && distanceMeters(p, target) <= radiusM).length;
}

/** Closest venue within radiusM (inclusive), skipping venues without coordinates; null if none. */
export function nearestVenue(
  pos: LatLng,
  venues: readonly Venue[],
  radiusM = 75,
): { venue: Venue; distance: number } | null {
  let best: { venue: Venue; distance: number } | null = null;
  for (const venue of venues) {
    if (venue.lat === null || venue.lng === null) continue;
    const distance = distanceMeters(pos, { lat: venue.lat, lng: venue.lng });
    if (distance <= radiusM && (best === null || distance < best.distance)) {
      best = { venue, distance };
    }
  }
  return best;
}

export const LOCATION_MIN_INTERVAL_MS = 60_000;
export const LOCATION_MIN_DISTANCE_M = 50;
export const LOCATION_MIN_GAP_MS = 15_000;

/**
 * Throttle for writing locations/{uid}: always send the first fix; otherwise send after 60 s,
 * or after moving 50 m as long as at least 15 s have passed since the last send.
 */
export function shouldSendLocation(
  last: (LatLng & { at: number }) | null,
  next: LatLng,
  now: number,
): boolean {
  if (last === null) return true;
  const elapsed = now - last.at;
  if (elapsed >= LOCATION_MIN_INTERVAL_MS) return true;
  return elapsed >= LOCATION_MIN_GAP_MS && distanceMeters(last, next) >= LOCATION_MIN_DISTANCE_M;
}

/**
 * "You're 85 km from <placeName>" once a position is more than nearbyKm from the centre
 * (rounded: one decimal under 10 km, whole km above); null when nearby.
 */
export function distanceLabel(pos: LatLng, centre: LatLng, placeName: string, nearbyKm = 2): string | null {
  const km = distanceMeters(pos, centre) / 1000;
  if (km <= nearbyKm) return null;
  // Round first, then decide the format, so 9.96 km reads "10 km" and not "10.0 km".
  const tenths = Math.round(km * 10) / 10;
  const text = tenths < 10 ? tenths.toFixed(1) : String(Math.round(km));
  return `You're ${text} km from ${placeName}`;
}
