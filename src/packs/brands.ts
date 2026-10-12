// Every pack's brand by id, for vite.config.ts (plain data, no CSS or TSX). Add a line for each new pack.
import { brand as lancaster } from './lancaster/brand.ts';
import { brand as starter } from './starter/brand.ts';
import type { PackBrand } from './types.ts';

export const brands: Record<string, PackBrand> = { lancaster, starter };
