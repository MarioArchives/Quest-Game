import type { PackBrand } from '../types.ts';
import { mark } from './mark.ts';

export const brand: PackBrand = {
  themeColor: '#3d4042',
  backgroundColor: '#3d4042',
  // The bee on the wall before the bundle boots, in theme.css's loader colours: the black line (--ink), the gold body
  // (--bee-gold), the pale wings (--bee-wing) and the ink bands, nudged (+1, +0.4), over the name in --walltext.
  boot: { mark, line: '#161718', plate: '#e5ac17', plate2: '#c9cbc5', plate3: '#161718', offset: { x: 1, y: 0.4 }, text: '#e9ebec' },
  tabs: { home: 'Missions', feed: 'Log book', account: 'My file' },
  tabIcons: { home: 'folder', feed: 'notebook' },
  // Swiping between the tabs turns the page under the finger (the engine's default is a slide).
  tabSwipe: 'turn',
  avatar: { placeholder: 'silhouette', tints: ['#cfd8dc', '#e3d5c8', '#d6e4d9', '#e6d3d8', '#d9d6ea', '#e8e2c9', '#cde3e6', '#e4d0c4'] },
};
