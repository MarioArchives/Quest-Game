import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { latLngBounds, point } from 'leaflet';
import { AttributionControl, Circle, MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { VenueSchedule } from './events';
import { playerIcon, venueIcon, youIcon, Z } from './markers';
import './map.css';

/** Lancaster city centre, the middle of the festival's venues. */
export const FESTIVAL_CENTRE: [number, number] = [54.0485, -2.801];
export const DEFAULT_ZOOM = 16;
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
  schedules: VenueSchedule[];
  players: MapPlayer[];
  you: { lat: number; lng: number; name: string; accuracy: number | null } | null;
  focus: MapFocus | null;
  onSelectVenue(venueId: string): void;
  /** Overlay controls (legend, recentre) drawn over the map. */
  children?: ReactNode;
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

/** The Leaflet map with its markers. All markers are divIcons (see markers.ts). */
export function MapView({ schedules, players, you, focus, onSelectVenue, children }: MapViewProps) {
  const [tilesDown, setTilesDown] = useState(false);
  const tiles = useRef({ loaded: 0, failed: 0 });

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
        center={FESTIVAL_CENTRE}
        zoom={DEFAULT_ZOOM}
        minZoom={13}
        maxZoom={19}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors · Schedule: <a href="https://lancastermusicfestival.com/" target="_blank" rel="noreferrer">Lancaster Music Festival</a>'
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
            pathOptions={{ color: '#e1251b', weight: 2, opacity: 0.7, fillColor: '#e1251b', fillOpacity: 0.1, className: 'fqaccuracy' }}
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
