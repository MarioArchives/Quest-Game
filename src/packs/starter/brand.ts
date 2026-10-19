import type { PackBrand } from '../types.ts';
import { mark } from './mark.ts';

export const brand: PackBrand = {
  themeColor: '#2740c4',
  backgroundColor: '#F5F5F2',
  // The ticket stub on paper before the bundle boots, in theme.css's loader colours: the ink line (--ink) over the blue
  // plate (--accent), and the name in ink. Optional: without it the page is only the background colour.
  boot: { mark, line: '#161616', plate: '#2740c4', text: '#161616' },
};
