import axios from 'axios'

/**
 * Turn an unknown thrown value into a message worth showing a user.
 *
 * Swallowing these (`catch {}`) is what made failed saves look like nothing happened:
 * the button un-pressed itself and the transaction was simply gone. Anything that can
 * fail a write must route through here.
 *
 * `fallback` should already be translated by the caller — this module has no access to
 * the i18n store.
 */
export function apiErrorMessage(err: unknown, fallback: string, offlineMessage?: string): string {
  if (!navigator.onLine && offlineMessage) return offlineMessage

  if (axios.isAxiosError(err)) {
    // Network-level failure: no response ever arrived.
    if (!err.response) return offlineMessage ?? fallback

    const data = err.response.data as { message?: unknown } | undefined
    const raw = data?.message

    // Nest's ValidationPipe returns `message` as an array of constraint failures.
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0]
    if (typeof raw === 'string' && raw.trim()) return raw
  }

  if (err instanceof Error && err.message) return err.message
  return fallback
}
