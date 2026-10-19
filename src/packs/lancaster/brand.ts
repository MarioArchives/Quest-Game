import type { PackBrand } from '../types.ts';
import { mark } from './mark.ts';

export const brand: PackBrand = {
  themeColor: '#111111',
  backgroundColor: '#F4F2EE',
  // The Ashton Memorial on paper before the bundle boots, in theme.css's loader colours: the ink line (--ink) over the
  // red plate (--accent) at the engine's (+1.6, +1.4), and the name in ink.
  boot: { mark, line: '#111111', plate: '#e1251b', text: '#111111' },
};
