// Which tabs and GM sections the app offers, given the pack's features.
import type { Features } from '../../functions/src/shared/packs/types.ts';

export type TabId = 'home' | 'feed' | 'map' | 'account' | 'gm' | 'wrap';
export type GmSectionId = 'game' | 'joins' | 'review' | 'quests' | 'story' | 'periodics' | 'police' | 'players' | 'guesses' | 'templates' | 'settings';

/**
 * Bottom tabs in order: Home, Feed (a pack with its own feed screen), Map (map feature, unless the pack hosts the map
 * in a screen of its own), Account, GM (admins), Wrap (once the game has ended).
 */
export function tabsFor(opts: { features: Features; isAdmin: boolean; ended: boolean; feed?: boolean; ownMap?: boolean }): TabId[] {
  const tabs: TabId[] = ['home'];
  if (opts.feed) tabs.push('feed');
  if (opts.features.map && !opts.ownMap) tabs.push('map');
  tabs.push('account');
  if (opts.isAdmin) tabs.push('gm');
  if (opts.ended) tabs.push('wrap');
  return tabs;
}

/**
 * GM console sections in order; 'quests' (side quests) needs sideQuests, 'story' needs side quests and a story list
 * (`opts.story`), 'periodics' checkins, 'police' police and 'guesses' guesses.
 */
export function gmSectionsFor(features: Features, opts: { story?: boolean } = {}): GmSectionId[] {
  const all: GmSectionId[] = ['game', 'joins', 'review', 'quests', 'story', 'periodics', 'police', 'players', 'guesses', 'templates', 'settings'];
  return all.filter(
    (id) =>
      (id !== 'quests' || features.sideQuests) &&
      (id !== 'story' || (features.sideQuests && Boolean(opts.story))) &&
      (id !== 'periodics' || Boolean(features.checkins)) &&
      (id !== 'police' || Boolean(features.police)) &&
      (id !== 'guesses' || features.guesses),
  );
}

/** The tab labels: the pack's own where it gives them, else Home, Feed, Map, Account, the GM term and the wrap term. */
export function tabLabels(
  overrides: Partial<Record<TabId, string>> | undefined,
  terms: { gm: string; wrap: string },
): Record<TabId, string> {
  const defaults: Record<TabId, string> = { home: 'Home', feed: 'Feed', map: 'Map', account: 'Account', gm: terms.gm, wrap: terms.wrap };
  for (const id of Object.keys(defaults) as TabId[]) {
    const own = overrides?.[id]?.trim();
    if (own) defaults[id] = own;
  }
  return defaults;
}

/**
 * The bottom tab lit on a path: each tab's own screen, and Home on /map when the pack hosts the map in its Home
 * screen (`ownMap`). Null elsewhere (a player's page, standings, join).
 */
export function litTab(pathname: string, ownMap = false): TabId | null {
  switch (pathname) {
    case '/':
      return 'home';
    case '/feed':
      return 'feed';
    case '/map':
      return ownMap ? 'home' : 'map';
    case '/account':
      return 'account';
    case '/gm':
      return 'gm';
    case '/wrap':
      return 'wrap';
    default:
      return null;
  }
}

/** The tab a swipe leads to: a finger moving left (dx < 0) goes on, right goes back; nowhere past either end. */
export function swipeTab(tabs: readonly TabId[], lit: TabId | null, dx: number): TabId | null {
  const at = lit === null ? -1 : tabs.indexOf(lit);
  if (at < 0 || dx === 0) return null;
  return tabs[dx < 0 ? at + 1 : at - 1] ?? null;
}

/** Whether a touch was a quick, mostly sideways flick (not a scroll or a slow drag). */
export function isTabSwipe({ dx, dy, ms }: { dx: number; dy: number; ms: number }): boolean {
  return Math.abs(dx) >= 60 && Math.abs(dx) >= 2 * Math.abs(dy) && ms <= 700;
}

/** One element from where a gesture started up to the screen, as plain data. */
export interface SwipeNode {
  ownSwipe: boolean;
  scrollsX: boolean;
  field: boolean;
  slider: boolean;
  dialog: boolean;
}

/** A gesture that starts in something that uses sideways movement itself is not ours to take. */
export function swipeBlocked(chain: readonly SwipeNode[]): boolean {
  return chain.some((n) => n.ownSwipe || n.scrollsX || n.field || n.slider || n.dialog);
}
