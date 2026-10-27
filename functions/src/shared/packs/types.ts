// A game pack: everything that makes one game different from another while the engine stays the same.
// This is the rules half (wording, features, catalogue, defaults), shared by the functions, the app and the
// scripts. The look half (theme, art, long copy, public files) lives in src/packs/<id>/.
import type { ChatLineKey, VoiceLineKey } from '../phone.ts';
import type { AwardKey, Settings, StoryEntry, Venue } from '../types.ts';

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

/** Packs with police: how the police sound on a phone call (settings.policePhone). */
/** One wording, or variants: a call picks one (the same one again on a retry). */
export type LineText = string | readonly string[];

/** An officer who makes the calls ({officer} in a line); `telegramVoice` is their edge-tts voice on the Telegram line. */
export interface Officer {
  name: string;
  telegramVoice?: string;
}

export interface PoliceVoice {
  /** Twilio's <Say> voice and language; default Polly.Brian in en-GB. */
  voice?: { voice: string; language: string };
  /**
   * Lines reworded for the pack: {caller} (settings.policeCallerName), {name} (the player's first name), {check} (a
   * police check-in), {officer} (the call's officer), and {question} / {accusation} where a line has them.
   */
  lines?: Partial<Record<VoiceLineKey, LineText>>;
  /** The lines said instead on a line answered in the chat (Telegram): asking for a reply rather than a key press. */
  chatLines?: Partial<Record<ChatLineKey, LineText>>;
  /** Who makes the calls; one is picked per call. */
  officers?: Officer[];
  /** Lines the GM recorded as src/packs/<id>/public/audio/police/<line>.mp3, played instead of read out (one wording, no {officer}). */
  recordings?: VoiceLineKey[];
}

/** One relation a player can say they had to the story's victim at the booking desk. */
export interface RelationChoice {
  /** Stored on the player's particulars; kebab-case. */
  id: string;
  /** The chip's word ("Best friend"). */
  label: string;
  /** How the police say it ("Bob's best friend"). */
  phrase: string;
}

/** What the police may ask on a check-in (GamePack.policeQuiz); `weight` (1–10, default 1) makes one likelier. */
export type PoliceQuizItem = { weight?: number } & (
  | { kind: 'sum' }
  /** A fixed question: the answer and its decoys. */
  | { kind: 'fixed'; ask: string; answer: string; decoys: string[] }
  /** facts/{fact}: its value (decoys a list, or 'times' near a time), or one of its winning entries (decoys the others). */
  | { kind: 'fact'; fact: string; ask: string; decoys?: string[] | 'times' }
  /** The playing player with the lowest or highest points (no tie). */
  | { kind: 'standing'; pick: 'lowest' | 'highest'; ask: string }
  /** The latest revealed stop that has started; decoys are other bars (never the route's own). */
  | { kind: 'stop'; ask: string; decoys: string[] }
  /** How many persons of interest there are (a typed number). */
  | { kind: 'watch-count'; ask: string }
  /** Something the player gave at the booking desk. */
  | { kind: 'own'; field: 'relation' | 'height'; ask: string }
  /** The one other player who gave this relation ({value}: its phrase). */
  | { kind: 'whose'; field: 'relation'; ask: string }
);

/** A noun as the game says it, lower case unless it is an acronym ("GM"). Plurals are spelled out. */
export interface Noun {
  one: string;
  many: string;
}

export const TERM_KEYS = ['quest', 'sideQuest', 'witness', 'claim', 'gm', 'wrap'] as const;
export type TermKey = (typeof TERM_KEYS)[number];
/**
 * The required nouns, plus optional ones with engine defaults: what packs with checkins call one (default
 * "check-in"), the two standings (default "trusted confidant" and "person of interest") a police check-in and the feed (default "feed"; a pack may call it a "log book").
 */
export type Terms = Record<TermKey, Noun> & { checkin?: Noun; confidant?: Noun; poi?: Noun; policeCall?: Noun; feed?: Noun };

/** Optional parts of the game. Witnessed claims, the feed, the GM and the wrap are always on. */
export const FEATURES = ['guesses', 'sideQuests', 'map'] as const;
export type Feature = (typeof FEATURES)[number];

/** Extra parts only some packs use; off unless a pack turns them on. */
export const EXTRA_FEATURES = ['rewardChoice', 'characters', 'stops', 'checkins', 'police'] as const;
export type ExtraFeature = (typeof EXTRA_FEATURES)[number];

