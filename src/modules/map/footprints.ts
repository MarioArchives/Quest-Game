import type { LatLng } from './geo';

/** One footprint on a leg: where it lands, which way it points and which foot it is. */
export interface Footprint extends LatLng {
  /** Walking direction in degrees clockwise from north (0..360). */
  bearing: number;
  side: 'left' | 'right';
}

const M_PER_DEG_LAT = 111_320;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Compass bearing from a to b in degrees clockwise from north, 0..360 (flat-earth, fine over a few km). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Ground size of one screen pixel in metres at a web-mercator zoom and latitude. */
export function metresPerPixel(zoom: number, lat: number): number {
  return (156_543.03392 * Math.cos(toRad(lat))) / 2 ** zoom;
}

export interface FootprintOptions {
  /** Distance between prints along the line, metres. */
  spacingM: number;
  /** How far each foot sits to the side of the line, metres. */
  offsetM?: number;
  /** Keep this far clear of both ends (where the stop pins sit), metres. */
  marginM?: number;
  /** Safety cap on prints per leg. */
  max?: number;
}

/**
 * Footprints along the straight line from `from` to `to`: spaced `spacingM` apart (the leftover is split evenly at
 * both ends), alternating right and left foot, each nudged `offsetM` to its side and turned to face the walk.
 * The first print is a right foot. A leg shorter than the margins gets none.
 */
export function footprintsAlong(from: LatLng, to: LatLng, { spacingM, offsetM = 0, marginM = 0, max = 200 }: FootprintOptions): Footprint[] {
  if (!(spacingM > 0)) return [];
  const midLat = (from.lat + to.lat) / 2;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(toRad(midLat));
  const dx = (to.lng - from.lng) * mPerDegLng; // east, metres
  const dy = (to.lat - from.lat) * M_PER_DEG_LAT; // north, metres
  const length = Math.hypot(dx, dy);
  const usable = length - 2 * marginM;
  if (!(usable > 0)) return [];
  const count = Math.min(max, Math.max(1, Math.floor(usable / spacingM)));
  // Centre the prints in the usable stretch: the first sits half a gap in from the margin.
  const gap = usable / count;
  const bearing = bearingDeg(from, to);
  const ux = dx / length;
  const uy = dy / length;
  const out: Footprint[] = [];
  for (let i = 0; i < count; i++) {
    const along = marginM + gap * (i + 0.5);
    const right = i % 2 === 0;
    const side = (right ? 1 : -1) * offsetM; // right of travel is (uy, -ux)
    const east = ux * along + uy * side;
    const north = uy * along - ux * side;
    out.push({
      lat: from.lat + north / M_PER_DEG_LAT,
      lng: from.lng + east / mPerDegLng,
      bearing,
      side: right ? 'right' : 'left',
    });
  }
  return out;
}
