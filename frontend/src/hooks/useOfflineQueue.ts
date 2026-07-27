import { useCallback, useEffect, useState } from 'react'
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

  const refresh = useCallback(async () => {
    if (!userId) { setPending(0); return }
    setPending((await listPending(userId)).length)
  }, [userId])

  const drain = useCallback(async () => {
    if (!userId || syncing || !navigator.onLine) return
    const queued = await listPending(userId)
    if (queued.length === 0) return

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
      setSyncing(false)
      refresh()
    }
  }, [userId, syncing, refresh, t])

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
    // `drain` changes with `syncing`; re-subscribing on that would be churn for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return { pending, syncing, drain, refresh }
}