/**
 * The core three are always set; the extras are optional and default to off:
 * - rewardChoice: completing a personal quest earns a choice: points to yourself, or framing another player (anonymous)
 * - characters: each player has a character (public) and a secret motive, set by the GM
 * - stops: the GM sets a route of stops (name, place, optional arrival and leave times) and reveals them one by one; the map shows them in order with a now/next strip
 * - checkins: periodic missions everyone answers with a photo or a comment
 * - police: police check-ins answered in the app, for persons of interest and on a trusted confidant's tip
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

/**
 * A story mission (catalogue.story): a side quest the GM fires in the pack's order, judged by a vote or by
 * submission. Ids start `s-`. Anything left out falls back to the settings when it is fired.
 */
export interface StoryQuest {
  id: string;
  title: string;
  description: string;
  /** How it is judged unless the GM picks otherwise when firing it. Required for missions; announcements have none. */
  judging?: 'vote' | 'submit';
  /** Missing = 'mission'. An announcement takes no entries: firing it posts its description as a story beat. */
  kind?: 'mission' | 'announce';
  /** Open alongside the other missions until its deadline (a window up to 720 min); its vote opens when the GM opens it or an announcement names it. */
  longRun?: boolean;
  /** What an entry must be (media, a required caption, a player it names). */
  entry?: StoryEntry;
  /** Points for every vote an entry gets; missing = none. */
  votePoints?: number | null;
  /** What each of several tied top entries gets; missing = the full points. */
  tieBonus?: number | null;
  /** Missions judged by a vote: the question the vote asks ("What killed Bob?"), copied onto the side quest; missing = the title. */
  question?: string;
  /** When it closes, its winning entries are recorded as this fact (facts/{key}). */
  records?: { key: string; label: string };
  /** Announcements: the fact recorded when it fires. */
  fact?: { key: string; label: string; value: string };
  /** Announcements: the story mission (an id in this story) whose vote it opens. */
  opensVoteOn?: string;
  /** Minutes open; missing → settings.globalWindowMin. */
  windowMin?: number | null;
  /** Vote: to the winner; submit: to everyone who enters. Missing → settings.sideQuestPoints. */
  points?: number | null;
  /** Extra for the fastest entry; missing → 0. */
  fastestBonus?: number | null;
  /** Fine for not entering; missing → settings.sideQuestSkipPenalty. */
  penalty?: number | null;
}

export interface Catalogue {
  personal: CatalogueQuest[];
  global: CatalogueQuest[];
  /** Story missions, in the order the GM fires them (packs with side quests). */
  story?: StoryQuest[];
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
  /**
   * Packs with stops: the area the GM's bar search covers besides the few km round the last stop, e.g. a whole city,
   * as a box in degrees. `name` is how the search names it ("Bars in Manchester").
   */
  barSearch?: { name: string; south: number; west: number; north: number; east: number };
}

export interface GamePack {
  /** The booking desk's choices: the relations to the victim a player can give. */
  booking?: { relations?: RelationChoice[] };
  /** What the police may ask on a check-in; without it, a sum. */
  policeQuiz?: PoliceQuizItem[];
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
  /** Packs with police: the voice on phone calls (engine wording and a Polly voice when left out). */
  policeVoice?: PoliceVoice;
  /** The only pushes this pack sends (see push.ts `pushAllowed`); missing = every kind. */
  pushKinds?: PushKind[];
  /** What players put on feed posts: emoji (default) or one Credible / Doubtful vote each, with a top entry. */
  reactions?: 'emoji' | 'votes';
}

/** Every kind of push the game can send: the feed-driven ones (standing split into gained and lost) and the rest. */
export type PushKind =
  | 'global-open'
  | 'checkin-open'
  | 'checking'
  | 'voting-open'
  | 'global-won'
  | 'global-scored'
  | 'standing-gained'
  | 'standing-lost'
  | 'police-call'
  | 'police-tip'
  | 'police-line'
  | 'announcement'
  | 'stop-revealed'
  | 'status'
  | 'approved'
  | 'rejected'
  | 'fraud'
  | 'exposed'
  | 'framed'
  | 'adjust'
  | 'story-beat'
  | 'witness'
  | 'witness-left'
  | 'entry-rejected'
  | 'join';
