/**
 * Browser-side Web Push plumbing.
 *
 * Everything here degrades quietly. Push is unavailable on plenty of real setups — a
 * desktop Safari without the PWA installed, a browser with notifications blocked at the
 * OS level, an iOS user who has not added the app to their home screen — and none of
 * that should surface as an error.
 */

export type PushSupport =
  | 'supported'
  | 'unsupported'          // no service worker or Push API at all
  | 'ios-needs-install'    // iOS grants push only to an installed PWA (16.4+)
  | 'denied'               // the user said no; only the OS/browser can undo that

export function detectSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'

  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true

  // Safari on iOS exposes no PushManager until the app is on the home screen, so the
  // honest message is "add it first", not "your browser cannot do this".
  if (isIos && !installed) return 'ios-needs-install'
  if (!hasApi) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'supported'
}

/**
 * VAPID keys travel base64url; PushManager wants raw bytes.
 *
 * Built on an explicit ArrayBuffer so the result is a plain `Uint8Array<ArrayBuffer>` —
 * TypeScript's DOM types reject the `ArrayBufferLike` a bare `Uint8Array.from` produces,
 * because that could in principle be backed by a SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export interface SubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Asks for permission and registers with the push service.
 *
 * Must be called from a user gesture — Safari refuses a permission prompt that did not
 * originate from a tap, and Chrome penalises sites that ask on load.
 */
export async function subscribeToPush(publicKey: string): Promise<SubscriptionPayload | null> {
  if (detectSupport() !== 'supported') return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready

  // Reuse an existing registration rather than creating a parallel one for the same
  // device, which would deliver every notification twice.
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null

  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}
