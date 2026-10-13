import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { latLngBounds, point } from 'leaflet';
import { AttributionControl, Circle, MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { VenueSchedule } from './events';
import { footprintsAlong, metresPerPixel } from './footprints';
import { draftIcon, footprintIcon, playerIcon, stopIcon, venueIcon, youIcon, Z, type StopState } from './markers';
import type { RouteStop } from './stops';
import './map.css';

const CLOSE_ZOOM = 17;

export interface MapPlayer {
  uid: string;
  name: string;
  photoURL: string | null;
  lat: number;
  lng: number;
  /** "2 min ago" */
  ago: string;
}

/** Ask the map to fly somewhere; a new object (new nonce) re-triggers it even for the same spot. */
export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  /** GPS accuracy in metres: the zoom backs off, if needed, so the whole accuracy circle is in view. */
  accuracy?: number | null;
  nonce: number;
}

export interface MapViewProps {
  /** Where the map opens: the pack's map centre. */
  centre: [number, number];
  /** Zoom the map opens at. */
  zoom: number;
  /** Who the schedule data belongs to, credited next to the map tiles. */
  credit?: { label: string; url: string } | null;
  schedules: VenueSchedule[];
  players: MapPlayer[];
  you: { lat: number; lng: number; name: string; accuracy: number | null } | null;
  focus: MapFocus | null;
  onSelectVenue(venueId: string): void;
  /** The GM's route: stops in order (numbered pins joined by a line), with each one's state. Packs with stops only. */
  stops?: RouteStop[];
  stopStates?: Map<string, StopState>;
  onSelectStop?(stopId: string): void;
  /** How the route is drawn between stops (the pack's choice); default a dashed line. */
  routeStyle?: 'line' | 'footprints';
  /** When set, a tap on the empty map reports where (the GM placing or moving a stop). */
  onPick?(lat: number, lng: number): void;
  /** A pin shown while a stop is being placed. */
  draft?: { lat: number; lng: number } | null;
  /** Overlay controls (legend, recentre) drawn over the map. */
  children?: ReactNode;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** OpenStreetMap's credit, plus the schedule's owner when the pack names one (Leaflet takes HTML here). */
function attribution(credit: MapViewProps['credit']): string {
  const osm = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
  if (!credit) return osm;
  return `${osm} · Schedule: <a href="${escapeHtml(credit.url)}" target="_blank" rel="noreferrer">${escapeHtml(credit.label)}</a>`;
}

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function FlyTo({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const target: [number, number] = [focus.lat, focus.lng];
    let zoom = focus.zoom ?? Math.max(map.getZoom(), 17);
    if (focus.accuracy && focus.accuracy > 0) {
      // A rough fix (a desktop's network location can be kilometres out) needs a wider view, never closer than asked.
      // (An un-added Leaflet Circle can't report its bounds, so work them out directly.)
      const dLat = focus.accuracy / 111_320;
      const dLng = focus.accuracy / (111_320 * Math.max(0.01, Math.cos((focus.lat * Math.PI) / 180)));
      const bounds = latLngBounds([focus.lat - dLat, focus.lng - dLng], [focus.lat + dLat, focus.lng + dLng]);
      const fit = map.getBoundsZoom(bounds, false, point(24, 24));
      zoom = Math.min(zoom, Math.max(map.getMinZoom(), fit));
    }
    if (prefersReducedMotion()) map.setView(target, zoom, { animate: false });
    else map.flyTo(target, zoom, { duration: 0.7 });
  }, [focus, map]);
  return null;
}

/** Keeps the map's size right when its box changes (font load, rotation, the URL bar sliding away). */
function Resizer() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    map.invalidateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Reports taps on the map itself (not on pins or controls) while the GM is placing a stop. */
function Picker({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().classList.toggle('is-picking', !!onPick);
  }, [map, onPick]);
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

const FOOT_SPACING_PX = 22; // about 30 m apart at the usual zoom
const FOOT_OFFSET_PX = 3;
const FOOT_MARGIN_PX = 26; // clear of the stop pins at either end

