// Edge case 46: transforming raw Knack view records into events.json / venues.json.
// Fixtures are hand-made but mirror the real record shapes of LMF's public views
// (view_102 by day, view_93 by venue, view_125 by act, view_194 venues, view_265 venue GPS).
import { describe, expect, it } from 'vitest';
import { toLondonIso, transformKnack } from './knack.mjs';

/** Knack's "iso_timestamp" is London local time wrongly labelled as UTC; "proper_iso_timestamp" is true UTC. */
function when(utcIso: string) {
  const d = new Date(utcIso);
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const mislabelled = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes()));
  return {
    date: `${String(local.getMonth() + 1).padStart(2, '0')}/${String(local.getDate()).padStart(2, '0')}/${local.getFullYear()}`,
    iso_timestamp: mislabelled.toISOString(),
    unix_timestamp: mislabelled.getTime(),
    proper_iso_timestamp: d.toISOString(),
    proper_unix_timestamp: d.getTime(),
  };
}

function byDay(id: string, act: string | null, startUtc: string | null, endUtc: string | null, opts: { day?: string; venueText?: string } = {}) {
  return {
    id,
    field_47: act ? `<span class="act_${id}" data-kn="connection-value">${act}</span>` : '',
    field_47_raw: act ? [{ id: `act_${id}`, identifier: act }] : [],
    field_174: opts.day ?? 'Saturday',
    field_406: opts.venueText ?? 'Somewhere - Main',
    field_48: `About ${act}`,
    field_581_raw: [{ id: 'type1', identifier: 'Performance' }],
    field_143_raw: startUtc ? { ...when(startUtc), to: endUtc ? when(endUtc) : undefined } : undefined,
  };
}

function byVenue(id: string, venueId: string, venueName: string, stage: string | null = null) {
  return {
    id,
    'field_45.field_106': `<span id="${venueId}" data-kn="connection-value">${venueName}</span>`,
    'field_45.field_106_raw': venueName,
    field_115: stage ?? '',
    field_115_raw: stage ? [{ id: 'stage1', identifier: stage }] : [],
  };
}

const byAct = (id: string, genre: string) => ({ id, field_132_raw: [{ id: 'g1', identifier: genre }] });
const venueRec = (id: string, name: string, address: string) => ({ id, field_106: name, field_16: address, field_17: 'LA1 1AA' });
const gpsRec = (id: string, lat: number, lng: number) => ({ id, field_106: 'x', field_503_raw: { latitude: lat, longitude: lng } });

function input(over: Record<string, unknown> = {}) {
  return {
    byDay: [
      byDay('gig1', 'The Luca Brasi Group', '2026-10-10T18:00:00Z', '2026-10-10T18:45:00Z'),
      byDay('gig2', '11th Hour', '2026-10-10T13:00:00Z', '2026-10-10T14:00:00Z'),
    ],
    byVenue: [byVenue('gig1', 'ven1', 'Atkinsons Upper Hall', 'Upper Hall'), byVenue('gig2', 'ven2', 'Bobbin')],
    byAct: [byAct('gig1', 'Jazz'), byAct('gig2', 'Rock')],
    venues: [venueRec('ven1', 'Atkinsons Upper Hall', '10 China Street, Lancaster'), venueRec('ven2', 'Bobbin', '36 Cable Street, Lancaster')],
    gps: [gpsRec('ven2', 54.050881, -2.799793)],
    coordOverrides: { ven1: { lat: 54.0492448, lng: -2.8033735 } },
    ...over,
  };
}

