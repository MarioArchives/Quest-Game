import { describe, expect, it, vi } from 'vitest';
import { addressOf, barsNear, barsQuery, directionsUrl, filterPlaces, nominatimUrl, parseNominatim, parseOverpass, placeUrl, type Place } from './places';

const DIDSBURY = { lat: 53.4145, lng: -2.2312 };

describe('barsQuery', () => {
  it('asks for named pubs, bars and beer gardens around the point', () => {
    const q = barsQuery(DIDSBURY, 2500.4);
    expect(q).toContain('around:2500,53.41450,-2.23120');
    expect(q).toContain('"amenity"~"^(pub|bar|biergarten)$"');
    expect(q).toContain('["name"]');
    expect(q).toContain('out center tags');
  });
});

describe('addressOf', () => {
  it('builds "number street, postcode", falling back to the city, and needs a street', () => {
    expect(addressOf({ 'addr:housenumber': '73', 'addr:street': 'Wilmslow Road', 'addr:postcode': 'M20 5WE' })).toBe('73 Wilmslow Road, M20 5WE');
    expect(addressOf({ 'addr:street': 'Wilmslow Road', 'addr:city': 'Manchester' })).toBe('Wilmslow Road, Manchester');
    expect(addressOf({ 'addr:street': 'Elm Grove' })).toBe('Elm Grove');
    expect(addressOf({ 'addr:postcode': 'M20 5WE' })).toBeNull();
  });
});

describe('parseOverpass', () => {
  it('reads nodes by their position and ways by their centre, and drops unnamed, unplaced and repeated ones', () => {
    const json = {
      elements: [
        { type: 'node', id: 1, lat: 53.41571, lon: -2.23219, tags: { amenity: 'pub', name: 'The Crown', 'addr:street': 'Elm Grove' } },
        { type: 'way', id: 2, center: { lat: 53.4163, lon: -2.2315 }, tags: { amenity: 'bar', name: ' Royal Oak ' } },
        { type: 'node', id: 3, lat: 53.4, lon: -2.2, tags: { amenity: 'pub' } },
        { type: 'way', id: 4, tags: { amenity: 'pub', name: 'No centre' } },
        { type: 'node', id: 1, lat: 53.41571, lon: -2.23219, tags: { amenity: 'pub', name: 'The Crown' } },
      ],
    };
    expect(parseOverpass(json)).toEqual([
      { ref: 'osm:node/1', name: 'The Crown', lat: 53.41571, lng: -2.23219, address: 'Elm Grove', kind: 'pub' },
      { ref: 'osm:way/2', name: 'Royal Oak', lat: 53.4163, lng: -2.2315, address: null, kind: 'bar' },
    ]);
  });
  it('copes with an empty or odd reply', () => {
    expect(parseOverpass({})).toEqual([]);
    expect(parseOverpass(null)).toEqual([]);
  });
});

const place = (name: string, lat: number, address: string | null = null): Place => ({ ref: `osm:node/${name}`, name, lat, lng: -2.2312, address, kind: 'pub' });

describe('filterPlaces', () => {
  const list = [place('Head of Steam', 53.4186), place('The Crown', 53.4157, '1 Elm Grove'), place('Ye Olde Cock Inn', 53.4106), place('Café Olé', 53.415)];
  it('sorts nearest first with no query', () => {
    expect(filterPlaces(list, '', DIDSBURY).map((p) => p.name)).toEqual(['Café Olé', 'The Crown', 'Ye Olde Cock Inn', 'Head of Steam']);
  });
  it('matches every word of the query in any order, ignoring case, accents and punctuation, in the name or address', () => {
    expect(filterPlaces(list, 'cock olde', DIDSBURY).map((p) => p.name)).toEqual(['Ye Olde Cock Inn']);
    expect(filterPlaces(list, 'cafe', DIDSBURY).map((p) => p.name)).toEqual(['Café Olé']);
    expect(filterPlaces(list, 'elm grove', DIDSBURY).map((p) => p.name)).toEqual(['The Crown']);
    expect(filterPlaces(list, 'nowhere', DIDSBURY)).toEqual([]);
  });
});

