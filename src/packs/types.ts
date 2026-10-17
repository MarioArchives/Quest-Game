// The look half of a game pack (the rules half is functions/src/shared/packs). Each pack folder
// src/packs/<id>/ has brand.ts (plain data, read by vite.config.ts), theme.css (token overrides and fonts),
// index.tsx (a PackLook, default export) and public/ (files served at the site root).
import type { ComponentType, LazyExoticComponent } from 'react';
import type { TabId } from '../lib/nav';

/** Plain colours for the manifest and the pre-boot page; no imports, so vite.config.ts can read it. */
export interface PackBrand {
  /** <meta name="theme-color"> and the manifest theme_color (the browser chrome). */
  themeColor: string;
  /** The manifest background_color and the page background before the bundle boots. */
  backgroundColor: string;
  /** Tab labels the pack words its own way ("Board", "My file"); the others keep the engine's. */
  tabs?: Partial<Record<TabId, string>>;
  /** Tab icons the pack draws its own way, by Icon name (the mystery Board's 'search'); the others keep the engine's. */
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

export interface PackLook {
  /**
   * The loading mark, drawn inside a 64x64 viewBox: a `<g className="loader__plate">` of filled shapes and a
   * `<g className="loader__ink">` of path tiers `loader__tier loader__tier--1..5` (see Loader.css).
   */
  LoaderArt: ComponentType;
  auth: AuthCopy;
  /**
   * Screens the pack replaces, loaded lazily; without them the engine's Home, Account and player pass are used.
   * `player` is another player's pass, at `/player/:uid` (it reads the uid from the route).
   */
  screens?: {
    home?: LazyExoticComponent<ComponentType>;
    account?: LazyExoticComponent<ComponentType>;
    player?: LazyExoticComponent<ComponentType>;
    /** The GM console at `/gm` (still behind the admin guard); without it the engine's GMConsole is used. */
    gm?: LazyExoticComponent<ComponentType>;
    /** The signed-out screen; its buttons come from the engine's `useSignIn`. Without it the poster sign-in is used. */
    signIn?: LazyExoticComponent<ComponentType>;
  };
  /** The reward pop-up's words; the engine has plain defaults. */
  reward?: RewardCopy;
  /** The words on the router's error page (a crash or a failed chunk load); the engine has plain defaults. */
  error?: { title: string; body: string; /** The label of the link back to the home screen (default "Back home"). */ home?: string };
}
