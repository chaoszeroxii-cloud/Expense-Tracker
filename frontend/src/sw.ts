/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

/**
 * Hand-written service worker.
 *
 * The plugin generated this file automatically until push arrived — a generated worker
 * has no way to add a `push` listener. The caching rules below are a deliberate,
 * like-for-like port of what the generated one did; the only additions are the two
 * listeners at the bottom.
 *
 * Note what is NOT here: any caching of `/api/`. Cache Storage keys on URL alone, so a
 * shared cache of authenticated responses serves one signed-in user's finances to the
 * next person on the device. Offline reads live in a per-user IndexedDB store instead.
 */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// App shell for client-side routes; API paths must fall through to the network.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/api/],
}))

registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)

// `registerType: 'autoUpdate'` previously handled this; keep the same behaviour so a
// deploy does not leave someone on a stale bundle until they close every tab.
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

// ── Push ────────────────────────────────────────────────────────────────────
interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    // A push with a non-JSON body should still surface something rather than nothing.
    payload = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'MoneyFlow', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Same tag replaces an earlier notification instead of stacking a second copy
      // for the same day.
      tag: payload.tag ?? 'moneyflow',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const target = (event.notification.data?.url as string) ?? '/'

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Focus a tab that is already open rather than piling up new ones.
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(target)
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
