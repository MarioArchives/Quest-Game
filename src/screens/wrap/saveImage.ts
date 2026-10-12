// "Save image": render one story card to a PNG with html-to-image and hand it to the player.
//
// Photos come from Firebase Storage (another origin). html-to-image re-fetches every <img> with fetch(),
// so the storage host must answer with CORS headers; the emulator does (Access-Control-Allow-Origin: *),
// and a real bucket needs a CORS config (gsutil cors set). When an image cannot be fetched we swap in a
// transparent placeholder (the tile's own background shows) instead of failing the whole export, and if the
// render still throws we retry without images and finally without web fonts.
import { toPng } from 'html-to-image';
import { pack } from '../../pack';

/** 1x1 transparent GIF: a failed photo becomes an empty tile rather than an error. */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const IMAGE_WAIT_MS = 5000;

/** Margins of the card on screen (room for the progress bars and buttons) shrink to a poster margin in the PNG. */
const EXPORT_PAD_TOP = 24;
const EXPORT_PAD_BOTTOM = 20;

/** Elements marked data-no-capture (buttons, close link) are left out of the picture. */
function isCaptured(node: Node): boolean {
  return !(node instanceof HTMLElement) || node.dataset.noCapture === undefined;
}

/** Waits until every <img> inside the node has loaded (or failed) and is decoded, but never longer than the timeout. */
async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  const settle = images.map(
    (img) =>
      new Promise<void>((resolve) => {
        const done = () => resolve();
        if (img.complete) {
          // decode() rejects for broken images; either way we are done with this one.
          img.decode().then(done, done);
          return;
        }
        img.addEventListener('load', () => img.decode().then(done, done), { once: true });
        img.addEventListener('error', done, { once: true });
      }),
  );
  const fonts = document.fonts?.ready ?? Promise.resolve();
  await Promise.race([
    Promise.all([...settle, fonts.then(() => undefined, () => undefined)]),
    new Promise<void>((resolve) => window.setTimeout(resolve, IMAGE_WAIT_MS)),
  ]);
}

interface Attempt {
  skipImages: boolean;
  skipFonts: boolean;
}

const ATTEMPTS: Attempt[] = [
  { skipImages: false, skipFonts: false },
  { skipImages: true, skipFonts: false },
  { skipImages: true, skipFonts: true },
];

/** Renders the card element to a PNG data URL (pixelRatio 2). */
export async function renderCardPng(node: HTMLElement): Promise<string> {
  await waitForImages(node);

  const rect = node.getBoundingClientRect();
  const computed = getComputedStyle(node);
  const padTop = parseFloat(computed.paddingTop) || 0;
  const padBottom = parseFloat(computed.paddingBottom) || 0;
  const width = Math.round(rect.width);
  const height = Math.max(240, Math.round(rect.height - (padTop - EXPORT_PAD_TOP) - (padBottom - EXPORT_PAD_BOTTOM)));
  const background = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E1251B';

  let lastError: unknown = null;
  for (const attempt of ATTEMPTS) {
    try {
      return await toPng(node, {
        pixelRatio: 2,
        width,
        height,
        backgroundColor: background,
        cacheBust: true,
        imagePlaceholder: BLANK,
        skipFonts: attempt.skipFonts,
        filter: (el) => isCaptured(el) && !(attempt.skipImages && el instanceof HTMLImageElement),
        style: {
          // The on-screen card is absolutely positioned and animates in; the picture is a plain static block.
          position: 'relative',
          top: '0px',
          left: '0px',
          right: 'auto',
          bottom: 'auto',
          margin: '0px',
          animation: 'none',
          transform: 'none',
          opacity: '1',
          paddingTop: `${EXPORT_PAD_TOP}px`,
          paddingBottom: `${EXPORT_PAD_BOTTOM}px`,
        },
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not render the card.');
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: 'image/png' });
}

function download(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export type SaveResult = 'downloaded' | 'shared';

/**
 * Renders the card and saves it. On phones (coarse pointer) with file sharing the system share sheet opens
 * (that is how a PNG reaches the camera roll); everywhere else, or if sharing is refused, it downloads.
 */
export async function saveCardImage(node: HTMLElement, slug: string): Promise<SaveResult> {
  const filename = `${pack.id}-${slug}.png`;
  const dataUrl = await renderCardPng(node);

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && window.matchMedia?.('(pointer: coarse)').matches) {
    try {
      const file = await dataUrlToFile(dataUrl, filename);
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: pack.name });
        return 'shared';
      }
    } catch (err) {
      // The player closed the share sheet: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      // Anything else (no user activation left, unsupported): fall back to a plain download.
    }
  }
  download(dataUrl, filename);
  return 'downloaded';
}
