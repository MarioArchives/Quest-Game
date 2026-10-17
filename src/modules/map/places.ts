// Real bars for the route (packs with stops): the pubs and bars OpenStreetMap knows near a point (and across the
// pack's search area, e.g. a whole city), for the GM to pick instead of dropping a bare pin, and Google Maps links so
// everyone can find the way. No API key: the list comes from the public Overpass API (OpenStreetMap data), or from
// Nominatim (OpenStreetMap's search) when Overpass is busy, and the links are plain Google Maps URLs.
import { distanceMeters, type LatLng } from './geo';

export interface Place {
  /** "osm:node/123": where it came from, so the stop can say which bar it is. */
  ref: string;
  name: string;
  lat: number;
  lng: number;
  /** "73 Wilmslow Road, M20 5WE", or null when OpenStreetMap has no street for it. */
  address: string | null;
  kind: string;
}

/** An area in degrees, e.g. a city's bounding box. */
export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** Overpass is often busy: give up on it after this long and ask Nominatim. */
const OVERPASS_WAIT_MS = 10_000;
/** What counts as a bar, in OpenStreetMap's `amenity` tag. */
const BAR_KINDS = ['pub', 'bar', 'biergarten'];

/** The Overpass query: named pubs, bars and beer gardens within `radiusM` of a point, and anywhere in `box`. */
export function barsQuery(at: LatLng, radiusM: number, box?: Box): string {
  const bars = `["amenity"~"^(${BAR_KINDS.join('|')})$"]["name"]`;
  const near = `nwr(around:${Math.round(radiusM)},${at.lat.toFixed(5)},${at.lng.toFixed(5)})${bars};`;
  const area = box ? `nwr(${[box.south, box.west, box.north, box.east].map((n) => n.toFixed(5)).join(',')})${bars};` : '';
  return `[out:json][timeout:25];(${near}${area});out center tags;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** "73 Wilmslow Road, M20 5WE" from OpenStreetMap's addr:* tags; null without a street. */
export function addressOf(tags: Record<string, string>): string | null {
  const street = tags['addr:street'];
  if (!street) return null;
  const line = tags['addr:housenumber'] ? `${tags['addr:housenumber']} ${street}` : street;
  const tail = tags['addr:postcode'] ?? tags['addr:city'] ?? null;
  return tail ? `${line}, ${tail}` : line;
}

/** The places in an Overpass reply; elements without a name or a position are dropped, duplicates by ref too. */
export function parseOverpass(json: unknown): Place[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements ?? [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const name = e.tags?.name?.trim();
    const ref = `osm:${e.type}/${e.id}`;
    if (!name || typeof lat !== 'number' || typeof lng !== 'number' || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, name, lat, lng, address: e.tags ? addressOf(e.tags) : null, kind: e.tags?.amenity ?? 'pub' });
  }
  return out;
}

interface NominatimResult {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  category?: string;
  type?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/**
 * The places in a Nominatim reply (`format=jsonv2&addressdetails=1`); unnamed and unplaced ones are dropped, and with
 * `barsOnly` anything that isn't a pub, bar or beer garden (a name search also finds streets and shops).
 */
export function parseNominatim(json: unknown, barsOnly = false): Place[] {
  const out: Place[] = [];
  for (const r of Array.isArray(json) ? (json as NominatimResult[]) : []) {
    if (barsOnly && !(r.category === 'amenity' && BAR_KINDS.includes(r.type ?? ''))) continue;
    const name = r.name?.trim();
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!name || !r.osm_type || r.osm_id === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const a = r.address ?? {};
    const tags: Record<string, string> = {};
    if (a.house_number) tags['addr:housenumber'] = a.house_number;
    if (a.road) tags['addr:street'] = a.road;
    const town = a.postcode ?? a.city ?? a.town ?? a.village ?? a.suburb;
    if (town) tags['addr:postcode'] = town;
    out.push({ ref: `osm:${r.osm_type}/${r.osm_id}`, name, lat, lng, address: addressOf(tags), kind: r.type ?? 'pub' });
  }
  return out;
}

/** Nominatim's search URL for one kind of place ("pub", "bar") inside the square around a point. */
export function nominatimUrl(kind: string, at: LatLng, radiusM: number): string {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  const box = [at.lng - dLng, at.lat + dLat, at.lng + dLng, at.lat - dLat].map((n) => n.toFixed(5)).join(',');
  return `${NOMINATIM}?q=${encodeURIComponent(`[${kind}]`)}&format=jsonv2&addressdetails=1&limit=40&bounded=1&viewbox=${box}`;
}

/** Nominatim's name search inside a box: what the GM typed, when Overpass couldn't give the whole list. */
export function nominatimSearchUrl(text: string, box: Box): string {
  const viewbox = [box.west, box.north, box.east, box.south].map((n) => n.toFixed(5)).join(',');
  return `${NOMINATIM}?q=${encodeURIComponent(text)}&format=jsonv2&addressdetails=1&limit=40&bounded=1&viewbox=${viewbox}`;
}

/**
 * Bars in `box` whose name or street matches `text`, from Nominatim. A bare name ("crown") finds streets first, so
 * "pub" goes on the end (it finds bars and beer gardens too) unless the GM typed it.
 */
export async function searchBars(text: string, box: Box, fetchFn: typeof fetch = fetch): Promise<Place[]> {
  const res = await fetchFn(nominatimSearchUrl(/\b(pub|bar)s?\b/i.test(text) ? text : `${text} pub`, box));
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  return parseNominatim(await res.json(), true);
}

async function fromOverpass(at: LatLng, radiusM: number, box: Box | undefined, fetchFn: typeof fetch): Promise<Place[]> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), OVERPASS_WAIT_MS);
  try {
    const res = await fetchFn(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(barsQuery(at, radiusM, box))}`,
      signal: stop.signal,
    });
    if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
    return parseOverpass(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Pubs, then bars, one request a second as Nominatim's rules ask; repeats (a pub listed as a bar) are dropped. */
async function fromNominatim(at: LatLng, radiusM: number, fetchFn: typeof fetch, pauseMs: number): Promise<Place[]> {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const [i, kind] of ['pub', 'bar'].entries()) {
    if (i > 0) await new Promise((done) => setTimeout(done, pauseMs));
    const res = await fetchFn(nominatimUrl(kind, at, radiusM));
    if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
    for (const p of parseNominatim(await res.json())) {
      if (seen.has(p.ref)) continue;
      seen.add(p.ref);
      out.push(p);
    }
  }
  return out;
}

