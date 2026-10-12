// Engine plan edge cases 9-11 (app side): tabs and GM sections follow the pack's features.
import { describe, expect, it } from 'vitest';
import { gmSectionsFor, tabsFor } from './nav';

const ALL_ON = { guesses: true, sideQuests: true, map: true };

describe('tabsFor', () => {
  it('Home, Map, Account for a player while the game runs', () => {
    expect(tabsFor({ features: ALL_ON, isAdmin: false, ended: false })).toEqual(['home', 'map', 'account']);
  });

  it('adds GM for admins and Wrap once the game has ended, in that order', () => {
    expect(tabsFor({ features: ALL_ON, isAdmin: true, ended: true })).toEqual(['home', 'map', 'account', 'gm', 'wrap']);
    expect(tabsFor({ features: ALL_ON, isAdmin: false, ended: true })).toEqual(['home', 'map', 'account', 'wrap']);
  });

  it('has no Map tab when the map is off (E11)', () => {
    expect(tabsFor({ features: { ...ALL_ON, map: false }, isAdmin: true, ended: false })).toEqual(['home', 'account', 'gm']);
  });

  it('guesses and side quests do not change the tabs', () => {
    expect(tabsFor({ features: { guesses: false, sideQuests: false, map: true }, isAdmin: false, ended: false })).toEqual([
      'home',
      'map',
      'account',
    ]);
  });
});

describe('gmSectionsFor', () => {
  it('every section with everything on, in the console order', () => {
    expect(gmSectionsFor(ALL_ON)).toEqual(['game', 'joins', 'review', 'quests', 'players', 'guesses', 'templates', 'settings']);
  });

  it('no guess log with guesses off (E9)', () => {
    expect(gmSectionsFor({ ...ALL_ON, guesses: false })).not.toContain('guesses');
  });

  it('no side-quest section with side quests off (E10)', () => {
    expect(gmSectionsFor({ ...ALL_ON, sideQuests: false })).toEqual(['game', 'joins', 'review', 'players', 'guesses', 'templates', 'settings']);
  });

  it('the map changes nothing in the console', () => {
    expect(gmSectionsFor({ ...ALL_ON, map: false })).toEqual(gmSectionsFor(ALL_ON));
  });
});
