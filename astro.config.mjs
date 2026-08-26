// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import AstroPWA from '@vite-pwa/astro';

/**
 * GitHub Pages pubblica il sito su `https://<utente>.github.io/<repo>/`, non
 * sulla radice del dominio. Tutto ciò che è assoluto — manifest, scope del
 * service worker, icone, link interni — deve tenerne conto, altrimenti la PWA
 * risulta non installabile e la navigazione esce dall'applicazione.
 */
const BASE = '/navi';
/** Con la barra finale: è la forma richiesta da `start_url` e `scope`. */
const BASE_SLASH = `${BASE}/`;

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://sbonsisback.github.io',
  base: BASE,
  integrations: [
    preact(),
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Navi — Tutor & Average Speed Tracker',
        short_name: 'Navi',
        description:
          'Tachimetro GPS, velocità media tra varchi Tutor e storico viaggi. Offline-first.',
        lang: 'it',
        start_url: BASE_SLASH,
        scope: BASE_SLASH,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        categories: ['navigation', 'travel', 'utilities'],
        icons: [
          { src: `${BASE_SLASH}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE_SLASH}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE_SLASH}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache dell'intero output statico: l'app deve aprirsi in Airplane Mode.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Senza barra finale, e non è un dettaglio: la home finisce in
        // precache come `/navi`, quindi legare il fallback a `/navi/`
        // cercherebbe una chiave che non esiste e farebbe fallire ogni
        // navigazione offline. Le altre pagine sono precache relative allo
        // scope e vengono servite direttamente, senza passare di qui.
        navigateFallback: BASE,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Le tile della mappa non possono stare nella precache (sono
            // infinite): le conserviamo man mano che vengono viste, così le
            // zone già consultate restano navigabili anche senza rete.
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
