import Icon from '@mdi/react'
import { mdiCloudUploadOutline, mdiLoading } from '@mdi/js'
import { useT } from '../../store/i18n.store'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'

/**
 * Transactions captured without a connection, still waiting to reach the server.
 *
 * Shown rather than hidden: the whole point of the queue is that a save made in a
 * basement food court is not lost, and the user can only believe that if they can see
 * the entry sitting there. Silence would be indistinguishable from having dropped it.
 */
export default function PendingSyncBanner() {
  const t = useT()
  const { pending, syncing, drain } = useOfflineQueue()

  if (pending === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 animate-fade-up
                    bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
      <Icon
        path={syncing ? mdiLoading : mdiCloudUploadOutline}
        size={0.8}
        color="#f59e0b"
        className={syncing ? 'animate-spin shrink-0' : 'shrink-0'}
      />
      <p className="flex-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
        {pending} {t('offline_pending')}
      </p>
      <button
        onClick={drain}
        disabled={syncing || !navigator.onLine}
        className="shrink-0 text-xs font-bold text-amber-700 dark:text-amber-300 underline
                   underline-offset-2 disabled:opacity-50 disabled:no-underline"
      >
        {syncing ? t('offline_syncing') : t('offline_sync_now')}
      </button>
    </div>
  )
}
