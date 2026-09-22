import { useState } from 'react'
import { useT } from '../../store/i18n.store'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'
import { useCategories } from '../../hooks'
import { remove, revise, type PendingExpense } from '../../utils/offlineQueue'
import { toast } from '../../store/toast.store'
import ConfirmModal from '../ui/ConfirmModal'

export default function PendingSyncBanner() {
  const t = useT()
  const { pending, entries, syncing, drain, refresh } = useOfflineQueue()
  const { data: categories } = useCategories()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<PendingExpense | null>(null)
  const [discard, setDiscard] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (!pending) return null
  return <section className="rounded-2xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-base-theme">
    <div className="flex gap-3 items-center flex-wrap">
      <button className="flex-1 text-left text-sm font-semibold" onClick={() => setExpanded(!expanded)}>{pending} {t('offline_pending')} · {t('offline_review')}</button>
      <button className="text-action" onClick={() => void drain()} disabled={syncing || saving || !navigator.onLine}>{syncing ? t('offline_syncing') : t('offline_sync_now')}</button>
    </div>
    {expanded && <ul className="divide-y divide-amber-200 mt-3">{entries.map(entry => <li key={entry.id} className="py-3 text-sm">
      <p>{entry.payload.note || categories?.find(c => c.id === entry.payload.categoryId)?.name || t('category')} · ฿{Number(entry.payload.amount).toLocaleString('th-TH')}</p>
      <p className="text-xs text-muted-theme mt-1">{entry.needsReview ? t('offline_needs_review') : t('offline_retained')}</p>
      <div className="flex gap-4 mt-2">
        {entry.needsReview && <button disabled={syncing || saving} className="text-action" onClick={() => setEditing({ ...entry, payload: { ...entry.payload } })}>{t('action_edit')}</button>}
        <button disabled={syncing || saving} className="text-rose-600" onClick={() => setDiscard(entry.id)}>{t('action_delete')}</button>
      </div>
      {editing?.id === entry.id && <form className="mt-3 grid gap-3" onSubmit={async e => {
        e.preventDefault(); if (saving) return; setSaving(true)
        try { await revise(entry.userId, entry.id, editing.payload); setEditing(null); await refresh(); await drain() }
        catch { toast.error(t('err_save_failed')) } finally { setSaving(false) }
      }}>
        <label>{t('amount')}<input className="block w-full p-2 bg-card rounded-lg" type="number" required min="0.01" max="9999999999.99" step="0.01" value={editing.payload.amount} onChange={e => setEditing({ ...editing, payload: { ...editing.payload, amount: Number(e.target.value) } })} /></label>
        <label>{t('category')}<select className="block w-full p-2 bg-card rounded-lg" required value={editing.payload.categoryId} onChange={e => setEditing({ ...editing, payload: { ...editing.payload, categoryId: e.target.value } })}>
          <option value="">{t('category')}</option>{categories?.filter(c => c.type === editing.payload.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <button type="submit" className="primary-action" disabled={saving || syncing}>{t('save')}</button>
      </form>}
    </li>)}</ul>}
    <ConfirmModal open={!!discard} message={t('offline_discard_confirm')} confirmLabel={t('action_delete')} cancelLabel={t('action_cancel')}
      onCancel={() => setDiscard(null)} onConfirm={() => { if (discard && !syncing) void remove(discard).then(refresh); setDiscard(null) }} />
  </section>
}
