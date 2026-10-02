import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { captureApi } from '../../api'
import { useCategories, useFetch } from '../../hooks'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { readCsv, importDate } from '../../utils/importCsv'
import { fmt } from '../../utils/money'
import { ErrorState, ConfirmModal } from '../../components/ui'
import DayReview from '../../components/home/DayReview'
import type { CaptureRow, BatchPreview } from '../../types/companion'

type Draft = CaptureRow & { selected: boolean }
const newRow = (date: string): Draft => ({
  clientKey: crypto.randomUUID(),
  date,
  amount: 0,
  categoryId: '',
  type: 'expense',
  note: '',
  selected: true,
})
export default function BatchCapture() {
  const userId = useAuthStore((s) => s.user?.id)
  return <CaptureWorkspace key={userId} userId={userId ?? ''} />
}
function CaptureWorkspace({ userId }: { userId: string }) {
  const t = useT(),
    [params] = useSearchParams(),
    timezone = useAuthStore((s) => s.user?.timezone ?? 'Asia/Bangkok')
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const { data: categories, error: categoryError, refetch } = useCategories()
  const {
    data: receiptStatus,
    loading: receiptLoading,
    error: receiptError,
    refetch: retryReceipt,
  } = useFetch(captureApi.receiptStatus)
  const key = `flo_capture_draft_${userId}`
  const [rows, setRows] = useState<Draft[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null')
      if (
        Array.isArray(saved) &&
        saved.length <= 100 &&
        saved.every(
          (r) =>
            r &&
            typeof r.clientKey === 'string' &&
            typeof r.date === 'string' &&
            typeof r.note === 'string' &&
            ['expense', 'income'].includes(r.type),
        )
      )
        return saved
    } catch {
      /* a broken local draft cannot block capture */
    }
    return [newRow(params.get('date') || today)]
  })
  const [preview, setPreview] = useState<BatchPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmClear, setConfirmClear] = useState(false)
  const [csv, setCsv] = useState<string[][]>([]),
    [format, setFormat] = useState('iso')
  const [columns, setColumns] = useState({ date: 0, amount: 1, category: 2, note: 3, type: 4 })
  const [image, setImage] = useState<File | null>(null)
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(rows))
    } catch {
      /* unavailable storage */
    }
  }, [key, rows])
  const selected = rows.filter((r) => r.selected)
  const change = (id: string, patch: Partial<Draft>) => {
    setRows((all) => all.map((r) => (r.clientKey === id ? { ...r, ...patch } : r)))
    setPreview(null)
  }
  const payload = () => selected.map(({ selected: _selected, ...row }) => row)
  const report = (e: unknown) =>
    setError(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
  const append = (incoming: Draft[]) => {
    const current =
      rows.length === 1 && !rows[0].amount && !rows[0].note && !rows[0].categoryId ? [] : rows
    if (current.length + incoming.length > 100) throw new Error(t('dc_empty_csv'))
    setRows([...current, ...incoming])
    setPreview(null)
  }
  const totals = (type: string) =>
    selected.filter((r) => r.type === type).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  return (
    <div className="px-4 pt-6 pb-8 sm:px-6 space-y-6">
      <header>
        <Link className="text-action" to="/history">
          ← {t('nav_transactions')}
        </Link>
        <h1 className="page-heading">{t('dc_batch')}</h1>
        <p className="page-description">{t('dc_batch_hint')}</p>
      </header>
      {params.get('review') === '1' && (
        <section className="surface p-5">
          <DayReview initialOpen />
        </section>
      )}
      {categoryError && (
        <ErrorState message={categoryError} onRetry={refetch} retryLabel={t('action_retry')} />
      )}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <details className="surface p-5">
          <summary className="cursor-pointer font-bold min-h-8">{t('dc_csv')}</summary>
          <p className="page-description mb-3">{t('dc_csv_hint')}</p>
          <p className="text-xs text-muted-theme mb-3">{t('dc_csv_type_default')}</p>
          <a
            className="text-action text-xs"
            download="moneyflow-template.csv"
            href={
              'data:text/csv;charset=utf-8,' +
              encodeURIComponent(
                `\uFEFFdate,amount,category,note,type\r\n${today},60,,Coffee,expense\r\n`,
              )
            }
          >
            {t('dc_csv_template')}
          </a>
          <label className="field-label">
            {t('dc_file')}
            <input
              className="field-input"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                setError('')
                try {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 1_000_000) throw new Error(t('dc_empty_csv'))
                  const table = readCsv(await file.text())
                  setCsv(table)
                  const headers = table[0].map((s) => s.trim().toLowerCase())
                  const find = (names: string[], fallback: number) => {
                    const n = headers.findIndex((s) => names.includes(s))
                    return n >= 0 ? n : fallback
                  }
                  setColumns({
                    date: find(['date', 'วันที่'], 0),
                    amount: find(['amount', 'จำนวนเงิน', 'จำนวนเงิน (บาท)'], 1),
                    category: find(['category', 'หมวดหมู่'], 2),
                    note: find(['note', 'รายละเอียด'], 3),
                    type: find(['type', 'ประเภท'], -1),
                  })
                } catch (e) {
                  report(e)
                  setCsv([])
                }
                e.target.value = ''
              }}
            />
          </label>
          {!!csv.length && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {(['date', 'amount', 'category', 'note', 'type'] as const).map((field) => (
                <label key={field} className="field-label">
                  {t(
                    field === 'date'
                      ? 'date'
                      : field === 'category'
                        ? 'category'
                        : field === 'amount'
                          ? 'amount'
                          : field === 'note'
                            ? 'dc_note'
                            : 'dc_type',
                  )}
                  <select
                    className="field-input"
                    value={columns[field]}
                    onChange={(e) => setColumns({ ...columns, [field]: Number(e.target.value) })}
                  >
                    <option value={-1}>{t('dc_skip')}</option>
                    {csv[0].map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field-label">
                {t('dc_date_format')}
                <select
                  className="field-input"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="iso">YYYY-MM-DD</option>
                  <option value="dmy">DD/MM/YYYY (CE)</option>
                  <option value="thai">DD/MM/YYYY (พ.ศ.)</option>
                </select>
              </label>
              <button
                className="secondary-action sm:col-span-2"
                disabled={busy}
                onClick={() => {
                  setError('')
                  try {
                    append(
                      csv.slice(1).map((c) => {
                        const raw = (name: keyof typeof columns) => c[columns[name]]?.trim() ?? ''
                        if (
                          columns.type >= 0 &&
                          !/^(expense|income|รายรับ|รายจ่าย)$/i.test(raw('type'))
                        )
                          throw new Error(t('dc_csv_type_error'))
                        const type = /^(income|รายรับ)$/i.test(raw('type')) ? 'income' : 'expense'
                        const cat = categories?.find(
                          (x) =>
                            x.type === type &&
                            (x.name.toLowerCase() === raw('category').toLowerCase() ||
                              x.id === raw('category')),
                        )
                        return {
                          ...newRow(importDate(raw('date'), format)),
                          amount: Number(raw('amount').replace(/,/g, '')),
                          categoryId: cat?.id ?? '',
                          note: raw('note').slice(0, 500),
                          type,
                        }
                      }),
                    )
                    setCsv([])
                  } catch (e) {
                    report(e)
                  }
                }}
              >
                {t('dc_parse')}
              </button>
            </div>
          )}
        </details>
        <details className="surface p-5">
          <summary className="cursor-pointer font-bold min-h-8">{t('dc_receipt')}</summary>
          <p className="page-description mb-3">{t('dc_receipt_hint')}</p>
          {receiptError ? (
            <ErrorState
              compact
              message={receiptError}
              onRetry={retryReceipt}
              retryLabel={t('action_retry')}
            />
          ) : receiptLoading ? (
            <p className="text-sm text-muted-theme">{t('dc_working')}</p>
          ) : !receiptStatus?.configured ? (
            <p className="text-sm text-muted-theme">{t('dc_receipt_unavailable')}</p>
          ) : (
            <>
              <label className="field-label">
                {t('dc_file')}
                <input
                  className="field-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                className="secondary-action mt-3"
                disabled={!image || busy}
                onClick={async () => {
                  if (!image || busy) return
                  setBusy(true)
                  setError('')
                  try {
                    if (image.size > 5_000_000) throw new Error(t('dc_read_error'))
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader()
                      reader.onload = () => resolve(String(reader.result).split(',')[1])
                      reader.onerror = reject
                      reader.readAsDataURL(image)
                    })
                    const draft = await captureApi.receipt(base64, image.type)
                    append([
                      { ...newRow(draft.date ?? today), amount: draft.amount, note: draft.note },
                    ])
                    setImage(null)
                  } catch (e) {
                    report(e)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? t('dc_working') : t('dc_read')}
              </button>
            </>
          )}
        </details>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy) return
          if (!selected.length) {
            setError(t('dc_no_selection'))
            return
          }
          setBusy(true)
          setError('')
          try {
            setPreview(await captureApi.preview(payload()))
          } catch (e) {
            report(e)
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-4 min-w-0">
          <legend className="sr-only">{t('dc_batch')}</legend>
          {rows.map((row, index) => (
            <section
              className="surface p-4 sm:p-5"
              key={row.clientKey}
              aria-label={`${t('dc_row')} ${index + 1}`}
            >
              <div className="flex items-center justify-between mb-4">
                <label className="flex gap-2 items-center font-bold text-sm">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => change(row.clientKey, { selected: e.target.checked })}
                  />
                  {t('dc_row')} {index + 1}
                </label>
                <button
                  type="button"
                  className="text-action !text-xs"
                  aria-label={`${t('action_delete')} ${index + 1}`}
                  onClick={() => {
                    setRows(rows.filter((r) => r.clientKey !== row.clientKey))
                    setPreview(null)
                  }}
                >
                  {t('action_delete')}
                </button>
              </div>
              <fieldset
                disabled={!row.selected}
                className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-0"
              >
                <label className="field-label">
                  {t('date')}
                  <input
                    className="field-input"
                    required={row.selected}
                    type="date"
                    min="1900-01-01"
                    max={today}
                    value={row.date}
                    onChange={(e) => change(row.clientKey, { date: e.target.value })}
                  />
                </label>
                <label className="field-label">
                  {t('amount')}
                  <input
                    className="field-input"
                    required={row.selected}
                    type="number"
                    min="0.01"
                    max="9999999999.99"
                    step="0.01"
                    value={Number.isFinite(row.amount) && row.amount ? row.amount : ''}
                    onChange={(e) => change(row.clientKey, { amount: Number(e.target.value) })}
                  />
                </label>
                <label className="field-label">
                  {t('dc_type')}
                  <select
                    className="field-input"
                    value={row.type}
                    onChange={(e) =>
                      change(row.clientKey, {
                        type: e.target.value as Draft['type'],
                        categoryId: '',
                      })
                    }
                  >
                    <option value="expense">{t('expense')}</option>
                    <option value="income">{t('income')}</option>
                  </select>
                </label>
                <label className="field-label">
                  {t('category')}
                  <select
                    className="field-input"
                    required={row.selected}
                    value={row.categoryId}
                    onChange={(e) => change(row.clientKey, { categoryId: e.target.value })}
                  >
                    <option value="">{t('dc_select')}</option>
                    {categories
                      ?.filter((c) => c.type === row.type)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field-label col-span-2 lg:col-span-4">
                  {t('dc_note')}
                  <input
                    className="field-input"
                    maxLength={500}
                    value={row.note}
                    onChange={(e) => change(row.clientKey, { note: e.target.value })}
                  />
                </label>
              </fieldset>
            </section>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="secondary-action"
              disabled={rows.length >= 100}
              onClick={() => {
                setRows([...rows, newRow(rows[rows.length - 1]?.date || today)])
                setPreview(null)
              }}
            >
              {t('dc_add_row')}
            </button>
            <button className="primary-action" disabled={!selected.length || !!categoryError}>
              {t('dc_preview')}
            </button>
            <button type="button" className="text-action" onClick={() => setConfirmClear(true)}>
              {t('dc_clear')}
            </button>
          </div>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="text-expense surface p-4">
          {error}
        </p>
      )}
      {preview && (
        <section className="surface p-5 space-y-4" aria-label={t('dc_summary')}>
          <h2 className="section-title">
            {t('dc_summary')} · {selected.length}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p>
              {t('dc_expense_total')} <strong>฿{fmt(totals('expense'))}</strong>
            </p>
            <p>
              {t('dc_income_total')} <strong>฿{fmt(totals('income'))}</strong>
            </p>
          </div>
          {preview.rows
            .filter((r) => r.duplicate || r.alreadySaved)
            .map((result) => (
              <div className="rounded-xl bg-input p-3 text-sm" key={result.clientKey}>
                {rows.find((r) => r.clientKey === result.clientKey)?.note || t('dc_row')} ·{' '}
                {result.alreadySaved ? t('dc_already_saved') : t('dc_duplicate')}
                {result.duplicate && (
                  <label className="flex gap-2 mt-2">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={!!rows.find((r) => r.clientKey === result.clientKey)?.allowDuplicate}
                      onChange={(e) =>
                        setRows(
                          rows.map((r) =>
                            r.clientKey === result.clientKey
                              ? { ...r, allowDuplicate: e.target.checked }
                              : r,
                          ),
                        )
                      }
                    />
                    {t('dc_allow_duplicate')}
                  </label>
                )}
              </div>
            ))}
          <button
            className="primary-action w-full"
            disabled={
              busy ||
              preview.rows.some(
                (r) =>
                  r.duplicate && !rows.find((d) => d.clientKey === r.clientKey)?.allowDuplicate,
              )
            }
            onClick={async () => {
              if (busy) return
              setBusy(true)
              setError('')
              try {
                await captureApi.commit(payload())
                const remaining = rows.filter((row) => !row.selected)
                setRows(remaining)
                setPreview(null)
                try {
                  if (remaining.length) sessionStorage.setItem(key, JSON.stringify(remaining))
                  else sessionStorage.removeItem(key)
                } catch {
                  /* storage cannot turn a successful save into an error */
                }
                toast.success(t('dc_saved'))
                window.dispatchEvent(
                  new CustomEvent('moneyflow:refresh', {
                    detail: { types: ['transactions', 'dashboard', 'budget'] },
                  }),
                )
              } catch (e) {
                report(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? t('dc_working') : t('dc_commit')}
          </button>
        </section>
      )}
      <p className="text-xs text-muted-theme">{t('dc_draft_hint')}</p>
      <ConfirmModal
        open={confirmClear}
        message={t('dc_clear')}
        confirmLabel={t('dc_clear')}
        cancelLabel={t('action_cancel')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setRows([])
          setPreview(null)
          setConfirmClear(false)
        }}
      />
    </div>
  )
}
