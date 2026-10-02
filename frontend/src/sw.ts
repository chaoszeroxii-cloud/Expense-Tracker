/// <reference lib="webworker" />
import { precache, addRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

/**
 * Hand-written service worker.
 *
 * Fresh HTML while online, a precached shell while offline, and a bounded cache of
 * visited code chunks. Do not bind online navigations to a release's cached HTML:
 * after a deploy it can reference lazy chunks that no longer exist on the server.
 *
 * Note what is NOT here: any caching of `/api/`. Cache Storage keys on URL alone, so a
 * shared cache of authenticated responses serves one signed-in user's finances to the
 * next person on the device. Offline reads live in a per-user IndexedDB store instead.
 */

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

cleanupOutdatedCaches()
precache(self.__WB_MANIFEST)

// Register before the precache route, which otherwise intercepts '/' and '/index.html'.
const offlineShell = createHandlerBoundToURL('index.html')
registerRoute(new NavigationRoute(async (options) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    // One public shell URL, never a password-reset query or authenticated API response.
    const response = await fetch(new URL('index.html', self.registration.scope), {
      cache: 'no-cache', signal: controller.signal,
    })
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) return response
  } catch {
    // The installed shell and its matching entry chunk remain available offline.
  } finally {
    clearTimeout(timeout)
  }
  return offlineShell(options)
}, {
  denylist: [/^\/(?:api|assets|icons|_vercel)(?:\/|$)/, /^\/[^?]*\.(?!html(?:\?|$))[^/?]+(?:\?|$)/],
}))
addRoute()

// Keep previously visited routes usable offline and in tabs left open during deploys.
// Hash-named JS/CSS is public, immutable code; never cache API or user documents here.
registerRoute(
  ({ url }) => url.origin === self.location.origin && /^\/assets\/[^/]+-[\w-]+\.(?:js|css)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'moneyflow-code-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
    ],
  }),
)

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

// Activate updated workers without forcing healthy tabs to reload (and lose form input).
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
