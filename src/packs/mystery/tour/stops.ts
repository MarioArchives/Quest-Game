// The torch tour's ten stops, in order (a run is the whole tour, from the offer on Missions). Each stop names the tab it
// happens on, the specimen screen shown there (a snapshot of the demo in snap/scenes.json, taken by
// scripts/packs/mystery/snapshot-tour.mjs), the elements the torch lights and the tag's heading. What the tag says is
// in words.ts, worded from tonight's settings. A lit name is a data-tour name (on the pack's own components, or stamped
// by the snapshot on the engine's and on one-off elements) or a CSS selector. A stop somewhere else says how to get
// there (`via`): the red pen points at what you'd tap, one hop at a time, before the tour moves on.
//
// Plain data with no imports, so the snapshot script can read it (Node strips the types).

export type TabId = 'missions' | 'logbook' | 'file';
export const TABS: TabId[] = ['missions', 'logbook', 'file'];

/** The snapshots, by the names the snapshot script keeps them under. */
export type SceneId = 'missions' | 'map' | 'standings' | 'logbook' | 'file' | 'alex' | 'search' | 'terms';

/** What each tab shows on the specimen night when no stop is on it. */
export const SPECIMEN: Record<TabId, SceneId> = { missions: 'missions', logbook: 'logbook', file: 'file' };

/**
 * One hop on the way to a stop elsewhere: the thing you'd tap (a selector in the snapshot, or a data-tour name) and
 * what a screen reader hears on the way. It is pointed at on the screen being left, or on `at` when the hop is on a
 * screen between (Standings, on the way from My file to someone's file). The torch always goes to it; the pen draws
 * its arrow unless `arrow` is false (where the arrow would only be a stub, the thing being right by the spot).
 */
export interface Hop {
  at?: { tab: TabId; scene: SceneId };
  target: string;
  label: string;
  arrow?: false;
}

/** What a stop's tag says, worded by words.ts. */
export type SayId = 'live' | 'kinds' | 'map' | 'standings' | 'standing-lines' | 'logbook' | 'missions' | 'accuse' | 'search' | 'sign';

export interface Stop {
  tab: TabId;
  /** The specimen screen on that tab (with its sheet or toast, if it has one). */
  scene: SceneId;
  /** Without the screen's sheet or toast. */
  bare?: boolean;
  /** How to get here from the stop before, when it's somewhere else. */
  via?: Hop[];
  /** The tag's heading, in type. */
  title: string;
  /** What the tag says, in handwriting (words.ts). */
  say: SayId;
  /** The elements lit, as one box. */
  lit: string[];
  /** A smaller box to light instead when `lit` and the tag can't both fit on the screen. */
  core?: string[];
  /** Light this much above the element too: the screens moving over the tab bar. */
  growTop?: number;
  /** A wider tag, for a stop with more to say. */
  width?: number;
  /** A red-pen note over the lit part. */
  pen?: 'swipe';
  /** The pages edge over and back, to show the swipe. */
  peek?: boolean;
}

export const STOPS: Stop[] = [
  { tab: 'missions', scene: 'missions', title: 'Active missions', say: 'live', lit: ['live'], width: 240 },
  { tab: 'missions', scene: 'missions', title: 'Kinds of mission', say: 'kinds', lit: ['events', 'rollcall', 'story'], core: ['events', 'rollcall'] },
  {
    tab: 'missions',
    scene: 'map',
    via: [{ target: '.tr-pane--missions .bd-tab:nth-child(2)', label: 'the Map' }],
    title: 'Map',
    say: 'map',
    lit: ['strip', '.tr-pane--missions .leaflet-container'],
  },
  {
    tab: 'missions',
    scene: 'standings',
    via: [{ target: '.tr-pane--missions .bd-tab:nth-child(3)', label: 'Standings', arrow: false }],
    title: 'Standings',
    say: 'standings',
    lit: ['st-top', 'st-row3'],
    core: ['st-top', 'st-row2'],
  },
  { tab: 'missions', scene: 'standings', title: 'Trusted or watched', say: 'standing-lines', width: 240, lit: ['legend'] },
  {
    tab: 'logbook',
    scene: 'logbook',
    via: [{ target: '.tr-bar .tabbar__tab:nth-child(2)', label: 'Log book' }],
    title: 'Log book',
    say: 'logbook',
    lit: ['top-card', 'entry-new'],
    core: ['entry-new'],
    width: 240,
  },
  {
    tab: 'file',
    scene: 'file',
    via: [{ target: '.tr-bar .tabbar__tab:nth-child(3)', label: 'My file' }],
    title: 'Your missions',
    say: 'missions',
    lit: ['mission'],
    width: 262,
  },
  {
    tab: 'missions',
    scene: 'alex',
    via: [
      { target: '.tr-bar .tabbar__tab:nth-child(1)', label: 'Public file' },
      { at: { tab: 'missions', scene: 'missions' }, target: '.tr-pane--missions .bd-tab:nth-child(3)', label: 'Standings' },
      { at: { tab: 'missions', scene: 'standings' }, target: '.tr-pane--missions .st__li[data-uid="demo-alex"] .st__face', label: 'Alex’s file' },
    ],
    title: 'Call them out',
    say: 'accuse',
    lit: ['suspect-head', 'form3'],
    core: ['form3'],
  },
  {
    tab: 'missions',
    scene: 'search',
    via: [{ target: '.tr-pane--missions [data-tour="form3"] .cs-btn', label: 'type a charge' }],
    title: 'Name the mission',
    say: 'search',
    lit: ['cs-search', 'cs-hits'],
    core: ['cs-hits'],
  },
  {
    tab: 'missions',
    scene: 'terms',
    via: [{ target: '.tr-over .cs-hit', label: 'pick one' }],
    title: 'Charge them',
    say: 'sign',
    lit: ['cs-terms', 'cs-file'],
    core: ['cs-sign', 'cs-file'],
  },
];

/** How each tag hangs: a degree or so off straight, never the same way twice running. */
export const TILT = [-1, 1, -0.8, 1, -0.9, 0.8, -1, 0.9, -0.8, 1];

/** Where a name points: a data-tour name, or a selector as it is. */
export const selectorOf = (name: string) => (/^[.#[]/.test(name) ? name : `[data-tour="${name}"]`);

/** The screen a hop is pointed at on: the last one of its hops so far that moves to another, if any. */
export const hopScreen = (via: readonly Hop[], i: number) =>
  via
    .slice(0, i + 1)
    .reverse()
    .find((h) => h.at)?.at ?? null;
