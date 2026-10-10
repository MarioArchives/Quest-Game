// Pure transform from raw Knack view records to the app's static festival data.
// Kept separate from scripts/import-schedule.mjs (which does the HTTP) so it can be tested.

const LONDON = 'Europe/London';

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const londonWeekday = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, weekday: 'long' });

const pad = (n) => String(n).padStart(2, '0');

/**
 * Format a Date as ISO 8601 with the Europe/London offset, e.g. 2026-10-10T19:00:00+01:00.
 * @param {Date} date
 * @returns {string}
 */
export function toLondonIso(date) {
  const p = Object.fromEntries(londonParts.formatToParts(date).map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMin = Math.round((localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the handful of HTML entities that can appear in Knack's rendered connection spans. */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Non-empty trimmed string, else null. */
function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `identifier` of the first connection value in a *_raw array, else null. */
function firstIdentifier(raw) {
  return Array.isArray(raw) ? clean(raw[0]?.identifier) : null;
}

/** Epoch ms of a Knack date-time value's true-UTC timestamp, or null. */
function properMs(value) {
  const iso = value?.proper_iso_timestamp;
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Venue id and name from the connection span in a view_93 record, e.g. <span id="ID" ...>Name</span>. */
function venueFromSpan(record) {
  const html = record?.['field_45.field_106'] ?? record?.field_106;
  if (typeof html !== 'string') return null;
  const match = /<span\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
  if (!match) return null;
  const name = clean(decodeEntities(match[2].replace(/<[^>]*>/g, '')));
  return { id: match[1], name };
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {object} input
 * @param {object[]} input.byDay     view_102 records (times, act, description, type)
 * @param {object[]} input.byVenue   view_93 records (venue span id, stage)
 * @param {object[]} input.byAct     view_125 records (genre)
 * @param {object[]} input.venues    view_194 records (venue name, address, postcode)
 * @param {object[]} input.gps       view_265 records (venue GPS in field_503_raw)
 * @param {Record<string, {lat: number, lng: number}>} [input.coordOverrides]
 * @returns {{ events: import('../../functions/src/shared/types').FestivalEvent[],
 *             venues: import('../../functions/src/shared/types').Venue[] }}
 */
export function transformKnack({ byDay = [], byVenue = [], byAct = [], venues = [], gps = [], coordOverrides = {} }) {
  const venueByGig = new Map();
  for (const record of byVenue) {
    const venue = venueFromSpan(record);
    if (venue) venueByGig.set(record.id, { ...venue, stage: firstIdentifier(record.field_115_raw) });
  }
  const genreByGig = new Map(byAct.map((record) => [record.id, firstIdentifier(record.field_132_raw)]));

  /** @type {Map<string, string | null>} venue id -> name seen on a gig listing */
  const gigVenues = new Map();
  const timed = [];

  for (const record of byDay) {
    const act = firstIdentifier(record.field_47_raw);
    const startMs = properMs(record.field_143_raw);
    const venue = venueByGig.get(record.id);
    if (!act || startMs === null || !venue) continue;

    const endMs = properMs(record.field_143_raw?.to);
    gigVenues.set(venue.id, gigVenues.get(venue.id) ?? venue.name);
    timed.push({
      startMs,
      event: {
        id: record.id,
        act,
        venueId: venue.id,
        stage: venue.stage,
        day: londonWeekday.format(new Date(startMs)),
        start: toLondonIso(new Date(startMs)),
        end: endMs === null ? null : toLondonIso(new Date(endMs)),
        genre: genreByGig.get(record.id) ?? null,
        type: firstIdentifier(record.field_581_raw),
        description: clean(record.field_48),
      },
    });
  }

  timed.sort((a, b) => a.startMs - b.startMs || compare(a.event.act, b.event.act) || compare(a.event.id, b.event.id));

  const gpsById = new Map();
  for (const record of gps) {
    const { latitude, longitude } = record.field_503_raw ?? {};
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) gpsById.set(record.id, { lat: latitude, lng: longitude });
  }
  const coordsFor = (id) => {
    const found = gpsById.get(id) ?? coordOverrides[id];
    return found && Number.isFinite(found.lat) && Number.isFinite(found.lng)
      ? { lat: found.lat, lng: found.lng }
      : { lat: null, lng: null };
  };

  const venueMap = new Map();
  for (const record of venues) {
    const name = clean(record.field_106) ?? clean(record.field_15) ?? gigVenues.get(record.id) ?? record.id;
    venueMap.set(record.id, { id: record.id, name, ...coordsFor(record.id), address: clean(record.field_16) });
  }
  for (const [id, spanName] of gigVenues) {
    if (!venueMap.has(id)) {
      venueMap.set(id, { id, name: spanName ?? id, ...coordsFor(id), address: null });
    }
  }

  const sortedVenues = [...venueMap.values()].sort(
    (a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.name, b.name) || compare(a.id, b.id),
  );

  return { events: timed.map((t) => t.event), venues: sortedVenues };
}
