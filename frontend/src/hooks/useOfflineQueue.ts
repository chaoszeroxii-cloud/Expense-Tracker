import { useCallback, useEffect, useRef, useState } from 'react'
import { expensesApi } from '../api'
import { useAuthStore } from '../store/auth.store'
import { toast } from '../store/toast.store'
import { useT } from '../store/i18n.store'
import { flush, listPending, type PendingExpense } from '../utils/offlineQueue'

export function useOfflineQueue() {
  const t = useT()
  const userId = useAuthStore(s => s.user?.id)
  const [entries, setEntries] = useState<PendingExpense[]>([])
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const refresh = useCallback(async () => {
    const next = userId ? await listPending(userId) : []
    if (useAuthStore.getState().user?.id === userId) setEntries(next)
  }, [userId])
  const drain = useCallback(async (force = true) => {
    if (!userId || syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await flush(userId, payload => {
        if (useAuthStore.getState().user?.id !== userId) throw new Error('Account changed')
        return expensesApi.create(payload)
      }, force)
      if (result.sent > 0 && useAuthStore.getState().user?.id === userId) {
        toast.success(`${t('offline_synced')} ${result.sent}`)
        window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard', 'transactions'] } }))
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refresh()
    }
  }, [userId, refresh, t])
  useEffect(() => {
    setEntries([])
    refresh()
    const online = () => { void drain(false) }
    const queued = () => { void refresh() }
    window.addEventListener('online', online)
    window.addEventListener('moneyflow:queued', queued)
    const timer = window.setInterval(online, 30000)
    online()
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('moneyflow:queued', queued)
    }
  }, [drain, refresh])
  return { pending: entries.length, entries, syncing, drain, refresh }
}
