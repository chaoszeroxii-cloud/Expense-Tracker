import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { expensesApi, planningApi } from '../../api'
import type { Expense } from '../../types'
import { useFetch } from '../../hooks'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { shiftDateLocal } from '../../utils/localDate'
import { fmt } from '../../utils/money'
import { ErrorState } from '../ui'
export default function BillReminders() {
  const t = useT(),
    { data, error, refetch } = useFetch(planningApi.reminders)
  const [params] = useSearchParams(),
    openedLink = useRef('')
  const [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState({ enabled: false, daysBefore: 3 })
  const [selected, setSelected] = useState(''),
    [entries, setEntries] = useState<Expense[]>([]),
    [entryId, setEntryId] = useState(''),
    [linking, setLinking] = useState(false),
    [query, setQuery] = useState(''),
    [linkError, setLinkError] = useState('')
  useEffect(() => {
    const key = `${params.get('bill')}-${params.get('month')}`
    if (openedLink.current === key || !data?.bills.some((b) => `${b.id}-${b.month}` === key)) return
    openedLink.current = key
    setSelected(key)
    requestAnimationFrame(() =>
      document.getElementById(`reminder-${key}`)?.scrollIntoView({ block: 'center' }),
    )
  }, [params, data])
  useEffect(() => {
    if (!linking || !data) return
    let active = true
    setEntries([])
    setEntryId('')
    setLinkError('')
    const timer = setTimeout(() => {
      expensesApi
        .page({ month: data.today.slice(0, 7), type: 'expense', search: query })
        .then((page) => {
          if (active) setEntries(page.items)
        })
        .catch((e) => {
          if (active) setLinkError(apiErrorMessage(e, t('err_load_failed'), t('err_offline')))
        })
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [linking, query, data?.today, t])
  useEffect(() => {
    const run = () => {
      void refetch()
    }
    window.addEventListener('moneyflow:refresh', run)
    return () => window.removeEventListener('moneyflow:refresh', run)
  }, [refetch])
  const report = (e: unknown) =>
    toast.error(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
  return (
    <section className="surface p-5" aria-label={t('dc_reminders')}>
      <div className="flex justify-between gap-3">
        <h2 className="section-title">{t('dc_reminders')}</h2>
        <button
          className="text-action !text-xs"
          disabled={!data}
          onClick={() => {
            if (data) setForm(data.preferences)
            setEditing(!editing)
          }}
        >
          {t('dc_manage')}
        </button>
      </div>
      <p className="page-description mb-3">{t('dc_reminder_hint')}</p>
      {error ? (
        <ErrorState compact message={error} onRetry={refetch} retryLabel={t('action_retry')} />
      ) : (
        data && (
          <ul className="divide-y divide-[var(--border)]">
            {data.bills.map((b) => (
              <li key={`${b.id}-${b.month}`} id={`reminder-${b.id}-${b.month}`} className="py-3">
                <div className="flex justify-between gap-3 text-sm">
                  <strong className="break-words min-w-0">{b.name}</strong>
                  <span className="shrink-0">฿{fmt(b.amount)}</span>
                </div>
                <p className="text-xs text-muted-theme mt-1">
                  {t('dc_due')}: {b.dueDate}
                  {b.snoozedUntil && b.snoozedUntil > data.today
                    ? ` · ${t('dc_snoozed')} ${b.snoozedUntil}`
                    : ''}
                </p>
                <div className="flex gap-4 flex-wrap">
                  <button
                    className="text-action !text-xs"
                    disabled={busy}
                    onClick={() => {
                      setSelected(selected === `${b.id}-${b.month}` ? '' : `${b.id}-${b.month}`)
                      setLinking(false)
                      setEntryId('')
                    }}
                  >
                    {t('dc_open_bill')} →
                  </button>
                  <button
                    className="text-action !text-xs"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await planningApi.snoozeBill(b.id, b.month, shiftDateLocal(data.today, 1))
                        await refetch()
                      } catch (e) {
                        report(e)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    {t('dc_snooze')}
                  </button>
                </div>
                {selected === `${b.id}-${b.month}` && (
                  <div className="rounded-xl bg-input p-4 space-y-3">
                    <p className="text-xs text-muted-theme">{t('life_pay_hint')}</p>
                    <button
                      className="secondary-action"
                      disabled={busy}
                      onClick={() => setLinking(!linking)}
                    >
                      {t('life_link_existing')}
                    </button>
                    {linking && (
                      <>
                        <label className="field-label">
                          {t('dc_week_details')}
                          <input
                            className="field-input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                        <select
                          aria-label={t('life_link_existing')}
                          className="field-input"
                          value={entryId}
                          onChange={(e) => setEntryId(e.target.value)}
                        >
                          <option value="">{t('dc_select')}</option>
                          {entries.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.note || e.category?.name} · ฿{fmt(e.amount)}
                            </option>
                          ))}
                        </select>
                        {linkError && (
                          <p role="alert" className="text-expense text-xs">
                            {linkError}
                          </p>
                        )}
                      </>
                    )}
                    <button
                      className="primary-action w-full"
                      disabled={busy || (linking && !entryId)}
                      onClick={async () => {
                        if (busy) return
                        setBusy(true)
                        try {
                          await planningApi.payBill(b.id, linking ? entryId : undefined, b.month)
                          setSelected('')
                          await refetch()
                          window.dispatchEvent(
                            new CustomEvent('moneyflow:refresh', {
                              detail: { types: ['transactions', 'dashboard', 'planning'] },
                            }),
                          )
                          toast.success(t('life_payment_saved'))
                        } catch (e) {
                          report(e)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      {t(linking ? 'action_confirm' : 'life_pay_record')}
                      {!linking ? ` · ฿${fmt(b.amount)}` : ''}
                    </button>
                  </div>
                )}
              </li>
            ))}
            {!data.bills.length && (
              <li className="text-sm text-muted-theme py-3">{t('dc_no_bills')}</li>
            )}
          </ul>
        )
      )}
      {editing && (
        <form
          className="mt-3 border-t border-theme pt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            try {
              await planningApi.saveReminders(form)
              await refetch()
              setEditing(false)
            } catch (e) {
              report(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t('dc_reminder_push')}
          </label>
          <label className="field-label">
            {t('dc_days_before')}
            <input
              className="field-input"
              type="number"
              min={0}
              max={14}
              required
              value={form.daysBefore}
              onChange={(e) => setForm({ ...form, daysBefore: Number(e.target.value) })}
            />
          </label>
          <Link to="/settings" className="block text-xs text-muted-theme underline leading-relaxed">
            {t('dc_push_setup')}
          </Link>
          <button className="primary-action" disabled={busy}>
            {t('save')}
          </button>
        </form>
      )}
    </section>
  )
}
