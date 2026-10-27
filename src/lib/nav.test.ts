// Engine plan edge cases 9-11 (app side): tabs and GM sections follow the pack's features.
import { describe, expect, it } from 'vitest';
import { gmSectionsFor, isTabSwipe, litTab, swipeBlocked, swipeTab, tabLabels, tabsFor, type SwipeNode, type TabId } from './nav';

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

describe('swiping between tabs (plan "swipe between tabs", edge cases S1–S3)', () => {
  const PLAYER: TabId[] = ['home', 'feed', 'account'];
  const GM: TabId[] = ['home', 'feed', 'account', 'gm', 'wrap'];

  it('S1. a left swipe goes to the next tab, a right swipe to the one before', () => {
    expect(swipeTab(PLAYER, 'home', -80)).toBe('feed');
    expect(swipeTab(PLAYER, 'feed', -80)).toBe('account');
    expect(swipeTab(PLAYER, 'account', 80)).toBe('feed');
    expect(swipeTab(PLAYER, 'feed', 80)).toBe('home');
  });

  it('S1. never wraps round, and goes nowhere from a screen that is not a tab', () => {
    expect(swipeTab(PLAYER, 'home', 80)).toBeNull();
    expect(swipeTab(PLAYER, 'account', -80)).toBeNull();
    expect(swipeTab(PLAYER, null, -80)).toBeNull();
    expect(swipeTab(PLAYER, 'gm', -80)).toBeNull();
  });

  it('S1. follows whatever tabs this person has (the GM, the wrap, a Map tab)', () => {
    expect(swipeTab(GM, 'account', -80)).toBe('gm');
    expect(swipeTab(GM, 'gm', -80)).toBe('wrap');
    expect(swipeTab(['home', 'map', 'account'], 'home', -80)).toBe('map');
  });

  it.each([
    ['60 px across, quick', { dx: 60, dy: 0, ms: 200 }, true],
    ['the other way', { dx: -60, dy: 10, ms: 200 }, true],
    ['59 px', { dx: 59, dy: 0, ms: 200 }, false],
    ['twice as far across as down', { dx: 80, dy: 40, ms: 300 }, true],
    ['mostly down (a scroll)', { dx: 80, dy: 41, ms: 300 }, false],
    ['700 ms', { dx: 120, dy: 0, ms: 700 }, true],
    ['slower (a drag)', { dx: 120, dy: 0, ms: 701 }, false],
  ])('S2. %s', (_label, gesture, want) => {
    expect(isTabSwipe(gesture)).toBe(want);
  });

  const plain: SwipeNode = { ownSwipe: false, scrollsX: false, field: false, slider: false, dialog: false };

  it('S3. a gesture that starts on plain content is free to switch tabs', () => {
    expect(swipeBlocked([])).toBe(false);
    expect(swipeBlocked([plain, plain, plain])).toBe(false);
  });

  it.each(['ownSwipe', 'scrollsX', 'field', 'slider', 'dialog'] as const)('S3. one that starts in (or inside) something with %s is left alone', (key) => {
    expect(swipeBlocked([{ ...plain, [key]: true }])).toBe(true);
    expect(swipeBlocked([plain, plain, { ...plain, [key]: true }])).toBe(true);
  });
});
