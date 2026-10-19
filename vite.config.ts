import react from '@vitejs/plugin-react';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { brands } from './src/packs/brands.ts';
import { getPack } from './functions/src/shared/packs/index.ts';
import { bootScreen } from './src/lib/loaderMark.ts';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * One public dir for Vite: the engine's public/ with the pack's src/packs/<id>/public/ copied over it (a pack
 * file wins on a name clash). Vite serves it at the site root in dev and copies it into the build, so the
 * workbox precache sees the pack's icons and data too. Rebuilt at every start of dev or build.
 */
function mergePublicDirs(packId: string): string {
  const out = join(root, 'node_modules/.cache/game-pack-public', packId);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(root, 'public'), out, { recursive: true });
  const packPublic = join(root, 'src/packs', packId, 'public');
  if (existsSync(packPublic)) cpSync(packPublic, out, { recursive: true, force: true });
  return out;
}

// Relative base so the same build works on GitHub Pages project sites (https://user.github.io/repo/)
// and locally. Hash routing means no server-side rewrites are needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // getPack throws on an unknown id and lists the known ones.
  const pack = getPack(env.VITE_GAME_PACK || undefined);
  const packDir = join(root, 'src/packs', pack.id);
  const brand = brands[pack.id];
  if (!brand) throw new Error(`Game pack "${pack.id}" has no src/packs/${pack.id}/brand.ts registered in src/packs/brands.ts.`);

  return {
    base: env.VITE_BASE ?? './',
    publicDir: mergePublicDirs(pack.id),
    resolve: { alias: { '@pack': join(packDir, 'index.tsx') } },
    plugins: [
      react(),
      {
        name: 'game-pack-html',
        transformIndexHtml: (html) =>
          html
            .replaceAll('%TITLE%', pack.name)
            .replaceAll('%DESCRIPTION%', pack.description)
            .replaceAll('%THEME_COLOR%', brand.themeColor)
            .replaceAll('%BACKGROUND_COLOR%', brand.backgroundColor)
            // The pack's loading figure until React's first render replaces it (brand.boot), or nothing. Loader.css is
            // read for every page, so in dev the figure keeps up with it.
            .replace('%BOOT%', () =>
              brand.boot ? bootScreen(brand.boot, { name: pack.name, loaderCss: readFileSync(join(root, 'src/components/Loader.css'), 'utf8') }) : '',
            ),
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: pack.name,
          short_name: pack.name,
          description: pack.description,
          theme_color: brand.themeColor,
          background_color: brand.backgroundColor,
          display: 'standalone',
          orientation: 'portrait',
          start_url: './',
          scope: './',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
          // Push notifications: shows what FCM sends and opens the link on tap (public/push-sw.js).
          importScripts: ['push-sw.js'],
          navigateFallback: 'index.html',
          // Never intercept the Firebase emulator / API hosts; map tiles are cached at runtime.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    build: {
      // Firebase is most of the bundle; its own long-cached chunk means app updates don't re-download it.
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          codeSplitting: { groups: [{ name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ }] },
        },
      },
    },
    server: { port: 5173, strictPort: true },
  };
});