describe('toLondonIso', () => {
  it('writes BST times with +01:00', () => {
    expect(toLondonIso(new Date('2026-10-10T18:00:00Z'))).toBe('2026-10-10T19:00:00+01:00');
  });

  it('writes GMT times with +00:00 after the clocks go back on 25 Oct', () => {
    expect(toLondonIso(new Date('2026-10-26T19:00:00Z'))).toBe('2026-10-26T19:00:00+00:00');
  });

  it('gets the changeover hour right', () => {
    expect(toLondonIso(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25T01:30:00+01:00');
    expect(toLondonIso(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25T01:30:00+00:00');
  });
});

describe('transformKnack', () => {
  it('joins the three views on the record id', () => {
    const { events } = transformKnack(input());
    expect(events.find((e: { id: string }) => e.id === 'gig1')).toEqual({
      id: 'gig1',
      act: 'The Luca Brasi Group',
      venueId: 'ven1',
      stage: 'Upper Hall',
      day: 'Saturday',
      start: '2026-10-10T19:00:00+01:00',
      end: '2026-10-10T19:45:00+01:00',
      genre: 'Jazz',
      type: 'Performance',
      description: 'About The Luca Brasi Group',
    });
  });

  it('uses proper_iso_timestamp, never the mislabelled iso_timestamp', () => {
    const gig2 = transformKnack(input()).events.find((e: { id: string }) => e.id === 'gig2');
    expect(gig2!.start).toBe('2026-10-10T14:00:00+01:00');
    expect(Date.parse(gig2!.start)).toBe(Date.parse('2026-10-10T13:00:00Z'));
  });

  it('keeps a gig missing from the genre view, with a null genre', () => {
    const { events } = transformKnack(input({ byAct: [byAct('gig1', 'Jazz')] }));
    expect(events.find((e: { id: string }) => e.id === 'gig2')).toMatchObject({ genre: null, venueId: 'ven2' });
  });

  it('skips gigs with no act, no start, or no known venue', () => {
    const { events } = transformKnack(
      input({
        byDay: [
          byDay('gig1', 'The Luca Brasi Group', '2026-10-10T18:00:00Z', '2026-10-10T18:45:00Z'),
          byDay('noAct', null, '2026-10-10T18:00:00Z', null),
          byDay('noStart', 'Ghost Act', null, null),
          byDay('noVenue', 'Wanderers', '2026-10-10T18:00:00Z', null),
        ],
        byVenue: [byVenue('gig1', 'ven1', 'Atkinsons Upper Hall'), byVenue('noAct', 'ven1', 'Atkinsons Upper Hall'), byVenue('noStart', 'ven1', 'Atkinsons Upper Hall')],
      }),
    );
    expect(events.map((e: { id: string }) => e.id)).toEqual(['gig1']);
  });

  it('gives a set that ends after midnight an end on the next date', () => {
    const { events } = transformKnack(
      input({ byDay: [byDay('gig1', 'Late Band', '2026-10-10T22:30:00Z', '2026-10-11T00:00:00Z')] }),
    );
    expect(events[0]).toMatchObject({ start: '2026-10-10T23:30:00+01:00', end: '2026-10-11T01:00:00+01:00' });
  });

  it("derives the day from the start time in London, not the hand-typed day label", () => {
    const { events } = transformKnack(
      input({ byDay: [byDay('gig1', 'Night Owls', '2026-10-10T23:15:00Z', '2026-10-11T00:15:00Z', { day: 'Saturday' })] }),
    );
    expect(events[0]).toMatchObject({ start: '2026-10-11T00:15:00+01:00', day: 'Sunday' });
  });

  it('keeps a missing end as null', () => {
    const { events } = transformKnack(input({ byDay: [byDay('gig1', 'Open Mic', '2026-10-10T18:00:00Z', null)] }));
    expect(events[0].end).toBeNull();
  });

  it('sorts events by start time, then act', () => {
    const { events } = transformKnack(input());
    expect(events.map((e: { id: string }) => e.id)).toEqual(['gig2', 'gig1']);
  });

  it('reads the venue id from the HTML span and de-duplicates venues', () => {
    const { venues } = transformKnack(
      input({
        byDay: [
          byDay('gig1', 'A', '2026-10-10T18:00:00Z', null),
          byDay('gig3', 'B', '2026-10-10T19:00:00Z', null),
        ],
        byVenue: [byVenue('gig1', 'ven1', 'Atkinsons Upper Hall'), byVenue('gig3', 'ven1', 'Atkinsons Upper Hall')],
      }),
    );
    expect(venues.filter((v: { id: string }) => v.id === 'ven1')).toHaveLength(1);
  });

  it('takes coordinates from the GPS view, then the overrides, else null', () => {
    const { venues } = transformKnack(
      input({
        venues: [
          venueRec('ven1', 'Atkinsons Upper Hall', '10 China Street, Lancaster'),
          venueRec('ven2', 'Bobbin', '36 Cable Street, Lancaster'),
          venueRec('ven3', 'Busk Stops', 'various'),
        ],
        gps: [gpsRec('ven2', 54.050881, -2.799793)],
        coordOverrides: { ven1: { lat: 54.0492448, lng: -2.8033735 }, ven2: { lat: 1, lng: 1 } },
      }),
    );
    const byId = Object.fromEntries(venues.map((v: { id: string }) => [v.id, v]));
    expect(byId.ven1).toEqual({ id: 'ven1', name: 'Atkinsons Upper Hall', lat: 54.0492448, lng: -2.8033735, address: '10 China Street, Lancaster' });
    expect(byId.ven2).toMatchObject({ lat: 54.050881, lng: -2.799793 });
    expect(byId.ven3).toMatchObject({ name: 'Busk Stops', lat: null, lng: null });
  });

  it('includes a venue that only appears in the gig listings, named from the span', () => {
    const { venues } = transformKnack(
      input({
        byDay: [byDay('gig1', 'A', '2026-10-10T18:00:00Z', null)],
        byVenue: [byVenue('gig1', 'venNew', 'Pop-up Tent')],
        venues: [],
        gps: [],
        coordOverrides: {},
      }),
    );
    expect(venues).toEqual([{ id: 'venNew', name: 'Pop-up Tent', lat: null, lng: null, address: null }]);
  });

  it('is deterministic (stable ids and ordering)', () => {
    expect(transformKnack(input())).toEqual(transformKnack(input()));
    const shuffled = input();
    shuffled.byDay.reverse();
    shuffled.venues.reverse();
    expect(transformKnack(shuffled)).toEqual(transformKnack(input()));
  });
});
