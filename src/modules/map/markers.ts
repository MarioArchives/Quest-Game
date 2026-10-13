import { divIcon, type DivIcon } from 'leaflet';
import type { VenueStatus } from './schedule';

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
export const Z = { feet: -300, none: -100, later: 0, soon: 100, now: 200, stop: 300, player: 500, you: 600 } as const;

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

export type StopState = 'now' | 'next' | 'later' | 'past' | 'hidden';

const STOP_STATE_TEXT: Record<StopState, string> = { now: 'here now', next: 'next', later: 'later', past: 'done', hidden: 'hidden from players' };

/** Route stop: a numbered square with the name beside it. Red = the group is there now, ink = next, white = later, grey = done, dashed ghost = hidden from players (GM view). */
export function stopIcon(number: number, name: string, state: StopState): DivIcon {
  return cached(`s:${number}:${state}:${name}`, () =>
    divIcon({
      className: `fqpin fqpin--stop fqpin--stop-${state}`,
      html: `<span class="fqstopno">${number}</span><span class="fqpin__label">${esc(name)}</span><span class="visually-hidden">Stop ${number}, ${esc(name)}, ${STOP_STATE_TEXT[state]}</span>`,
      iconSize: [PIN, PIN],
      iconAnchor: [PIN / 2, PIN / 2],
    }),
  );
}

/** The pin being placed or moved, before it is saved. */
export function draftIcon(): DivIcon {
  return cached('draft', () =>
    divIcon({
      className: 'fqpin fqpin--stop fqpin--stop-draft',
      html: '<span class="fqstopno">+</span><span class="visually-hidden">New stop</span>',
      iconSize: [PIN, PIN],
      iconAnchor: [PIN / 2, PIN / 2],
    }),
  );
}

const FOOT_H = 14;
const FOOT_W = 9;

/** A shoe print (sole and heel) pointing up; the left foot is mirrored. Filled by CSS (`.fqfoot`), so it follows the theme. */
const FOOT_SVG =
  '<svg viewBox="0 0 9 14" width="9" height="14" aria-hidden="true" focusable="false">' +
  '<path d="M4.5 0C6.9 0 8 1.9 8 4.4 8 6.7 7.2 8.2 4.5 8.2S1 6.7 1 4.4C1 1.9 2.1 0 4.5 0z"/>' +
  '<ellipse cx="4.5" cy="11.2" rx="2.2" ry="2.6"/></svg>';

/** One footprint, turned to the walking direction (rounded to 5 degrees so icons are shared). `ghost` = a leg to a hidden stop. */
export function footprintIcon(bearing: number, side: 'left' | 'right', ghost: boolean): DivIcon {
  const deg = (Math.round(bearing / 5) * 5) % 360;
  return cached(`f:${deg}:${side}:${ghost}`, () =>
    divIcon({
      className: `fqfoot${ghost ? ' fqfoot--ghost' : ''}`,
      html: `<span class="fqfoot__turn" style="transform:rotate(${deg}deg)"><span class="fqfoot__flip" style="transform:scaleX(${side === 'left' ? -1 : 1})">${FOOT_SVG}</span></span>`,
      iconSize: [FOOT_W, FOOT_H],
      iconAnchor: [FOOT_W / 2, FOOT_H / 2],
    }),
  );
}
