import { describe, expect, it } from 'vitest';
import type { BootMark, LoaderMark } from '../packs/types';
import { bootScreen, compactCss, markParts, markSvg, SCREEN_LOADER_SIZE } from './loaderMark';

const mark: LoaderMark = {
  strokeWidth: 1.5,
  plate: [
    { shape: 'rect', attrs: { x: 1, y: 2, width: 3, height: 4 } },
    { shape: 'ellipse', ink: 2, attrs: { cx: 32, cy: 27, rx: 6.5, ry: 5.9 } },
    { shape: 'path', ink: 3, attrs: { d: 'M1 1h2z' } },
  ],
  tiers: [['M0 0h1'], ['M1 1v2', 'M2 2v2']],
};

const boot: BootMark = { mark, line: '#111111', plate: '#222222', text: '#333333' };
const CSS = '/* the mark */\n.loader {\n  color: var(--ink);\n}\n\n@keyframes spin { 0% { opacity: 0; } }\n';

describe('markParts: one set of shapes for the app and the boot page', () => {
  it('gives the second and third plate inks their classes, and the plate colour none', () => {
    expect(markParts(mark).plate.map((p) => [p.tag, p.className])).toEqual([
      ['rect', undefined],
      ['ellipse', 'loader__plate--2'],
      ['path', 'loader__plate--3'],
    ]);
  });

  it('flattens the tiers in drawing order, every path of a tier in its slot', () => {
    expect(markParts(mark).tiers).toEqual([
      { className: 'loader__tier loader__tier--1', d: 'M0 0h1' },
      { className: 'loader__tier loader__tier--2', d: 'M1 1v2' },
      { className: 'loader__tier loader__tier--2', d: 'M2 2v2' },
    ]);
  });
});

describe('markSvg: the LoaderArt as markup', () => {
  const svg = markSvg(mark);

  it('draws the plate under the ink line, which is round-capped at the mark’s width', () => {
    expect(svg.indexOf('class="loader__plate"')).toBeLessThan(svg.indexOf('class="loader__ink"'));
    expect(svg).toContain('<g class="loader__ink" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">');
  });

  it('writes each shape with its geometry, and each line normalised to length 1', () => {
    expect(svg).toContain('<rect x="1" y="2" width="3" height="4"/>');
    expect(svg).toContain('<ellipse class="loader__plate--2" cx="32" cy="27" rx="6.5" ry="5.9"/>');
    expect(svg).toContain('<path class="loader__tier loader__tier--2" d="M2 2v2" pathLength="1"/>');
    expect(svg.match(/pathLength="1"/g)).toHaveLength(3);
  });

  it('escapes attribute values', () => {
    expect(markSvg({ ...mark, plate: [{ shape: 'path', attrs: { d: 'M0 0"><script>' } }] })).toContain('d="M0 0&quot;&gt;&lt;script&gt;"');
  });
});

describe('compactCss', () => {
  it('drops comments and squeezes white space', () => {
    expect(compactCss(CSS)).toBe('.loader { color: var(--ink); } @keyframes spin { 0% { opacity: 0; } }');
  });
});

describe('bootScreen: the Gate’s full-screen loader before the bundle boots', () => {
  const html = bootScreen(boot, { name: 'Quest & Co', loaderCss: CSS });

  it('inlines Loader.css, then hides the label and stills the plate for reduced motion', () => {
    const style = html.match(/^<style>(.*?)<\/style>/)![1]!;
    expect(style.startsWith(compactCss(CSS))).toBe(true);
    expect(style).toContain('.boot__label{position:absolute;');
    expect(style).toContain('@media (prefers-reduced-motion: reduce){.boot .loader__plate{animation:none}}');
  });

  it('is the full-screen loader at the Gate’s size, with the drawing from markSvg', () => {
    expect(html).toContain('<div class="loader loader--screen boot" role="status"');
    expect(html).toContain(`--loader-size:${SCREEN_LOADER_SIZE}px`);
    expect(html).toContain(`width="${SCREEN_LOADER_SIZE}" height="${SCREEN_LOADER_SIZE}"`);
    expect(html).toContain(`<svg class="loader__svg" viewBox="0 0 64 64"`);
    expect(html).toContain(markSvg(mark));
  });

  it('sets the pack’s line, plate and caption colours on it, and leaves out the inks and offset it has none of', () => {
    const style = html.match(/role="status" style="([^"]*)"/)![1]!;
    expect(style).toContain('--loader-line:#111111');
    expect(style).toContain('--loader-plate:#222222');
    expect(style).toContain('color:#333333');
    expect(style).not.toContain('--loader-plate-2');
    expect(style).not.toContain('--loader-offset');
  });

  it('sets the second and third inks and the offset when the pack has them', () => {
    const full = bootScreen({ ...boot, plate2: '#444444', plate3: '#555555', offset: { x: 1, y: 0.4 } }, { name: 'Q', loaderCss: '' });
    expect(full).toContain('--loader-plate-2:#444444;--loader-plate-3:#555555;--loader-offset-x:1px;--loader-offset-y:0.4px');
  });

  it('announces "Loading <name>" and captions it with the name, escaped', () => {
    expect(html).toContain('<span class="boot__label">Loading Quest &amp; Co</span>');
    expect(html).toContain('<span class="loader__caption" aria-hidden="true">Quest &amp; Co</span>');
  });
});
