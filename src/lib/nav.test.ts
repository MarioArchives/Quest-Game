// Engine plan edge cases 9-11 (app side): tabs and GM sections follow the pack's features.
import { describe, expect, it } from 'vitest';
import { gmSectionsFor, litTab, tabLabels, tabsFor } from './nav';

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

  it('a pack with its own feed screen gets a Feed tab after Home', () => {
    expect(tabsFor({ features: ALL_ON, isAdmin: false, ended: false, feed: true })).toEqual(['home', 'feed', 'map', 'account']);
  });

  it('no Map tab when the pack hosts the map in a screen of its own', () => {
    expect(tabsFor({ features: ALL_ON, isAdmin: true, ended: false, feed: true, ownMap: true })).toEqual(['home', 'feed', 'account', 'gm']);
    expect(tabsFor({ features: ALL_ON, isAdmin: false, ended: false, ownMap: false })).toEqual(['home', 'map', 'account']);
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

  it('a periodic missions section after side quests, only for packs with check-ins', () => {
    expect(gmSectionsFor({ ...ALL_ON, checkins: true })).toEqual(['game', 'joins', 'review', 'quests', 'periodics', 'players', 'guesses', 'templates', 'settings']);
    expect(gmSectionsFor(ALL_ON)).not.toContain('periodics');
  });

  it('a story section after side quests when the pack has story missions', () => {
    expect(gmSectionsFor(ALL_ON, { story: true })).toEqual(['game', 'joins', 'review', 'quests', 'story', 'players', 'guesses', 'templates', 'settings']);
    expect(gmSectionsFor(ALL_ON, { story: false })).not.toContain('story');
    expect(gmSectionsFor({ ...ALL_ON, sideQuests: false }, { story: true })).not.toContain('story');
  });

  it('a police section after periodic missions, only for packs with police', () => {
    expect(gmSectionsFor({ ...ALL_ON, checkins: true, police: true }, { story: true })).toEqual([
      'game', 'joins', 'review', 'quests', 'story', 'periodics', 'police', 'players', 'guesses', 'templates', 'settings',
    ]);
    expect(gmSectionsFor(ALL_ON)).not.toContain('police');
  });

  it('the map changes nothing in the console', () => {
    expect(gmSectionsFor({ ...ALL_ON, map: false })).toEqual(gmSectionsFor(ALL_ON));
  });
});

describe('tabLabels (mystery plan E22)', () => {
  it("without overrides: Home, Map, Account, and the pack's GM and wrap words", () => {
    expect(tabLabels(undefined, { gm: 'Host', wrap: 'Recap' })).toEqual({ home: 'Home', feed: 'Feed', map: 'Map', account: 'Account', gm: 'Host', wrap: 'Recap' });
  });

  it("a pack's own labels replace only the tabs it names", () => {
    expect(tabLabels({ home: 'Board', account: 'My file' }, { gm: 'GM', wrap: 'Case file' })).toEqual({
      home: 'Board',
      feed: 'Feed',
      map: 'Map',
      account: 'My file',
      gm: 'GM',
      wrap: 'Case file',
    });
  });

  it('ignores blank labels', () => {
    expect(tabLabels({ home: '  ' }, { gm: 'GM', wrap: 'Wrap' }).home).toBe('Home');
  });
});

describe('litTab', () => {
  it("lights each tab on its own screen, and none on the others", () => {
    expect(litTab('/')).toBe('home');
    expect(litTab('/feed')).toBe('feed');
    expect(litTab('/map')).toBe('map');
    expect(litTab('/account')).toBe('account');
    expect(litTab('/gm')).toBe('gm');
    expect(litTab('/wrap')).toBe('wrap');
    expect(litTab('/player/abc')).toBeNull();
    expect(litTab('/standings')).toBeNull();
  });

  it('keeps Home lit on the map when the pack hosts the map in its Home screen', () => {
    expect(litTab('/map', true)).toBe('home');
  });
});
