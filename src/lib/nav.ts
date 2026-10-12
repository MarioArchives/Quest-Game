// Which tabs and GM sections the app offers, given the pack's features.
import type { Features } from '../../functions/src/shared/packs/types.ts';

export type TabId = 'home' | 'map' | 'account' | 'gm' | 'wrap';
export type GmSectionId = 'game' | 'joins' | 'review' | 'quests' | 'players' | 'guesses' | 'templates' | 'settings';

/** Bottom tabs in order: Home, Map (map feature), Account, GM (admins), Wrap (once the game has ended). */
export function tabsFor(opts: { features: Features; isAdmin: boolean; ended: boolean }): TabId[] {
  const tabs: TabId[] = ['home'];
  if (opts.features.map) tabs.push('map');
  tabs.push('account');
  if (opts.isAdmin) tabs.push('gm');
  if (opts.ended) tabs.push('wrap');
  return tabs;
}

/** GM console sections in order; 'quests' (side quests) needs sideQuests and 'guesses' needs guesses. */
export function gmSectionsFor(features: Features): GmSectionId[] {
  const all: GmSectionId[] = ['game', 'joins', 'review', 'quests', 'players', 'guesses', 'templates', 'settings'];
  return all.filter((id) => (id !== 'quests' || features.sideQuests) && (id !== 'guesses' || features.guesses));
}
