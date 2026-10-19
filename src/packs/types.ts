// The look half of a game pack (the rules half is functions/src/shared/packs). Each pack folder
// src/packs/<id>/ has brand.ts (plain data, read by vite.config.ts), theme.css (token overrides and fonts),
// index.tsx (a PackLook, default export) and public/ (files served at the site root).
import type { ComponentType, LazyExoticComponent } from 'react';
import type { TabId } from '../lib/nav';
import type { Doc, Player } from '../shared';

/** One filled shape on a loading mark's print plate, in the 64x64 viewBox. */
export interface MarkShape {
  shape: 'path' | 'rect' | 'ellipse' | 'circle';
  /** The plate ink it prints in: 1 the plate's own colour (the default), 2 or 3 `--loader-plate-2` / `-3`. */
  ink?: 1 | 2 | 3;
  /** Its SVG geometry: d, or x, y, width, height, or cx, cy, rx, ry, r. */
  attrs: Record<string, string | number>;
}

/**
 * A pack's loading mark as plain data (src/packs/<id>/mark.ts), so the app's LoaderArt (`markArt(mark)`) and the
 * pre-boot figure in index.html (`brand.boot`) draw the same shapes. See PackLook.LoaderArt for how it animates.
 */
export interface LoaderMark {
  /** The plate's filled shapes, printed together. */
  plate: MarkShape[];
  /** The ink line's tiers, drawn in order (Loader.css animates five); each tier's paths draw together. */
  tiers: string[][];
  /** The ink line's width in viewBox units. */
  strokeWidth: number;
}

/**
 * The loading figure index.html shows before the bundle boots: the Gate's full-screen loader drawn from the pack's
 * mark, in the colours its theme.css gives `.loader` (a test checks they match). Hex colours, as for the manifest.
 */
export interface BootMark {
  mark: LoaderMark;
  /** The ink line (`--loader-line`). */
  line: string;
  /** The plate (`--loader-plate`) and its optional second and third inks (`--loader-plate-2` / `-3`). */
  plate: string;
  plate2?: string;
  plate3?: string;
  /** The plate's off-register nudge in px (`--loader-offset-x` / `-y`); Loader.css's (1.6, 1.4) when unset. */
  offset?: { x: number; y: number };
  /** The caption under it, the pack's name: the full-screen loader's text colour. */
  text: string;
}

/** Plain colours for the manifest and the pre-boot page; plain data only, so vite.config.ts can read it. */
export interface PackBrand {
  /** <meta name="theme-color"> and the manifest theme_color (the browser chrome). */
  themeColor: string;
  /** The manifest background_color and the page background before the bundle boots. */
  backgroundColor: string;
  /** The loading figure on that page before the bundle boots; without it the page is just the background colour. */
  boot?: BootMark;
  /** Tab labels the pack words its own way ("Missions", "My file"); the others keep the engine's. */
  tabs?: Partial<Record<TabId, string>>;
  /** Tab icons the pack draws its own way, by Icon name (the mystery pack's 'folder'); the others keep the engine's. */
  tabIcons?: Partial<Record<TabId, string>>;
  /** Player icons without a photo: the initial (default) or a silhouette, on a tint per player from `tints`. */
  avatar?: { placeholder: 'initial' | 'silhouette'; tints: string[] };
}

/** The sign-in family of screens: words that belong to the game, not the engine. */
export interface AuthCopy {
  /** Small line above the title on the poster masthead. */
  posterLine: string;
  /** The title, one entry per line (the compact masthead joins them with a space). */
  posterTitle: string[];
  /** The sticker on the masthead of sign-in and sign-up. */
  sticker: string;
  /** The sign-in pitch. */
  lead: string;
  /** The heading of the "who are you" card on the sign-up screen. */
  signUpTitle: string;
  /** Sentence on the waiting screen. */
  waitingText: string;
  /** Sentence on the rejected screen. */
  rejectedText: string;
}

/** The reward choice pop-up's words (packs with rewardChoice). */
export interface RewardCopy {
  /** Step one's header, e.g. "Evidence secured". */
  title: string;
  /** The two choices: points to yourself, and points off a player you pick. */
  clean: string;
  frame: string;
  /** Step two's header, e.g. "Frame who?". */
  pickTitle: string;
}

/** What the reward pop-up hands a pack's frame picker (`rewardFrame.picker`). */
export interface FramePickerProps {
  /** Who can be framed: every other player still playing, highest score first. */
  targets: ReadonlyArray<Doc<Player>>;
  /** True while a frame is being sent (the pop-up can't be closed meanwhile). */
  busy: boolean;
  /**
   * Frames this player and resolves with the points it took off them (negative); the pop-up then stays open on the
   * picker, to show the result, until `close`. On a failure the engine shows the error and it resolves with null.
   */
  frame(target: Doc<Player>): Promise<number | null>;
  /** Back to the two choices. */
  back(): void;
  /** Closes the pop-up; an unused reward stays pending. */
  close(): void;
}

