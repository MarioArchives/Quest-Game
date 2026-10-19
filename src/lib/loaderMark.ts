// A pack's loading mark as plain data (src/packs/<id>/mark.ts), drawn two ways from the same shapes: by React in the
// app (`markArt` in components/MarkArt.tsx, the pack's LoaderArt) and as a static string in index.html before the
// bundle boots (`bootScreen`, called by vite.config.ts). Pure: no React or DOM, so the Vite config can import it.
import type { BootMark, LoaderMark, MarkShape } from '../packs/types.ts';

/** The app's full-screen loader (the Gate's), which the boot figure copies so the hand-over to React doesn't jump. */
export const SCREEN_LOADER_SIZE = 96;

export interface MarkPart {
  tag: MarkShape['shape'];
  /** `loader__plate--2` / `--3` for the plate's second and third inks; none for its own colour. */
  className: string | undefined;
  attrs: Record<string, string | number>;
}

/** The plate's shapes with their ink classes, and the line's paths with their tier classes, in drawing order. */
export function markParts(mark: LoaderMark): { plate: MarkPart[]; tiers: { className: string; d: string }[] } {
  return {
    plate: mark.plate.map(({ shape, ink, attrs }) => ({ tag: shape, className: ink === 2 || ink === 3 ? `loader__plate--${ink}` : undefined, attrs })),
    tiers: mark.tiers.flatMap((paths, i) => paths.map((d) => ({ className: `loader__tier loader__tier--${i + 1}`, d }))),
  };
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attrList = (attrs: Record<string, string | number>) =>
  Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escape(String(value))}"`)
    .join('');

/** What goes inside the mark's `<svg viewBox="0 0 64 64">`: the LoaderArt's plate and ink groups, as markup. */
export function markSvg(mark: LoaderMark): string {
  const { plate, tiers } = markParts(mark);
  const shapes = plate.map(({ tag, className, attrs }) => `<${tag}${className ? ` class="${className}"` : ''}${attrList(attrs)}/>`).join('');
  const lines = tiers.map(({ className, d }) => `<path class="${className}" d="${escape(d)}" pathLength="1"/>`).join('');
  return (
    `<g class="loader__plate">${shapes}</g>` +
    `<g class="loader__ink" fill="none" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${lines}</g>`
  );
}

/** A style sheet without its comments and with each run of white space cut to one space (to inline it). */
export function compactCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * index.html's figure before the bundle boots: the Gate's full-screen loader (`<Loader fullScreen>` at
 * SCREEN_LOADER_SIZE, captioned with the pack's name) as static markup, with Loader.css inlined and the pack's loader
 * colours set on it, so it draws and prints just as the app's does, with no JS. It goes inside #root, style and all,
 * so React's first render replaces it. With reduced motion it stands finished and still.
 */
export function bootScreen(boot: BootMark, { name, loaderCss }: { name: string; loaderCss: string }): string {
  const vars = [
    `--loader-size:${SCREEN_LOADER_SIZE}px`,
    `--loader-line:${boot.line}`,
    `--loader-plate:${boot.plate}`,
    boot.plate2 ? `--loader-plate-2:${boot.plate2}` : null,
    boot.plate3 ? `--loader-plate-3:${boot.plate3}` : null,
    boot.offset ? `--loader-offset-x:${boot.offset.x}px` : null,
    boot.offset ? `--loader-offset-y:${boot.offset.y}px` : null,
    `color:${boot.text}`,
    // The caption takes the pack's display face once its sheet is in (a production build links it before the first
    // paint); until then a system face.
    'font-family:var(--display, system-ui, sans-serif)',
  ].filter(Boolean);
  const style =
    compactCss(loaderCss) +
    ' .boot__label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}' +
    ' @media (prefers-reduced-motion: reduce){.boot .loader__plate{animation:none}}';
  const size = SCREEN_LOADER_SIZE;
  return (
    `<style>${style}</style>` +
    `<div class="loader loader--screen boot" role="status" style="${escape(vars.join(';'))}">` +
    `<svg class="loader__svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${markSvg(boot.mark)}</svg>` +
    `<span class="boot__label">Loading ${escape(name)}</span>` +
    `<span class="loader__caption" aria-hidden="true">${escape(name)}</span>` +
    '</div>'
  );
}
