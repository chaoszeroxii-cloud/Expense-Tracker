import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the bundle so telemetry can attribute an event to a release without
// the client having to guess or the server having to infer it.
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  ?? process.env.APP_VERSION
  ?? 'dev'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },

  plugins: [
    react(),
    VitePWA({
      // injectManifest, not generateSW: a generated worker cannot carry a `push`
      // listener, and push is the whole point of the daily reminder. src/sw.ts is a
      // like-for-like port of the rules the generated one had.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],

      // ── Web App Manifest ────────────────────────────────────
      manifest: {
        name: 'MoneyFlow — Expense Tracker',
        short_name: 'MoneyFlow',
        description: 'Track every baht, effortlessly.',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      // Caching rules live in src/sw.ts. This controls only what is *precached* —
      // downloaded in full the moment the service worker installs.
      //
      // It used to be `**/*.{js,css,...}`, i.e. every chunk: 41 files, 2.18 MB, fetched
      // on the first visit whether or not the user ever opened the screen that needed
      // them. That silently cancelled out the route-level code splitting — recharts,
      // jspdf and html2canvas were all pulled down up front regardless. Precache the
      // shell; let the lazy routes arrive over the network when they are first opened,
      // and stay in the runtime cache after that.
      injectManifest: {
        globPatterns: [
          'index.html',
          'assets/index-*.js',
          'assets/index-*.css',
          'icons/*.png',
          '*.svg',
          'manifest.webmanifest',
        ],
      },
    }),
  ],

  build: {
    // No `manualChunks` for recharts.
    //
    // The old config named it as a manual chunk with the comment "loaded only with
    // charts". It did the opposite: naming a manual chunk hoists it, and because the
    // entry is the common parent of every lazy route that needs recharts, Rollup emitted
    // it as a *static* import of the entry chunk. Verified in the built output —
    // `dist/assets/index-*.js` contained `from"./recharts-*.js"` — so 564 kB of charting
    // library was fetched before the login screen could paint.
    //
    // Letting Rollup decide puts recharts inside the Reports chunk graph, reachable only
    // through the lazy `/reports` route. Measured on this codebase:
    //   before  entry 398 kB + recharts 564 kB = 962 kB (288 kB gzip) on first paint
    //   after   entry 541 kB                             (175 kB gzip)
    rollupOptions: {},
  },

  server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    watch: {
      // Polling is what makes bind-mounted files visible inside a container, but it costs
      // a constant CPU spin — pure waste when running `npm run dev` directly on the host.
      // docker-compose sets VITE_USE_POLLING=true for the containerised path.
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
})
