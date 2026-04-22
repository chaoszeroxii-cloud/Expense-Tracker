import { useState } from 'react'
import Icon from '@mdi/react'
import {
  mdiPlus, mdiTrashCan, mdiPencil, mdiCheck,
  mdiClose, mdiChevronDown, mdiChevronUp,
} from '@mdi/js'
import clsx from 'clsx'
import { allocationsApi } from '../../api'
import { useAllocations, useCategories } from '../../hooks'
import { Card, Skeleton, IconDisplay, ConfirmModal } from '../ui'
import { ALLOCATION_ICONS } from '../../utils/iconMap'
import { useT } from '../../store/i18n.store'
import type { Allocation, EntryType } from '../../types'

const PRESET_COLORS = [
  '#6366f1','#f97316','#3b82f6','#a855f7','#ef4444',
  '#ec4899','#eab308','#14b8a6','#22c55e','#10b981',
]

interface FormState { name:string; icon:string; color:string; categoryIds:string[] }
const EMPTY: FormState = { name:'', icon:'salary', color:'#6366f1', categoryIds:[] }

export default function AllocationManager() {
  const t = useT()
  const { data: allocations, loading: loadingA, refetch } = useAllocations()
  const { data: categories,  loading: loadingC }          = useCategories()

  const [editId,   setEditId]   = useState<string|null>(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [form,     setForm]     = useState<FormState>(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [expanded, setExpanded] = useState<string|null>(null)
  const [confirmState, setConfirmState] = useState<{
    open: boolean; message: string; onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })
  const askConfirm = (message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, message, onConfirm })
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }))

  const allExpenseCats = categories?.filter(c => c.type === 'expense') ?? []

  const startAdd = () => { setEditId(null); setForm(EMPTY); setShowAdd(true) }
  const startEdit = (a: Allocation) => {
    setShowAdd(false); setEditId(a.id)
    setForm({ name: a.name, icon: a.icon??'💼', color: a.color??'#6366f1',
              categoryIds: a.categories.map(c => c.id) })
  }
  const cancel = () => { setShowAdd(false); setEditId(null) }

  const toggleCat = (id: string) =>
    setForm(f => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter(x => x !== id)
        : [...f.categoryIds, id],
    }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { name:form.name.trim(), icon:form.icon, color:form.color, categoryIds:form.categoryIds }
      editId ? await allocationsApi.update(editId, payload) : await allocationsApi.create(payload)
      cancel(); refetch()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    askConfirm(t('delete_wallet'), async () => {
      closeConfirm()
      await allocationsApi.remove(id)
      refetch()
    })
  }

  return (
    <Card padding={false}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-theme">
        <h2 className="font-bold text-base-theme text-sm">{t('wallets_title')}</h2>
        <button onClick={startAdd}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand-600
                     bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 rounded-full transition-colors">
          <Icon path={mdiPlus} size={0.6} /> {t('add')}
        </button>
      </div>

      {/* Form */}
      {(showAdd || editId) && (
        <div className="mx-5 my-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl space-y-4 animate-fade-up">
          <p className="text-xs font-bold text-muted-theme uppercase tracking-wide">
            {editId ? t('edit_wallet') : t('new_wallet')}
          </p>
          <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
            placeholder={t('wallet_name_ph')} maxLength={50}
            className="w-full px-3 py-2 rounded-xl border border-theme bg-input
                       text-sm font-medium text-base-theme outline-none focus:border-brand-400 transition-all" />

          {/* Icon */}
          <div>
            <p className="text-[10px] font-semibold text-muted-theme mb-2 uppercase tracking-wide">{t('icon')}</p>
            <div className="flex flex-wrap gap-2">
              {ALLOCATION_ICONS.map(ic => (
                <button key={ic.id} type="button" onClick={() => setForm(f=>({...f,icon:ic.id}))}
                  className={clsx('w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                    form.icon===ic.id ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-400'
                                   : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600')}
                  title={ic.label}>
                  <Icon path={ic.mdi} size={0.6} color="#666" />
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <p className="text-[10px] font-semibold text-muted-theme mb-2 uppercase tracking-wide">{t('color')}</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f=>({...f,color:c}))}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor:c, outline:form.color===c?`3px solid ${c}`:'none', outlineOffset:'2px' }} />
              ))}
            </div>
          </div>

          {/* Linked Categories */}
          <div>
            <p className="text-[10px] font-semibold text-muted-theme mb-1 uppercase tracking-wide">{t('linked_cats')}</p>
            <p className="text-[10px] text-muted-theme mb-2">{t('linked_cats_desc')}</p>
            {loadingC ? <Skeleton className="h-10 w-full" /> : (
              <div className="flex flex-wrap gap-2">
                {allExpenseCats.map(cat => {
                  const sel = form.categoryIds.includes(cat.id)
                  return (
                    <button key={cat.id} type="button" onClick={() => toggleCat(cat.id)}
                      className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                        sel ? 'text-white' : 'bg-slate-100 dark:bg-slate-700 text-muted-theme hover:bg-slate-200 dark:hover:bg-slate-600')}
                      style={sel ? { backgroundColor: form.color } : {}}>
                      <IconDisplay icon={cat.icon} size="sm" />
                      {cat.name}
                      {sel && <Icon path={mdiCheck} size={0.5} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Preview + actions */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: form.color+'22' }}>
              <IconDisplay icon={form.icon} color={form.color} size="md" />
            </div>
            <span className="flex-1 text-sm font-semibold text-base-theme truncate">
              {form.name || t('preview')}
            </span>
            <button onClick={cancel}
              className="p-2 rounded-xl bg-slate-200 dark:bg-slate-600 text-muted-theme">
              <Icon path={mdiClose} size={0.7} />
            </button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="p-2 rounded-xl bg-brand-600 text-white disabled:opacity-40">
              <Icon path={mdiCheck} size={0.7} />
            </button>
          </div>
        </div>
      )}

      {/* Wallet list */}
      <div className="pb-4">
        {loadingA ? (
          <div className="space-y-2 px-5">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !allocations?.length ? (
          <p className="text-center text-sm text-muted-theme py-8">{t('no_wallet_items')}</p>
        ) : (
          <ul className="divide-y divide-theme">
            {allocations.map(a => (
              <li key={a.id}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: (a.color??'#6366f1')+'22' }}>
                    <IconDisplay icon={a.icon??'💼'} color={a.color} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-base-theme truncate">{a.name}</p>
                    <p className="text-xs text-muted-theme">
                      ฿{Number(a.balance).toLocaleString()} · {a.categories.length} {a.categories.length!==1?t('categorys_pl'):t('categorys')}
                    </p>
                  </div>
                  <button onClick={() => setExpanded(expanded===a.id?null:a.id)}
                    className="p-1.5 rounded-lg text-muted-theme hover:text-base-theme transition-colors">
                    <Icon path={expanded===a.id?mdiChevronUp:mdiChevronDown} size={0.7} />
                  </button>
                  <button onClick={() => startEdit(a)}
                    className="p-1.5 rounded-lg text-muted-theme hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors">
                    <Icon path={mdiPencil} size={0.6} />
                  </button>
                  <button onClick={() => handleDelete(a.id)}
                    className="p-1.5 rounded-lg text-muted-theme hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                    <Icon path={mdiTrashCan} size={0.6} />
                  </button>
                </div>
                {expanded===a.id && a.categories.length>0 && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5 animate-fade-in">
                    {a.categories.map(c => (
                      <span key={c.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor:(a.color??'#6366f1')+'18', color:a.color??'#6366f1' }}>
                        <Icon path={c.icon} size={0.5} />
                        {c.name}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ConfirmModal
          open={confirmState.open}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={closeConfirm}
        />
      </div>
    </Card>
  )
}
