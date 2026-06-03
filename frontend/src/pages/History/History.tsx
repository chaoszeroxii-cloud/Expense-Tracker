import { useState, useEffect } from 'react'
import Icon from '@mdi/react'
import {
  mdiTrashCan, mdiChevronLeft, mdiChevronRight, mdiCash, mdiWallet, mdiClose,
  mdiTrayArrowDown, mdiFileDelimited, mdiFileDocumentOutline, mdiFilePdfBox, mdiLoading,
} from '@mdi/js'
import clsx from 'clsx'
import { useExpenses, currentMonth } from '../../hooks'
import { expensesApi } from '../../api'
import { Amount, Empty, Skeleton, ConfirmModal } from '../../components/ui'
import IconDisplay from '../../components/ui/IconDisplay'
import { useT, useI18n } from '../../store/i18n.store'
import { exportHistory, type ExportFormat } from '../../utils/exportHistory'

function monthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return { year: y, month: mo }
}

export default function History() {
  const t          = useT()
  const { lang }   = useI18n()
  const [month, setMonth]   = useState(currentMonth())
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => parseMonth(currentMonth()).year)
  const { data, loading, refetch } = useExpenses(month)
  const [confirmState, setConfirmState] = useState<{
    open: boolean; message: string; onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  const askConfirm = (message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, message, onConfirm })
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false }))

  // ── Export ───────────────────────────────────────────────────
  const [showExport, setShowExport]   = useState(false)
  const [exportFrom, setExportFrom]   = useState(currentMonth())
  const [exportTo, setExportTo]       = useState(currentMonth())
  const [exportFmt, setExportFmt]     = useState<ExportFormat>('csv')
  const [exporting, setExporting]     = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const [from, to] = exportFrom <= exportTo ? [exportFrom, exportTo] : [exportTo, exportFrom]
      const rows = await expensesApi.list({ from, to })
      if (!rows.length) { setExportError(t('export_empty')); return }
      await exportHistory(exportFmt, rows, { from, to, lang })
      setShowExport(false)
    } catch {
      setExportError(t('export_empty'))
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('transactions') || types.includes('dashboard')) refetch()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [refetch])

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

  const handlePickerSelect = (year: number, mo: number) => {
    const m = `${year}-${String(mo).padStart(2, '0')}`
    setMonth(m)
    setShowPicker(false)
  }

  const { year: curYear, month: curMo } = parseMonth(month)
  const { year: nowYear, month: nowMo } = parseMonth(currentMonth())

  const MONTH_NAMES_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const MONTH_NAMES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthNames = lang === 'th' ? MONTH_NAMES_TH : MONTH_NAMES_EN

  const displayLabel = new Date(month + '-01').toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-US',
    { month: 'long', year: 'numeric' },
  )

  const isFutureMonth = (y: number, mo: number) =>
    y > nowYear || (y === nowYear && mo > nowMo)

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">{t('history')}</h1>
        <button
          onClick={() => { setExportError(null); setShowExport(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/20
                     text-brand-600 text-xs font-semibold hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors"
        >
          <Icon path={mdiTrayArrowDown} size={0.7} />
          {t('export')}
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-card border border-theme rounded-2xl px-3 py-2 mb-4">
        <button
          onClick={() => setMonth(m => monthOffset(m, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--input)] text-muted-theme transition-colors"
        >
          <Icon path={mdiChevronLeft} size={1} />
        </button>

        <button
          onClick={() => {
            setPickerYear(curYear)
            setShowPicker(true)
          }}
          className="flex-1 text-center font-bold text-sm text-base-theme hover:text-brand-600 transition-colors py-1"
        >
          {displayLabel}
        </button>

        <button
          onClick={() => setMonth(m => monthOffset(m, 1))}
          disabled={curYear === nowYear && curMo >= nowMo}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--input)] text-muted-theme disabled:opacity-30 transition-colors"
        >
          <Icon path={mdiChevronRight} size={1} />
        </button>
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
        <Empty icon="📭" title={t('no_transactions')} sub={t('try_filter')} />
      ) : (
        <div className="space-y-5 animate-fade-in">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, items]) => (
              <div key={date}>
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

      {/* Month/Year Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40"
          onClick={() => setShowPicker(false)}>
          <div className="w-full max-w-sm bg-card rounded-3xl p-5 animate-fade-up"
            onClick={e => e.stopPropagation()}>

            {/* Picker header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base-theme">{t('select_month') ?? 'เลือกเดือน'}</h3>
              <button onClick={() => setShowPicker(false)} className="p-1 text-muted-theme">
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>

            {/* Year navigation */}
            <div className="flex items-center justify-between mb-4 bg-[var(--input)] rounded-xl px-3 py-2">
              <button
                onClick={() => setPickerYear(y => y - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-card text-muted-theme transition-colors"
              >
                <Icon path={mdiChevronLeft} size={0.9} />
              </button>
              <span className="font-bold text-base-theme text-sm">
                {lang === 'th' ? pickerYear + 543 : pickerYear}
              </span>
              <button
                onClick={() => setPickerYear(y => y + 1)}
                disabled={pickerYear >= nowYear}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-card text-muted-theme disabled:opacity-30 transition-colors"
              >
                <Icon path={mdiChevronRight} size={0.9} />
              </button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-2">
              {monthNames.map((name, idx) => {
                const mo = idx + 1
                const isSelected = pickerYear === curYear && mo === curMo
                const isFuture = isFutureMonth(pickerYear, mo)
                return (
                  <button
                    key={mo}
                    onClick={() => !isFuture && handlePickerSelect(pickerYear, mo)}
                    disabled={isFuture}
                    className={clsx(
                      'py-2.5 rounded-xl text-xs font-semibold transition-all',
                      isSelected
                        ? 'bg-brand-600 text-white shadow-sm'
                        : isFuture
                          ? 'text-muted-theme opacity-30 cursor-not-allowed'
                          : 'bg-[var(--input)] text-base-theme hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20',
                    )}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center p-4 bg-black/40"
          onClick={() => !exporting && setShowExport(false)}>
          <div className="w-full max-w-sm bg-card rounded-3xl p-5 animate-fade-up"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base-theme flex items-center gap-2">
                <Icon path={mdiTrayArrowDown} size={0.8} /> {t('export_history')}
              </h3>
              <button onClick={() => !exporting && setShowExport(false)} className="p-1 text-muted-theme">
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>

            {/* Month range */}
            <div className="flex gap-3 mb-4">
              <label className="flex-1">
                <span className="block text-xs font-semibold text-muted-theme mb-1">{t('export_from')}</span>
                <input
                  type="month"
                  value={exportFrom}
                  max={currentMonth()}
                  onChange={e => setExportFrom(e.target.value)}
                  className="w-full bg-[var(--input)] border border-theme rounded-xl px-3 py-2 text-sm text-base-theme"
                />
              </label>
              <label className="flex-1">
                <span className="block text-xs font-semibold text-muted-theme mb-1">{t('export_to')}</span>
                <input
                  type="month"
                  value={exportTo}
                  max={currentMonth()}
                  onChange={e => setExportTo(e.target.value)}
                  className="w-full bg-[var(--input)] border border-theme rounded-xl px-3 py-2 text-sm text-base-theme"
                />
              </label>
            </div>

            {/* Format picker */}
            <p className="text-xs font-semibold text-muted-theme mb-2">{t('export_format')}</p>
            <div className="space-y-2 mb-5">
              {([
                { id: 'csv', icon: mdiFileDelimited, label: 'CSV', desc: t('export_csv_desc') },
                { id: 'txt', icon: mdiFileDocumentOutline, label: 'TXT', desc: t('export_txt_desc') },
                { id: 'pdf', icon: mdiFilePdfBox, label: 'PDF', desc: t('export_pdf_desc') },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setExportFmt(f.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
                    exportFmt === f.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-theme hover:bg-[var(--input)]',
                  )}
                >
                  <Icon path={f.icon} size={0.9} className={exportFmt === f.id ? 'text-brand-600' : 'text-muted-theme'} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-base-theme">{f.label}</p>
                    <p className="text-xs text-muted-theme">{f.desc}</p>
                  </div>
                  <span className={clsx(
                    'w-4 h-4 rounded-full border-2',
                    exportFmt === f.id ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600',
                  )} />
                </button>
              ))}
            </div>

            {exportError && (
              <p className="text-xs text-rose-500 font-medium mb-3 text-center">{exportError}</p>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-600 text-white
                         font-semibold text-sm hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {exporting ? (
                <><Icon path={mdiLoading} size={0.8} className="animate-spin" /> {t('exporting')}</>
              ) : (
                <><Icon path={mdiTrayArrowDown} size={0.8} /> {t('export_download')}</>
              )}
            </button>
          </div>
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
