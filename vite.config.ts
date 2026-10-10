import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works on GitHub Pages project sites (https://user.github.io/repo/)
// and locally. Hash routing means no server-side rewrites are needed.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Festival Quest',
        short_name: 'Festival Quest',
        description: 'Secret side quests for Lancaster Music Festival 2026.',
        theme_color: '#111111',
        background_color: '#F4F2EE',
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
});