/** What the reward pop-up hands a pack's hint under the two choices (`rewardFrame.hint`). */
export interface FrameHintProps {
  /** Who can be framed, as for the picker. */
  targets: ReadonlyArray<Doc<Player>>;
  /** True while the reward is being used (the pop-up can't be closed meanwhile). */
  busy: boolean;
  /** Closes the pop-up with the reward still pending, to use later. */
  close(): void;
}

/** What the Gate hands a pack's join screen. */
export interface JoinScreenProps {
  /** Editing a request already sent: go back to waiting without changing it. */
  onCancel?(): void;
}

export interface PackLook {
  /**
   * The loading mark, drawn inside a 64x64 viewBox: a `<g className="loader__plate">` of filled shapes and a
   * `<g className="loader__ink">` of path tiers `loader__tier loader__tier--1..5` (see Loader.css). A tier may be
   * several paths; each with `pathLength={1}` draws across the tier's whole slot. Plate shapes may take
   * `loader__plate--2` / `--3` to print in `--loader-plate-2` / `-3` (the plate's colour unless the pack sets them).
   * The plate lands off-register by `--loader-offset-x` / `-y` (1.6px, 1.4px unless the pack sets them).
   * Draw it from the pack's mark data with `markArt(mark)` (components/MarkArt.tsx), the same data as `brand.boot`.
   */
  LoaderArt: ComponentType;
  auth: AuthCopy;
  /**
   * Screens the pack replaces, loaded lazily; without them the engine's Home, Account and player pass are used.
   * `player` is another player's pass, at `/player/:uid` (it reads the uid from the route). `join`, `waiting` and
   * `rejected` may be one component (the Gate renders them in the same place, so it keeps its state as the request
   * moves on).
   */
  screens?: {
    home?: LazyExoticComponent<ComponentType>;
    /**
     * A second home-like screen at `/feed`, on its own bottom tab after Home (`brand.tabs.feed`, default "Feed"). The
     * new-posts dot moves to it, and Home's dot then lights while a side quest or a check-in needs you.
     */
    feed?: LazyExoticComponent<ComponentType>;
    /**
     * Packs with the map: the map hosted inside a pack screen of its own, shown at `/map` (it renders the engine's
     * `MapScreen`, which fills the room the frame gives it there). The Map bottom tab goes, Home stays lit on `/map`, and
     * the frame keeps the pack's name as the title.
     */
    map?: LazyExoticComponent<ComponentType>;
    account?: LazyExoticComponent<ComponentType>;
    player?: LazyExoticComponent<ComponentType>;
    /** The GM console at `/gm` (still behind the admin guard); without it the engine's GMConsole is used. */
    gm?: LazyExoticComponent<ComponentType>;
    /** The signed-out screen; its buttons come from the engine's `useSignIn`. Without it the poster sign-in is used. */
    signIn?: LazyExoticComponent<ComponentType>;
    /**
     * Signed in, not in the game yet: asking to join (no join request yet, or editing it; `onCancel` while editing).
     * It sends the request with `requestJoin`. Without it the engine's sign-up form.
     */
    join?: LazyExoticComponent<ComponentType<JoinScreenProps>>;
    /** The join request is with the GM; the Gate moves on by itself once they approve. Without it the engine's waiting screen. */
    waiting?: LazyExoticComponent<ComponentType>;
    /** The GM turned the join request down. Without it the engine's "Not this time". */
    rejected?: LazyExoticComponent<ComponentType>;
    /**
     * Once approved, before the game: shown to a player who still needs booking in (`needsBooking`: `bookedAt` null)
     * until it calls `bookIn`. Packs without one go straight to the game; GMs always do.
     */
    onboarding?: LazyExoticComponent<ComponentType>;
  };
  /** The reward pop-up's words; the engine has plain defaults. */
  reward?: RewardCopy;
  /**
   * The reward pop-up's Frame step drawn by the pack, loaded lazily: `picker` replaces the engine's grid of players
   * (framed with one tap) from step two on, and `hint` goes under the two choices on step one.
   */
  rewardFrame?: {
    picker: LazyExoticComponent<ComponentType<FramePickerProps>>;
    hint?: LazyExoticComponent<ComponentType<FrameHintProps>>;
  };
  /** The words on the router's error page (a crash or a failed chunk load); the engine has plain defaults. */
  error?: { title: string; body: string; /** The label of the link back to the home screen (default "Back home"). */ home?: string };
}
