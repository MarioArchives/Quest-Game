// A game pack: everything that makes one game different from another while the engine stays the same.
// This is the rules half (wording, features, catalogue, defaults), shared by the functions, the app and the
// scripts. The look half (theme, art, long copy, public files) lives in src/packs/<id>/.
import type { AwardKey, Settings, Venue } from '../types.ts';

/** A noun as the game says it, lower case unless it is an acronym ("GM"). Plurals are spelled out. */
export interface Noun {
  one: string;
  many: string;
}

export const TERM_KEYS = ['quest', 'sideQuest', 'witness', 'claim', 'gm', 'wrap'] as const;
export type TermKey = (typeof TERM_KEYS)[number];
export type Terms = Record<TermKey, Noun>;

/** Optional parts of the game. Witnessed claims, the feed, the GM and the wrap are always on. */
export const FEATURES = ['guesses', 'sideQuests', 'map'] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

export interface AwardCopy {
  title: string;
  description: string;
}

/** One quest in a pack's catalogue (quests.json). Ids start `p-` (personal) or `g-` (side quest). */
export interface CatalogueQuest {
  id: string;
  title: string;
  description: string;
  /** Personal only: points for completing it; missing → settings.questPoints. */
  points?: number | null;
  /** Side quests only: minutes open; missing → settings.globalWindowMin. */
  windowMin?: number | null;
}

export interface Catalogue {
  personal: CatalogueQuest[];
  global: CatalogueQuest[];
}

/** Where the map opens and what "nearby" means. Only for packs with the map feature. */
export interface MapConfig {
  centre: { lat: number; lng: number };
  zoom: number;
  /** How the app names the place: "You're 3 km from the festival". */
  placeName: string;
  /** Within this many km of the centre a player counts as there. */
  nearbyKm: number;
  /** Who the venue and schedule data belongs to, credited on the map; null when it is the pack's own. */
  credit: { label: string; url: string } | null;
}

export interface GamePack {
  /** Lower-case, path-safe: `lancaster`, `starter`. */
  id: string;
  /** The game's name: page title, manifest, push fallback title. */
  name: string;
  /** One line for the manifest and the page description. */
  description: string;
  terms: Terms;
  features: Features;
  /** IANA zone used for quiet hours and every time the app shows. */
  timeZone: string;
  /** BCP 47 locale for dates and times. */
  locale: string;
  /** Default scoring rule-set id (settings.scoring falls back to it). */
  scoring: string;
  /** Overrides on top of the engine's DEFAULT_SETTINGS. */
  settings: Partial<Settings>;
  /** Award titles and descriptions that replace the engine's. */
  awards: Partial<Record<AwardKey, AwardCopy>>;
  catalogue: Catalogue;
  /** Map setup; null when the pack has no map. */
  map: MapConfig | null;
  /** Venues for the map, its schedule and the venue award; may be empty (the map then shows just the players). */
  venues: Venue[];
}
