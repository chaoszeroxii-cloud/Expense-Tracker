import { useRef, useState } from 'react'
import Icon from '@mdi/react'
import {
  mdiCalendarCheckOutline,
  mdiFlagOutline,
  mdiPlus,
  mdiPencilOutline,
  mdiCheck,
  mdiClose,
} from '@mdi/js'
import { expensesApi, planningApi } from '../../api'
import { usePlanning } from '../../hooks'
import { useT, useI18n } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import type { Category, Expense } from '../../types'
import type {
  Bill,
  BillInput,
  GoalInput,
  SavingsGoal,
} from '../../types/planning'
import { ErrorState, Skeleton } from '../ui'
import ConfirmModal from '../ui/ConfirmModal'

const inputClass =
  'w-full mt-1.5 rounded-xl border border-theme bg-[var(--input)] px-3 py-3 text-sm text-base-theme outline-none focus:border-brand-500'
const secondary =
  'min-h-11 px-4 py-2 rounded-xl border border-theme text-sm font-semibold text-base-theme disabled:opacity-50'
type BillForm = {
  id?: string
  month?: string
  name: string
  amount: string
  categoryId: string
  dueDay: string
}
type GoalForm = {
  id?: string
  name: string
  targetAmount: string
  savedAmount: string
  targetDate: string
}

