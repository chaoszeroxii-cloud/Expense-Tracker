import { useCallback, useEffect, useRef, useState } from 'react'
import { expensesApi } from '../api'
import { useAuthStore } from '../store/auth.store'
import { toast } from '../store/toast.store'
import { useT } from '../store/i18n.store'
import { flush, listPending } from '../utils/offlineQueue'

/**
 * Watches the offline queue and drains it whenever the connection comes back.
 *
 * Mounted once at the app shell. The count is surfaced on Home so a pending entry is
 * visible rather than something the user has to trust is still there.
 */
export function useOfflineQueue() {
  const t = useT()
  const userId = useAuthStore(s => s.user?.id)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  // The guard has to be a ref, not the state above.
  //
  // `drain` read `syncing` from its closure, and the `online` listener below is
  // registered once with `[userId]` as its deps — so it kept the `drain` from the very
  // first render forever, in which `syncing` is permanently `false`. Two `online` events
  // in quick succession therefore both passed the check and flushed the queue twice,
  // creating every queued transaction a second time. A ref is read at call time, so it
  // reflects reality no matter which closure is holding it.
  const syncingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!userId) { setPending(0); return }
    setPending((await listPending(userId)).length)
  }, [userId])

  const drain = useCallback(async () => {
    if (!userId || syncingRef.current || !navigator.onLine) return
    const queued = await listPending(userId)
    if (queued.length === 0) return

    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await flush(userId, payload => expensesApi.create(payload))
      if (result.sent > 0) {
        toast.success(`${t('offline_synced')} ${result.sent}`)
        window.dispatchEvent(new CustomEvent('moneyflow:refresh', {
          detail: { types: ['dashboard', 'transactions'] },
        }))
      }
      // Silently discarding a transaction the server rejected would be the same
      // disappearing act the queue exists to prevent.
      if (result.dropped > 0) toast.error(`${t('offline_dropped')} ${result.dropped}`)
    } finally {
      syncingRef.current = false
      setSyncing(false)
      refresh()
    }
  }, [userId, refresh, t])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!userId) return
    const onOnline = () => { drain() }
    const onQueued = () => { refresh() }

    window.addEventListener('online', onOnline)
    window.addEventListener('moneyflow:queued', onQueued)
    // Also try on mount: the browser may have reconnected while the tab was closed.
    drain()

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('moneyflow:queued', onQueued)
    }
    // `drain` is stable now that it no longer closes over `syncing` — the reentrancy
    // guard is a ref. Still pinned to `[userId]` so the listeners are registered once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return { pending, syncing, drain, refresh }
}
