// A pack's boot figure (brand.boot: index.html's loader before the bundle boots) is painted in the colours its
// theme.css gives `.loader`, and its mark is the design master. The shapes against the app's LoaderArt:
// src/packs/boot.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brands } from '../../src/packs/brands.ts';
import type { BootMark, PackBrand } from '../../src/packs/types.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const attrsOf = (text: string) => Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name!, value!]));
const hex = (colour: string) => {
  const c = colour.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(c) ? `#${[...c.slice(1)].map((d) => d + d).join('')}` : c;
};

/** The custom properties a style sheet sets (the first setting wins: the :root block comes first). */
function customProps(css: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const [, name, value] of uncomment(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!props.has(name!)) props.set(name!, value!.trim());
  }
  return props;
}

type Paint = Omit<BootMark, 'mark'>;

/** What `.loader` paints in a pack's theme (Loader.css's defaults where the pack sets nothing). */
function themeLoader(id: string): Paint {
  const theme = uncomment(read(`src/packs/${id}/theme.css`));
  const props = customProps(theme);
  const engine = customProps(read('src/styles/tokens.css'));
  const resolve = (value: string): string => {
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    return ref ? resolve(props.get(ref[1]!) ?? engine.get(ref[1]!) ?? '') : value;
  };
  const prop = (name: string) => (props.has(name) ? resolve(props.get(name)!) : undefined);
  const px = (name: string) => (props.has(name) ? parseFloat(props.get(name)!) : undefined);
  // The full-screen loader's text colour: the theme's rule for .loader--screen, else Loader.css's ink.
  const screen = [...theme.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find(([, selector, body]) => /\.loader--screen\b/.test(selector!) && /(^|;)\s*color\s*:/.test(body!));
  const text = screen ? screen[2]!.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)![1]!.trim() : 'var(--ink)';
  const x = px('--loader-offset-x');
  const y = px('--loader-offset-y');
  return {
    line: resolve(props.get('--loader-line') ?? 'var(--ink)'),
    plate: resolve(props.get('--loader-plate') ?? 'var(--accent)'),
    plate2: prop('--loader-plate-2'),
    plate3: prop('--loader-plate-3'),
    offset: x !== undefined && y !== undefined ? { x, y } : undefined,
    text: resolve(text),
  };
}

const paint = (b: Paint): Paint => ({
  line: hex(b.line),
  plate: hex(b.plate),
  plate2: b.plate2 && hex(b.plate2),
  plate3: b.plate3 && hex(b.plate3),
  offset: b.offset,
  text: hex(b.text),
});

const boots = Object.entries(brands).filter((entry): entry is [string, PackBrand & { boot: BootMark }] => Boolean(entry[1].boot));

describe('a pack’s boot figure is in its loader’s colours', () => {
  it('reads every pack that has one', () => {
    expect(boots.map(([id]) => id).sort()).toEqual(['lancaster', 'mystery', 'starter']);
  });

  it.each(boots)('%s: the line, plate inks, offset and caption its theme.css gives .loader', (id, brand) => {
    const { line, plate, plate2, plate3, offset, text } = brand.boot;
    expect(paint({ line, plate, plate2, plate3, offset, text })).toEqual(paint(themeLoader(id)));
  });

  it('mystery: the bee keeps its black line on the wall, under the wall’s light caption', () => {
    expect(paint(themeLoader('mystery'))).toMatchObject({ line: '#161718', plate: '#e5ac17', plate2: '#c9cbc5', plate3: '#161718', text: '#e9ebec' });
  });
});

describe('the marks match their design masters', () => {
  const loaderCss = read('src/components/Loader.css');
  const defaultOffset = {
    x: parseFloat(loaderCss.match(/--loader-offset-x, ([\d.]+)px/)![1]!),
    y: parseFloat(loaderCss.match(/--loader-offset-y, ([\d.]+)px/)![1]!),
  };

  it.each([
    ['mystery', 'design/manchester-bee.svg'],
    ['lancaster', 'design/ashton-memorial.svg'],
  ])('%s: %s', (id, path) => {
    const svg = read(path);
    const boot = brands[id]!.boot!;
    const [, plateAttrs, plateBody] = svg.match(/<g class="plate"([^>]*)>([\s\S]*?)<\/g>/)!;
    const [, inkAttrs, inkBody] = svg.match(/<g class="ink"([^>]*)>([\s\S]*?)<\/g>/)!;

    // the plate's shapes and their inks
    const plate = [...plateBody!.matchAll(/<(path|rect|ellipse|circle)\b([^>]*?)\/>/g)].map(([, tag, attrs]) => {
      const { class: cls, ...geometry } = attrsOf(attrs!);
      return { tag, ink: cls ? Number(cls.replace('ink-', '')) : 1, geometry };
    });
    expect(plate).toEqual(
      boot.mark.plate.map(({ shape, ink, attrs }) => ({
        tag: shape,
        ink: ink ?? 1,
        geometry: Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, String(value)])),
      })),
    );

    // the line, tier by tier
    const tiers = [...inkBody!.matchAll(/<path\b([^>]*?)\/>/g)].map(([, attrs]) => {
      const { class: cls, d } = attrsOf(attrs!);
      return [Number(cls!.match(/tier-(\d)/)![1]), d];
    });
    expect(tiers).toEqual(boot.mark.tiers.flatMap((paths, i) => paths.map((d) => [i + 1, d])));
    expect(Number(attrsOf(inkAttrs!)['stroke-width'])).toBe(boot.mark.strokeWidth);

    // the inks and the off-register nudge
    const inkColours = Object.fromEntries([...svg.matchAll(/\.ink-(\d) \{ fill: (#[0-9a-fA-F]+); \}/g)].map(([, n, c]) => [Number(n), hex(c!)]));
    const plateFill = attrsOf(plateAttrs!).fill;
    expect(hex(attrsOf(inkAttrs!).stroke!)).toBe(hex(boot.line));
    expect(plateFill ? hex(plateFill) : inkColours[1]).toBe(hex(boot.plate));
    if (boot.plate2) expect(inkColours[2]).toBe(hex(boot.plate2));
    if (boot.plate3) expect(inkColours[3]).toBe(hex(boot.plate3));
    const [, x, y] = plateAttrs!.match(/translate\(([\d.]+) ([\d.]+)\)/)!;
    expect({ x: Number(x), y: Number(y) }).toEqual(boot.offset ?? defaultOffset);
  });
});