export interface BarsOptions {
  radiusM?: number;
  /** The pack's search area (a city): Overpass lists every bar in it too. */
  box?: Box;
  fetchFn?: typeof fetch;
  /** Between Nominatim's requests (its rules ask for one a second). */
  pauseMs?: number;
}

/**
 * Bars near a point (and across `box`), nearest first: from Overpass, or from Nominatim when Overpass is busy or down,
 * which only lists the nearby ones (`source` says which; the picker then searches the box by name as the GM types).
 * Throws when both fail (the sheet says so and offers the pin).
 */
export async function barsNear(
  at: LatLng,
  { radiusM = 2500, box, fetchFn = fetch, pauseMs = 1100 }: BarsOptions = {},
): Promise<{ places: Place[]; source: 'overpass' | 'nominatim' }> {
  try {
    return { places: filterPlaces(await fromOverpass(at, radiusM, box, fetchFn), '', at), source: 'overpass' };
  } catch (overpass) {
    try {
      return { places: filterPlaces(await fromNominatim(at, radiusM, fetchFn, pauseMs), '', at), source: 'nominatim' };
    } catch (nominatim) {
      throw new Error(`${(overpass as Error).message}; ${(nominatim as Error).message}`);
    }
  }
}

/** Lower case, no accents, single spaces: "Ye Olde Cock Inn" ~ "ye olde cock". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Places whose name or address holds every word of `query` (any order), nearest to `from` first. */
export function filterPlaces(places: Place[], query: string, from: LatLng): Place[] {
  const words = fold(query).split(' ').filter(Boolean);
  return places
    .filter((p) => {
      const hay = fold(`${p.name} ${p.address ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .map((p) => ({ p, d: distanceMeters(from, p) }))
    .sort((a, b) => a.d - b.d || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);
}

/** A stop as the Google Maps links need it. */
export interface MapsStop {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  /** The bar's own name, when the stop's name is the GM's own. */
  placeName?: string | null;
}

/**
 * What Google Maps should look for: the bar by its own name and address when there is one (the stop's name may be
 * the GM's invention), else its exact spot.
 */
function destination(stop: MapsStop): string {
  return stop.address ? `${stop.placeName ?? stop.name}, ${stop.address}` : `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`;
}

/** Walking directions to the stop in Google Maps (the app on a phone, the site elsewhere). */
export function directionsUrl(stop: MapsStop): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(stop))}&travelmode=walking`;
}

/** The stop's own page in Google Maps (opening hours, photos), found by name and address or by its spot. */
export function placeUrl(stop: MapsStop): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination(stop))}`;
}
