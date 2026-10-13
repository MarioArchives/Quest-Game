// A pack's starting route as stop documents, shared by the seed script (real games) and the demo data.
import type { GamePack } from './packs/types.ts';

/** The doc id of the pack route's stop at `index` (0-based): route-1, route-2, ... */
export function routeStopId(index: number): string {
  return `route-${index + 1}`;
}

export interface RouteSeedStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 1..n, in the pack's order. */
  order: number;
  /** The bar's address, where it came from and its own name (the stop's name), when the pack names a real bar. */
  address: string | null;
  placeRef: string | null;
  placeName: string | null;
}

/** The pack's route as stops to seed; empty without the stops feature or a route. */
export function routeSeedStops(pack: GamePack): RouteSeedStop[] {
  if (!pack.features.stops || !pack.route) return [];
  return pack.route.map((s, i) => ({
    id: routeStopId(i),
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    order: i + 1,
    address: s.address ?? null,
    placeRef: s.placeRef ?? null,
    placeName: s.placeRef ? s.name : null,
  }));
}
