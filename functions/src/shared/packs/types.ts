// A game pack: everything that makes one game different from another while the engine stays the same.
// This is the rules half (wording, features, catalogue, defaults), shared by the functions, the app and the
// scripts. The look half (theme, art, long copy, public files) lives in src/packs/<id>/.
import type { AwardKey, Settings, Venue } from '../types.ts';

/** A periodic mission a pack starts with: a path-safe id and what the GM would set on it. */
export interface PeriodicSeed {
  id: string;
  name: string;
  prompts: string[];
  intervalMin: number;
  windowMin: number;
  penalty: number;
  count: number;
}

/** A noun as the game says it, lower case unless it is an acronym ("GM"). Plurals are spelled out. */
export interface Noun {
  one: string;
  many: string;
}

export const TERM_KEYS = ['quest', 'sideQuest', 'witness', 'claim', 'gm', 'wrap'] as const;
export type TermKey = (typeof TERM_KEYS)[number];
/** The required nouns, plus what packs with checkins call one (default "check-in"). */
export type Terms = Record<TermKey, Noun> & { checkin?: Noun };

/** Optional parts of the game. Witnessed claims, the feed, the GM and the wrap are always on. */
export const FEATURES = ['guesses', 'sideQuests', 'map'] as const;
export type Feature = (typeof FEATURES)[number];

/** Extra parts only some packs use; off unless a pack turns them on. */
export const EXTRA_FEATURES = ['rewardChoice', 'characters', 'stops', 'checkins'] as const;
export type ExtraFeature = (typeof EXTRA_FEATURES)[number];

/**
 * The core three are always set; the extras are optional and default to off:
 * - rewardChoice: completing a personal quest earns a choice: points to yourself, or framing another player (anonymous)
 * - characters: each player has a character (public) and a secret motive, set by the GM
 * - stops: the GM sets a route of stops (name, place, optional arrival and leave times) and reveals them one by one; the map shows them in order with a now/next strip
 */
export type Features = Record<Feature, boolean> & Partial<Record<ExtraFeature, boolean>>;

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
  /** Packs with stops: how the route is drawn between stops. Default 'line' (a dashed line). */
  routeStyle?: 'line' | 'footprints';
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
  /** Packs with characters: characters and motives for the demo players (mock and seed), in demo order. */
  demoCharacters?: Array<{ name: string; role: string; motive: string }>;
  /**
   * Packs with stops: the starting route, in order. A real seed writes these as hidden stops (`route-1`..) the GM can
   * edit, reorder and reveal; the demo reveals the first three and gives them times. A stop that is a real bar can
   * carry its address (for Google Maps directions) and where it came from ("osm:node/123").
   */
  route?: Array<{ name: string; lat: number; lng: number; address?: string; placeRef?: string }>;
  /** Points the GM's one-tap −/+ buttons move (default 10): small for packs that score in small steps. */
  gmQuickPoints?: number;
  /** Packs with checkins: the periodic missions a seed starts the GM with (created once; the GM edits them after). */
  periodics?: PeriodicSeed[];
}
