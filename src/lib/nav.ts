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