/** Bills are commitments inside the monthly limit; savings are self-reported progress. */
export default function LifePlanning({
  categories,
  month,
  planning,
}: {
  categories: Category[]
  month: string
  planning: ReturnType<typeof usePlanning>
}) {
  const t = useT()
  const { lang } = useI18n()
  const { data, loading, error, refetch } = planning
  const [billForm, setBillForm] = useState<BillForm | null>(null)
  const [goalForm, setGoalForm] = useState<GoalForm | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)
  const [linking, setLinking] = useState(false)
  const [entries, setEntries] = useState<Expense[] | null>(null)
  const [entryId, setEntryId] = useState('')
  const [linkError, setLinkError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [confirm, setConfirm] = useState<{
    message: string
    run: () => Promise<unknown>
  } | null>(null)
  const dateLabel = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(
      lang === 'th' ? 'th-TH' : 'en-US',
      { day: 'numeric', month: 'short', year: 'numeric' },
    )

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
      setBillForm(null)
      setGoalForm(null)
      setPaying(null)
      setConfirm(null)
      toast.success(message)
      await refetch()
      window.dispatchEvent(
        new CustomEvent('moneyflow:refresh', {
          detail: { types: ['dashboard', 'transactions'] },
        }),
      )
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function editBill(b?: Bill) {
    setPaying(null)
    setBillForm(
      b
        ? {
            id: b.id,
            month: b.month !== data?.month || !b.active ? b.month : undefined,
            name: b.name,
            amount: String(b.amount),
            categoryId: b.categoryId ?? '',
            dueDay: String(b.dueDay),
          }
        : {
            name: '',
            amount: '',
            categoryId: categories[0]?.id ?? '',
            dueDay: '1',
          },
    )
  }
  function editGoal(g?: SavingsGoal) {
    setGoalForm(
      g
        ? {
            id: g.id,
            name: g.name,
            targetAmount: String(g.targetAmount),
            savedAmount: String(g.savedAmount),
            targetDate: g.targetDate,
          }
        : { name: '', targetAmount: '', savedAmount: '0', targetDate: '' },
    )
  }
  async function loadEntries() {
    if (!data) return
    setLinking(true)
    setEntries(null)
    setLinkError('')
    try {
      const linked = new Set(data.bills.map((b) => b.expenseId))
      setEntries(
        (await expensesApi.exportAll({ month: data.month, type: 'expense' })).filter(
          (e) => !linked.has(e.id),
        ),
      )
    } catch (err) {
      setLinkError(apiErrorMessage(err, t('err_load_failed'), t('err_offline')))
    }
  }

  if (loading && !data) return <div className="grid xl:grid-cols-2 gap-5">
    <Skeleton className="h-72 w-full rounded-3xl" />
    <Skeleton className="h-72 w-full rounded-3xl" />
  </div>
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={refetch}
        retryLabel={t('action_retry')}
      />
    )
  if (!data) return null
  if (data.month !== month)
    return (
      <p className="text-sm text-muted-theme px-1">{t('life_current_only')}</p>
    )

  const unpaid = data.bills.filter((b) => !b.expenseId)
  const paidCount = data.bills.length - unpaid.length
  const goalMonthly = data.goals.reduce((sum, g) => sum + g.monthlyNeeded, 0)

  return (
    <div className="grid xl:grid-cols-2 gap-5 items-stretch" data-planning-grid>
      <section className="surface p-5 sm:p-6 flex flex-col min-h-72" aria-labelledby="bills-title">
        <div className="flex items-start gap-3 mb-4">
          <span className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-brand-600">
            <Icon path={mdiCalendarCheckOutline} size={0.9} />
          </span>
          <div className="flex-1">
            <h2 id="bills-title" className="section-title">
              {t('life_bills')}
            </h2>
            <p className="text-xs text-muted-theme mt-1.5 leading-relaxed">
              {t('life_bills_hint')}
            </p>
          </div>
        </div>
        {data.bills.length > 0 && (
          <div className="flex items-baseline justify-between gap-3 bg-[var(--input)] rounded-2xl p-4 mb-3">
            <div>
              <p className="text-xs text-muted-theme">{t('life_reserved')}</p>
              <p className="text-2xl font-bold text-base-theme tabular-nums mt-1">
                ฿{fmt(data.unpaidBills)}
              </p>
            </div>
            <span className="text-xs text-muted-theme">
              {paidCount}/{data.bills.length} {t('life_paid')}
            </span>
          </div>
        )}
        {data.bills.length === 0 && !billForm && (
          <p className="text-sm text-muted-theme leading-relaxed py-5">
            {t('life_bills_empty')}
          </p>
        )}
        <ul className="flex-1 divide-y divide-[var(--border)]">
          {[...data.bills]
            .sort((a, b) => Number(!!a.expenseId) - Number(!!b.expenseId))
            .map((b) => (
              <li key={`${b.id}-${b.month}`} className="py-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-base-theme break-words">
                      {b.name}
                    </p>
                    <p
                      className={`text-xs mt-1.5 ${b.status === 'overdue' ? 'text-rose-500' : 'text-muted-theme'}`}
                    >
                      {b.expenseId
                        ? t('life_paid')
                        : b.status === 'overdue'
                          ? t('life_overdue')
                          : t('life_due')}{' '}
                      · {dateLabel(b.paidDate ?? b.dueDate)}
                    </p>
                  </div>
                  <p className="font-bold text-base-theme tabular-nums shrink-0">
                    ฿{fmt(b.paidAmount ?? b.amount)}
                  </p>
                </div>
                <div className="flex justify-end items-center gap-2 mt-2">
                  {!b.expenseId && <button disabled={busy} className="text-xs text-muted-theme min-h-11" onClick={() => setConfirm({
                    message: t('life_waive_confirm'), run: () => planningApi.waiveOccurrence(b.id, b.month),
                  })}>{t('life_waive')}</button>}
                  {((b.active && b.month === data.month) || !b.expenseId) && (
                    <button
                      disabled={busy}
                      onClick={() => editBill(b)}
                      className="min-h-11 px-3 text-muted-theme"
                      aria-label={`${t('action_edit')} ${b.name}`}
                    >
                      <Icon path={mdiPencilOutline} size={0.75} />
                    </button>
                  )}
                  {b.expenseId ? (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-600">
                      <Icon path={mdiCheck} size={0.65} />
                      {t('life_recorded')}
                    </span>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setPaying(b)
                        setBillForm(null)
                        setLinking(false)
                        setEntryId('')
                        setLinkError('')
                      }}
                      className="text-action min-h-11"
                    >
                      {t('life_pay')}
                    </button>
                  )}
                </div>
                {paying?.id === b.id && paying?.month === b.month && (
                  <div className="bg-[var(--input)] border border-theme rounded-2xl p-4 mt-2 space-y-3">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-xs text-muted-theme leading-relaxed">
                        {t('life_pay_hint')}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => setPaying(null)}
                        aria-label={t('action_cancel')}
                        className="p-2"
                      >
                        <Icon path={mdiClose} size={0.7} />
                      </button>
                    </div>
                    {!linking ? (
                      <>
                        <button
                          disabled={busy || !b.categoryId}
                          className="primary-action w-full"
                          onClick={() =>
                            mutate(
                              () => planningApi.payBill(b.id, undefined, b.month),
                              t('life_payment_saved'),
                            )
                          }
                        >
                          {t('life_pay_record')} ฿{fmt(b.amount)}
                        </button>
                        {!b.categoryId && (
                          <p className="text-xs text-rose-500">
                            {t('life_category_missing')}
                          </p>
                        )}
                        <button
                          disabled={busy}
                          onClick={loadEntries}
                          className={`${secondary} w-full`}
                        >
                          {t('life_link_existing')}
                        </button>
                      </>
                    ) : (
                      <>
                        <label className="block text-xs font-semibold text-base-theme">
                          {t('life_choose_entry')}
                          <select
                            className={inputClass}
                            value={entryId}
                            onChange={(e) => setEntryId(e.target.value)}
                            disabled={busy || !entries}
                          >
                            <option value="">{t('life_choose_entry')}</option>
                            {entries?.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.note || e.category?.name} · ฿{fmt(e.amount)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {linkError ? (
                          <ErrorState
                            compact
                            message={linkError}
                            onRetry={loadEntries}
                            retryLabel={t('action_retry')}
                          />
                        ) : (
                          entries?.length === 0 && (
                            <p className="text-xs text-muted-theme">
                              {t('life_no_entries')}
                            </p>
                          )
                        )}
                        <button
                          className="primary-action w-full"
                          disabled={!entryId || busy}
                          onClick={() =>
                            mutate(
                              () => planningApi.payBill(b.id, entryId, b.month),
                              t('life_payment_saved'),
                            )
                          }
                        >
                          {t('life_link_confirm')}
                        </button>
                        <button
                          className={`${secondary} w-full`}
                          disabled={busy}
                          onClick={() => setLinking(false)}
                        >
                          {t('action_back')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
        </ul>
        {billForm ? (
          <form
            className="space-y-4 rounded-2xl bg-[var(--input)] border border-theme p-4 mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              const payload: BillInput = {
                name: billForm.name.trim(),
                amount: Number(billForm.amount),
                categoryId: billForm.categoryId,
                dueDay: Number(billForm.dueDay),
              }
              void mutate(
                () => billForm.id && billForm.month
                  ? planningApi.updateOccurrence(billForm.id, billForm.month, payload)
                  : planningApi.saveBill(payload, billForm.id),
                t('life_saved'),
              )
            }}
          >
            <h3 className="text-sm font-bold text-base-theme">
              {billForm.id ? t('life_edit_bill') : t('life_add_bill')}
            </h3>
            <label className="block text-xs font-semibold text-base-theme">
              {t('life_bill_name')}
              <input
                autoFocus
                required
                maxLength={100}
                className={inputClass}
                value={billForm.name}
                placeholder={t('life_bill_example')}
                onChange={(e) =>
                  setBillForm({ ...billForm, name: e.target.value })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-base-theme">
                {t('amount')}
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  className={inputClass}
                  value={billForm.amount}
                  onChange={(e) =>
                    setBillForm({ ...billForm, amount: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-base-theme">
                {t('life_due_day')}
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  className={inputClass}
                  value={billForm.dueDay}
                  onChange={(e) =>
                    setBillForm({ ...billForm, dueDay: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-base-theme">
              {t('category')}
              <select
                required
                className={inputClass}
                value={billForm.categoryId}
                onChange={(e) =>
                  setBillForm({ ...billForm, categoryId: e.target.value })
                }
              >
                <option value="">{t('category')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-theme leading-relaxed">
              {billForm.month ? `${t('life_cycle_only')} ${billForm.month}` : t('life_bill_repeat')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className={`${secondary} flex-1`}
                onClick={() => setBillForm(null)}
              >
                {t('action_cancel')}
              </button>
              <button
                disabled={busy || !billForm.name.trim()}
                type="submit"
                className="primary-action flex-1"
              >
                {busy ? t('saving') : t('save')}
              </button>
            </div>
            {billForm.id && !billForm.month && (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 w-full text-xs text-rose-500"
                onClick={() =>
                  setConfirm({
                    message: t('life_archive_confirm'),
                    run: () => planningApi.archiveBill(billForm.id!),
                  })
                }
              >
                {t('life_archive_bill')}
              </button>
            )}
          </form>
        ) : (
          <button
            disabled={busy}
            onClick={() => editBill()}
            className={`${secondary} flex items-center justify-center gap-2 w-full mt-3 border-dashed`}
          >
            <Icon path={mdiPlus} size={0.75} />
            {t('life_add_bill')}
          </button>
        )}
      </section>

      <section className="surface p-5 sm:p-6 flex flex-col min-h-72" aria-labelledby="goals-title">
        <div className="flex items-start gap-3 mb-4">
          <span className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600">
            <Icon path={mdiFlagOutline} size={0.9} />
          </span>
          <div className="flex-1">
            <h2 id="goals-title" className="section-title">
              {t('life_goals')}
            </h2>
            <p className="text-xs text-muted-theme mt-1.5 leading-relaxed">
              {t('life_goals_hint')}
            </p>
          </div>
        </div>
        {goalMonthly > 0 && (
          <div className="rounded-2xl bg-[var(--input)] p-4 mb-3">
            <p className="text-xs text-muted-theme">
              {t('life_monthly_saving')}
            </p>
            <p className="text-2xl font-bold text-base-theme tabular-nums mt-1">
              ฿{fmt(goalMonthly)}
            </p>
            <p className="text-xs text-muted-theme mt-2 leading-relaxed">
              {t('life_saving_rule')}
            </p>
          </div>
        )}
        {data.goals.length === 0 && !goalForm && (
          <p className="text-sm text-muted-theme leading-relaxed py-5">
            {t('life_goals_empty')}
          </p>
        )}
        <ul className="flex-1 divide-y divide-[var(--border)]">
          {data.goals.map((g) => (
            <li key={g.id} className="py-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-base-theme break-words">
                    {g.name}
                  </h3>
                  <p
                    className={`text-xs mt-1.5 ${g.status === 'overdue' ? 'text-rose-500' : 'text-muted-theme'}`}
                  >
                    {g.status === 'complete'
                      ? t('life_complete')
                      : `${g.status === 'overdue' ? t('life_goal_overdue') : t('life_by')} ${dateLabel(g.targetDate)}`}
                  </p>
                </div>
                <button
                  className="min-h-11 px-3 text-brand-600"
                  disabled={busy}
                  onClick={() => editGoal(g)}
                  aria-label={`${t('action_edit')} ${g.name}`}
                >
                  <Icon path={mdiPencilOutline} size={0.75} />
                </button>
              </div>
              <div className="flex justify-between text-xs mt-3 mb-2 text-muted-theme gap-2">
                <span>
                  {t('life_saved_amount')} ฿{fmt(g.savedAmount)}
                </span>
                <span>฿{fmt(g.targetAmount)}</span>
              </div>
              <progress
                className="goal-progress w-full h-2 block"
                value={Math.min(g.savedAmount, g.targetAmount)}
                max={g.targetAmount}
                aria-label={g.name}
              />
              {g.status !== 'complete' && (
                <p className="text-xs text-muted-theme mt-2">
                  {t('life_monthly_needed')} ฿{fmt(g.monthlyNeeded)}
                </p>
              )}
            </li>
          ))}
        </ul>
        {goalForm ? (
          <form
            className="space-y-4 rounded-2xl bg-[var(--input)] border border-theme p-4 mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              const payload: GoalInput = {
                name: goalForm.name.trim(),
                targetAmount: Number(goalForm.targetAmount),
                savedAmount: Number(goalForm.savedAmount),
                targetDate: goalForm.targetDate,
              }
              void mutate(
                () => planningApi.saveGoal(payload, goalForm.id),
                t('life_saved'),
              )
            }}
          >
            <h3 className="text-sm font-bold text-base-theme">
              {goalForm.id ? t('life_edit_goal') : t('life_add_goal')}
            </h3>
            <label className="block text-xs font-semibold text-base-theme">
              {t('life_goal_name')}
              <input
                autoFocus
                required
                maxLength={100}
                className={inputClass}
                value={goalForm.name}
                placeholder={t('life_goal_example')}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, name: e.target.value })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-base-theme">
                {t('life_target_amount')}
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  className={inputClass}
                  value={goalForm.targetAmount}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, targetAmount: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs font-semibold text-base-theme">
                {t('life_saved_amount')}
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  className={inputClass}
                  value={goalForm.savedAmount}
                  onChange={(e) =>
                    setGoalForm({ ...goalForm, savedAmount: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-base-theme">
              {t('life_target_date')}
              <input
                required
                type="date"
                max="9999-12-31"
                className={inputClass}
                value={goalForm.targetDate}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, targetDate: e.target.value })
                }
              />
            </label>
            <p className="text-xs text-muted-theme leading-relaxed">
              {t('life_self_reported')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className={`${secondary} flex-1`}
                onClick={() => setGoalForm(null)}
              >
                {t('action_cancel')}
              </button>
              <button
                disabled={busy || !goalForm.name.trim()}
                type="submit"
                className="primary-action flex-1"
              >
                {busy ? t('saving') : t('save')}
              </button>
            </div>
            {goalForm.id && (
              <button
                type="button"
                disabled={busy}
                className="min-h-11 w-full text-xs text-rose-500"
                onClick={() =>
                  setConfirm({
                    message: t('life_delete_goal_confirm'),
                    run: () => planningApi.removeGoal(goalForm.id!),
                  })
                }
              >
                {t('action_delete')}
              </button>
            )}
          </form>
        ) : (
          <button
            disabled={busy}
            onClick={() => editGoal()}
            className={`${secondary} flex items-center justify-center gap-2 w-full mt-3 border-dashed`}
          >
            <Icon path={mdiPlus} size={0.75} />
            {t('life_add_goal')}
          </button>
        )}
      </section>
      <ConfirmModal
        open={!!confirm}
        message={confirm?.message ?? ''}
        confirmLabel={t('action_confirm')}
        cancelLabel={t('action_cancel')}
        onCancel={() => {
          if (!busy) setConfirm(null)
        }}
        onConfirm={() => {
          if (confirm) void mutate(confirm.run, t('life_saved'))
        }}
      />
    </div>
  )
}