/** A trail of footprints along each leg of the route; a leg to a hidden stop (GM view) is ghosted. */
function Footprints({ stops }: { stops: RouteStop[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const prints = useMemo(() => {
    const out: Array<{ key: string; lat: number; lng: number; bearing: number; side: 'left' | 'right'; ghost: boolean }> = [];
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const mpp = metresPerPixel(zoom, (a.lat + b.lat) / 2);
      const ghost = !a.revealed || !b.revealed;
      footprintsAlong(a, b, { spacingM: FOOT_SPACING_PX * mpp, offsetM: FOOT_OFFSET_PX * mpp, marginM: FOOT_MARGIN_PX * mpp }).forEach((f, j) =>
        out.push({ key: `${a.id}>${b.id}:${j}`, ...f, ghost }),
      );
    }
    return out;
  }, [stops, zoom]);
  return (
    <>
      {prints.map((f) => (
        <Marker key={f.key} position={[f.lat, f.lng]} icon={footprintIcon(f.bearing, f.side, f.ghost)} interactive={false} keyboard={false} zIndexOffset={Z.feet} />
      ))}
    </>
  );
}

/** Flags the container when zoomed in close, so CSS can show venue name labels only then. */
function ZoomFlag() {
  const map = useMap();
  useEffect(() => {
    map.getContainer().classList.toggle('is-close', map.getZoom() >= CLOSE_ZOOM);
  }, [map]);
  useMapEvents({
    zoomend: () => map.getContainer().classList.toggle('is-close', map.getZoom() >= CLOSE_ZOOM),
  });
  return null;
}

/** The accent colour as the page computes it (--accent), for map shapes that cannot use CSS variables. */
function cssColour(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}
const accentColour = () => cssColour('--accent', '#e1251b');

/** The Leaflet map with its markers. All markers are divIcons (see markers.ts). */
export function MapView({
  centre,
  zoom,
  credit,
  schedules,
  players,
  you,
  focus,
  onSelectVenue,
  stops = [],
  stopStates,
  onSelectStop,
  routeStyle = 'line',
  onPick,
  draft = null,
  children,
}: MapViewProps) {
  const [tilesDown, setTilesDown] = useState(false);
  const tiles = useRef({ loaded: 0, failed: 0 });
  const accent = useMemo(accentColour, []);
  const ink = useMemo(() => cssColour('--ink', '#111111'), []);

  const settleTiles = () => {
    const { loaded, failed } = tiles.current;
    const down = failed >= 3 && failed > loaded;
    setTilesDown((prev) => (prev === down ? prev : down));
  };

  const venueMarkers = useMemo(
    () =>
      schedules
        .filter((s) => s.venue.lat !== null && s.venue.lng !== null)
        .map((s) => (
          <Marker
            key={s.venue.id}
            position={[s.venue.lat as number, s.venue.lng as number]}
            icon={venueIcon(s.status, s.venue.name)}
            title={s.venue.name}
            // 40-odd pins would be 40 tab stops; every venue is reachable from the lists under the map instead.
            keyboard={s.status === 'now' || s.status === 'soon'}
            zIndexOffset={Z[s.status]}
            eventHandlers={{ click: () => onSelectVenue(s.venue.id) }}
          />
        )),
    [schedules, onSelectVenue],
  );

  return (
    <div className="fqmap">
      <MapContainer
        className="fqmap__map"
        center={centre}
        zoom={zoom}
        minZoom={13}
        maxZoom={19}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={attribution(credit)}
          maxNativeZoom={19}
          eventHandlers={{
            tileload: () => {
              tiles.current.loaded += 1;
              if (tilesDown) settleTiles();
            },
            tileerror: () => {
              tiles.current.failed += 1;
              settleTiles();
            },
          }}
        />
        <AttributionControl prefix={false} position="bottomright" />
        <ZoomControl position="bottomleft" />
        <Resizer />
        <ZoomFlag />
        <FlyTo focus={focus} />
        <Picker onPick={onPick} />

        {routeStyle === 'footprints' ? (
          <Footprints stops={stops} />
        ) : (
          stops.slice(1).map((b, i) => {
            const a = stops[i];
            return (
              <Polyline
                key={`${a.id}>${b.id}`}
                positions={[[a.lat, a.lng], [b.lat, b.lng]]}
                interactive={false}
                pathOptions={{ color: ink, weight: 3, opacity: a.revealed && b.revealed ? 0.8 : 0.3, dashArray: '8 8', className: 'fqroute' }}
              />
            );
          })
        )}
        {stops.map((s) => (
          <Marker
            // The number is in the key because Leaflet reads `title` once, and a stop's number changes when others are added.
            key={`${s.id}:${s.number}:${s.name}:${stopStates?.get(s.id) ?? ''}`}
            position={[s.lat, s.lng]}
            icon={stopIcon(s.number, s.name, stopStates?.get(s.id) ?? 'later')}
            title={`${s.number}. ${s.name}`}
            zIndexOffset={Z.stop + (stopStates?.get(s.id) === 'now' ? 50 : 0)}
            eventHandlers={{ click: () => onSelectStop?.(s.id) }}
          />
        ))}
        {draft ? <Marker position={[draft.lat, draft.lng]} icon={draftIcon()} interactive={false} keyboard={false} zIndexOffset={Z.stop + 100} /> : null}

        {venueMarkers}

        {players.map((p) => (
          <Marker
            key={p.uid}
            position={[p.lat, p.lng]}
            icon={playerIcon(p.name, p.photoURL, p.ago)}
            interactive={false}
            keyboard={false}
            zIndexOffset={Z.player}
          />
        ))}

        {you && you.accuracy && you.accuracy > 0 ? (
          <Circle
            center={[you.lat, you.lng]}
            radius={you.accuracy}
            interactive={false}
            pathOptions={{ color: accent, weight: 2, opacity: 0.7, fillColor: accent, fillOpacity: 0.1, className: 'fqaccuracy' }}
          />
        ) : null}

        {you ? (
          <Marker position={[you.lat, you.lng]} icon={youIcon(you.name)} interactive={false} keyboard={false} zIndexOffset={Z.you} />
        ) : null}
      </MapContainer>

      {tilesDown ? (
        <p className="fqmap__offline" role="status">
          Map tiles can&apos;t load right now. The pins still work.
        </p>
      ) : null}
      {children}
    </div>
  );
}
