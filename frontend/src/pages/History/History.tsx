import { useState, useEffect, useRef } from 'react'
import Icon from '@mdi/react'
import { mdiTrashCan, mdiTune, mdiCash, mdiWallet } from '@mdi/js'
import clsx from 'clsx'
import { useExpenses, currentMonth } from '../../hooks'
import { expensesApi } from '../../api'
import { Amount, Empty, Skeleton, ConfirmModal } from '../../components/ui'
import IconDisplay from '../../components/ui/IconDisplay'
import { useT, useI18n } from '../../store/i18n.store'

function monthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function History() {
  const t          = useT()
  const { lang }   = useI18n()
  const [month, setMonth]   = useState(currentMonth())
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')
  const { data, loading, refetch } = useExpenses(month)
  const monthRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
  const [confirmState, setConfirmState] = useState<{
    open: boolean; message: string; onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  const askConfirm = (message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, message, onConfirm })
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }))

  // Scroll to current month on mount
  useEffect(() => {
    const button = monthRefs.current[month]
    if (button) {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [month])

  const filtered = data?.filter(e => filter === 'all' || e.type === filter) ?? []

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, e) => {
    const day = e.occurredAt.slice(0, 10)
    ;(acc[day] ??= []).push(e)
    return acc
  }, {})

  const handleDelete = async (id: string) => {
    askConfirm(t('delete_confirm'), async () => {
      closeConfirm()
      await expensesApi.remove(id)
      refetch()
    })
  }

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">{t('history')}</h1>
        <Icon path={mdiTune} size={0.8} className="text-muted-theme" />
      </div>

      {/* Month pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {Array.from({ length: 12 }, (_, i) => monthOffset(currentMonth(), -i)).reverse().map(m => (
          <button
            ref={el => { if (el) monthRefs.current[m] = el }}
            key={m}
            onClick={() => setMonth(m)}
            className={clsx(
              'flex-shrink-0 px-8 py-2 rounded-full text-xs font-semibold transition-colors',
              month === m
                ? 'bg-brand-600 text-white'
                : 'bg-card text-muted-theme border border-theme',
            )}
          >
            {new Date(m + '-01').toLocaleDateString(
              lang === 'th' ? 'th-TH' : 'en-US',
              { month: 'short', year: '2-digit' },
            )}
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1 mb-4">
        {(['all', 'expense', 'income'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
              filter === f
                ? 'bg-white dark:bg-slate-700 text-base-theme shadow-sm'
                : 'text-muted-theme',
            )}
          >
            {f === 'all' ? (
              <>{t('all')}</>
            ) : f === 'expense' ? (
              <><Icon path={mdiWallet} size={0.55} /> {t('expenses_tab')}</>
            ) : (
              <><Icon path={mdiCash} size={0.55} /> {t('income_tab2')}</>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty icon="�" title={t('no_transactions')} sub={t('try_filter')} />
      ) : (
        <div className="space-y-5 animate-fade-in">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, items]) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-theme uppercase tracking-wide">
                    {new Date(date + 'T00:00:00').toLocaleDateString(
                      lang === 'th' ? 'th-TH' : 'en-US',
                      { weekday: 'short', day: 'numeric', month: 'short' },
                    )}
                  </p>
                  <p className="text-xs font-semibold text-muted-theme">
                    {items.length} {items.length > 1 ? t('items') : t('item')}
                  </p>
                </div>

                {/* Items */}
                <div className="bg-card rounded-2xl border border-theme shadow-sm overflow-hidden">
                  {items.map((e, idx) => (
                    <div
                      key={e.id}
                      className={clsx(
                        'flex items-center gap-3 px-4 py-3.5 group',
                        idx !== items.length - 1 && 'border-b border-theme',
                      )}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: (e.category?.color ?? '#e2e8f0') + '22' }}
                      >
                        <IconDisplay icon={e.category?.icon ?? 'other'} color={e.category?.color} size="md" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-base-theme truncate">
                          {e.category?.name ?? 'Uncategorized'}
                        </p>
                        {e.note && (
                          <p className="text-xs text-muted-theme truncate">{e.note}</p>
                        )}
                        {e.allocation && (
                          <p className="text-[10px] text-brand-400 font-medium mt-0.5 flex items-center gap-1">
                            <span className="w-3 h-3 flex items-center justify-center">
                              <IconDisplay icon={e.allocation.icon ?? 'cash'} size={0.35} />
                            </span>
                            {e.allocation.name}
                          </p>
                        )}
                      </div>

                      <Amount value={e.amount} type={e.type} size="md" />

                      <button
                        onClick={() => handleDelete(e.id)}
                        className="ml-1 p-1.5 rounded-lg text-slate-300 dark:text-slate-600
                                   hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20
                                   transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Icon path={mdiTrashCan} size={0.65} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
      <ConfirmModal
        open={confirmState.open}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  )
}
