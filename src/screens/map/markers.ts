import { divIcon, type DivIcon } from 'leaflet';
import type { VenueStatus } from '../../lib/schedule';

// Leaflet's default marker images do not survive the Vite build, so every marker is a divIcon
// (plain HTML styled in map.css). Icons are cached by what they look like, so re-renders hand
// react-leaflet the same object and no marker is rebuilt needlessly.

const cache = new Map<string, DivIcon>();

function cached(key: string, make: () => DivIcon): DivIcon {
  let icon = cache.get(key);
  if (!icon) {
    icon = make();
    cache.set(key, icon);
  }
  return icon;
}

/** Escape text for HTML content and attribute values. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Z-offsets keep busier things on top: venues < players < you. */
export const Z = { none: -100, later: 0, soon: 100, now: 200, player: 500, you: 600 } as const;

const PIN = 30; // hit area (px); the visible square is smaller

const STATUS_TEXT: Record<VenueStatus, string> = {
  now: 'music on now',
  soon: 'music starting soon',
  later: 'music later',
  none: 'nothing more scheduled',
};

/** Venue pin by status: now = red filled square, soon = ink filled, later = white with ink border, none = small grey. */
export function venueIcon(status: VenueStatus, name: string): DivIcon {
  // Only "now" pins carry a visible name label (shown when zoomed in). The hidden text names every pin for screen readers.
  const label = status === 'now' ? `<span class="fqpin__label">${esc(name)}</span>` : '';
  return cached(`v:${status}:${name}`, () =>
    divIcon({
      className: `fqpin fqpin--${status}`,
      html: `<span class="fqpin__sq"></span>${label}<span class="visually-hidden">${esc(name)}, ${STATUS_TEXT[status]}</span>`,
      iconSize: [PIN, PIN],
      iconAnchor: [PIN / 2, PIN / 2],
    }),
  );
}

const AVATAR = 36;

/** A player's avatar circle with "NAME · 2 MIN" beside it. The initial sits behind the photo as the fallback. */
export function playerIcon(name: string, photoURL: string | null, ago: string): DivIcon {
  const initial = esc((name.trim()[0] ?? '?').toUpperCase());
  const first = esc(name.trim().split(/\s+/)[0] ?? name);
  const img = photoURL
    ? `<img src="${esc(photoURL)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return cached(`p:${name}|${photoURL ?? ''}|${ago}`, () =>
    divIcon({
      className: 'fqpin fqpin--player',
      html: `<span class="fqpin__avatar">${initial}${img}</span><span class="fqpin__label">${first} · ${esc(ago)}</span>`,
      iconSize: [AVATAR, AVATAR],
      iconAnchor: [AVATAR / 2, AVATAR / 2],
    }),
  );
}

/** The signed-in player's own position: a red disc with a halo and a YOU tag. */
export function youIcon(name: string): DivIcon {
  const initial = esc((name.trim()[0] ?? '?').toUpperCase());
  return cached(`you:${name}`, () =>
    divIcon({
      className: 'fqpin fqpin--you',
      html: `<span class="fqpin__halo"></span><span class="fqpin__avatar">${initial}</span><span class="fqpin__label fqpin__label--below">You</span>`,
      iconSize: [AVATAR, AVATAR],
      iconAnchor: [AVATAR / 2, AVATAR / 2],
    }),
  );
}