describe('barsNear', () => {
  it('posts the query to Overpass and returns the bars nearest first', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ elements: [
        { type: 'node', id: 1, lat: 53.4186, lon: -2.2312, tags: { name: 'Far' } },
        { type: 'node', id: 2, lat: 53.4146, lon: -2.2312, tags: { name: 'Near' } },
      ] }), { status: 200 }),
    );
    const out = await barsNear(DIDSBURY, 1000, fetchFn as unknown as typeof fetch);
    expect(out.map((p) => p.name)).toEqual(['Near', 'Far']);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain(encodeURIComponent('around:1000,'));
  });
  it('asks Nominatim for pubs then bars when Overpass is busy, dropping repeats', async () => {
    const pub = { osm_type: 'node', osm_id: 7, name: 'Fletcher Moss Pub', type: 'pub', lat: '53.4168', lon: '-2.2298', address: { house_number: '1', road: 'William Street', postcode: 'M20 6RQ' } };
    const bar = { osm_type: 'way', osm_id: 8, name: 'Volta', type: 'bar', lat: '53.4264', lon: '-2.2426', address: { road: 'Burton Road' } };
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('overpass')) return new Response('busy', { status: 504 });
      return new Response(JSON.stringify(url.includes('%5Bpub%5D') ? [pub] : [bar, pub]), { status: 200 });
    });
    const out = await barsNear(DIDSBURY, 1000, fetchFn as unknown as typeof fetch, 0);
    expect(out.map((p) => p.name)).toEqual(['Fletcher Moss Pub', 'Volta']);
    expect(out[0]!.address).toBe('1 William Street, M20 6RQ');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it('throws when both say no', async () => {
    const fetchFn = vi.fn(async () => new Response('busy', { status: 429 }));
    await expect(barsNear(DIDSBURY, 1000, fetchFn as unknown as typeof fetch, 0)).rejects.toThrow(/Overpass answered 429; Nominatim answered 429/);
  });
});

describe('Nominatim', () => {
  it('searches one kind inside the square around the point', () => {
    const url = nominatimUrl('pub', DIDSBURY, 1000);
    expect(url).toContain('https://nominatim.openstreetmap.org/search?q=%5Bpub%5D&format=jsonv2&addressdetails=1&limit=40&bounded=1&viewbox=');
    const box = new URL(url).searchParams.get('viewbox')!.split(',').map(Number);
    expect(box[0]).toBeCloseTo(-2.2462, 3);
    expect(box[1]).toBeCloseTo(53.4235, 3);
    expect(box[2]).toBeCloseTo(-2.2162, 3);
    expect(box[3]).toBeCloseTo(53.4055, 3);
  });
  it('reads names, spots and addresses, and drops unnamed or unplaced results', () => {
    expect(
      parseNominatim([
        { osm_type: 'way', osm_id: 2, name: 'The Crown', type: 'pub', lat: '53.41571', lon: '-2.23219', address: { road: 'Elm Grove', city: 'Manchester' } },
        { osm_type: 'node', osm_id: 3, name: '', type: 'pub', lat: '53.4', lon: '-2.2' },
        { osm_type: 'node', osm_id: 4, name: 'Nowhere', type: 'bar', lat: 'x', lon: '-2.2' },
      ]),
    ).toEqual([{ ref: 'osm:way/2', name: 'The Crown', lat: 53.41571, lng: -2.23219, address: 'Elm Grove, Manchester', kind: 'pub' }]);
    expect(parseNominatim({ error: 'no' })).toEqual([]);
  });
});

describe('Google Maps links', () => {
  const crown = { name: 'The Crown', lat: 53.41571, lng: -2.23219, address: '1 Elm Grove, M20 6PL' };
  it('walks to the bar by name and address when there is one', () => {
    expect(directionsUrl(crown)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=The%20Crown%2C%201%20Elm%20Grove%2C%20M20%206PL&travelmode=walking',
    );
    expect(placeUrl(crown)).toBe('https://www.google.com/maps/search/?api=1&query=The%20Crown%2C%201%20Elm%20Grove%2C%20M20%206PL');
  });
  it('looks for the bar by its own name when the GM has renamed the stop', () => {
    expect(placeUrl({ ...crown, name: 'Scene of the crime', placeName: 'The Crown' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=The%20Crown%2C%201%20Elm%20Grove%2C%20M20%206PL',
    );
  });
  it('falls back to the exact spot without an address', () => {
    expect(directionsUrl({ ...crown, address: null })).toContain('destination=53.415710%2C-2.232190&travelmode=walking');
    expect(placeUrl({ ...crown, address: undefined })).toContain('query=53.415710%2C-2.232190');
  });
});
