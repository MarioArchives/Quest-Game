// The loading figure before the bundle boots (brand.boot, drawn into index.html by vite.config.ts) is the app's
// LoaderArt: the same shapes. Its colours against theme.css and the design masters: tests/engine/boot.test.ts.
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { markSvg } from '../lib/loaderMark';
import { brands } from './brands';
import type { BootMark, PackBrand } from './types';

const looks: Record<string, () => Promise<{ default: { LoaderArt: ComponentType } }>> = {
  lancaster: () => import('./lancaster/index.tsx'),
  mystery: () => import('./mystery/index.tsx'),
  starter: () => import('./starter/index.tsx'),
};

/** Every element of a piece of SVG markup as "tag attr=value …", attributes sorted. */
const elements = (markup: string) =>
  [...markup.matchAll(/<(g|path|rect|ellipse|circle)\b([^>]*?)\/?>/g)].map(([, tag, attrs]) => {
    const pairs = [...attrs!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => `${name}=${value}`);
    return [tag, ...pairs.sort()].join(' ');
  });

const boots = Object.entries(brands).filter((entry): entry is [string, PackBrand & { boot: BootMark }] => Boolean(entry[1].boot));

describe('the boot figure is the pack’s loader', () => {
  it('every pack today has one, and index.html has its slot inside #root', () => {
    expect(boots.map(([id]) => id).sort()).toEqual(['lancaster', 'mystery', 'starter']);
    expect(indexHtml).toMatch(/<div id="root">%BOOT%<\/div>/);
  });

  it.each(boots)('%s: the app’s LoaderArt draws the very shapes the boot figure does', async (id, brand) => {
    const look = (await looks[id]!()).default;
    const app = elements(renderToStaticMarkup(createElement(look.LoaderArt)));
    expect(app.length).toBeGreaterThan(2);
    expect(app).toEqual(elements(markSvg(brand.boot.mark)));
  });
});
