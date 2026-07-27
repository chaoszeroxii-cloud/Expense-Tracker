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

      // ── Workbox Service Worker strategy ────────────────────
      workbox: {
        // Cache app shell (HTML, JS, CSS) — network-first, fallback to cache
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],

        runtimeCaching: [
          {
            // Authenticated API responses are NEVER cached.
            //
            // Cache Storage keys on URL only, so a shared `api-cache` would serve
            // one signed-in user's financial data to the next person to sign in on
            // the same device, and would silently surface day-old figures with no
            // "last updated" marker. Offline reads must be per-user in IndexedDB
            // (planned separately) — not a URL-keyed HTTP cache.
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts: cache-first
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split recharts (~1.2MB) into its own chunk — loaded only with charts
          recharts: ['recharts'],
        },
      },
    },
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
      usePolling: true, // เพิ่มตัวนี้เพื่อให้ Docker ตรวจจับการเซฟไฟล์ได้แน่นอนขึ้น
    },
  },
})
