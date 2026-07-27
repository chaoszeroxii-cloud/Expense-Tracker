import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiChevronDown, mdiChevronRight, mdiWallet, mdiPlus, mdiTrashCanOutline, mdiPencilOutline, mdiClose, mdiCheck } from '@mdi/js'
import clsx from 'clsx'
import { budgetsApi, categoriesApi } from '../../api'
import type { SpendingPlanView, Category } from '../../types'
import CustomSelect from '../../components/ui/CustomSelect'
import IconDisplay from '../../components/ui/IconDisplay'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { Skeleton, ErrorState } from '../../components/ui'
import SpendingPlanCard from '../../components/plan/SpendingPlanCard'
import BudgetRollover from '../../components/plan/BudgetRollover'
import { useT, useI18n } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { currentMonthLocal as currentMonth, monthOffset } from '../../utils/localDate'
import { fmt } from '../../utils/money'

/**
 * One question per section, in the order they matter.
 *
 * The page used to lead with two things called "แผน" and "งบ" without saying how they
 * differed, and the headline figure was not even scoped to the month selector beneath it.
 * Now: the monthly limit (which drives the daily number on Home), then envelopes — the
 * split most people here actually maintain — and per-category limits collapsed away as
 * the optional alternative they are.
 */
export default function Budget() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const dateLocale = lang === 'en' ? 'en-US' : 'th-TH'
  const advancedMode = useAuthStore(s => s.user?.advancedMode ?? false)

  const [month, setMonth] = useState(currentMonth())
  const [plan, setPlan] = useState<SpendingPlanView | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCategories, setShowCategories] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ categoryId: '', amount: '' })
  const [saving, setSaving] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, c] = await Promise.all([budgetsApi.getPlan(month), categoriesApi.list()])
      setPlan(p)
      setCategories(c.filter((x: Category) => x.type === 'expense'))
      // Keep the section open once it is in use, so it does not hide the user's own data.
      if (p.categoryTargets.length > 0) setShowCategories(true)
    } catch (err) {
      setError(apiErrorMessage(err, t('err_load_failed'), t('err_offline')))
    } finally {
      setLoading(false)
    }
  }, [month, t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('budget') || types.includes('dashboard')) load()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [load])

  const handleSave = async () => {
    if (!form.categoryId || !form.amount) return
    setSaving(true)
    try {
      await budgetsApi.upsert({ categoryId: form.categoryId, amount: parseFloat(form.amount), month })
      setShowForm(false)
      setForm({ categoryId: '', amount: '' })
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (categoryId: string) => {
    setConfirmState({
      open: true,
      onConfirm: async () => {
        setConfirmState(s => ({ ...s, open: false }))
        try {
          await budgetsApi.saveBatch(month, [{ categoryId, amount: 0 }])
          await load()
        } catch (err) {
          toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
        }
      },
    })
  }

  const changeMonth = (dir: number) => {
    const next = monthOffset(month, dir)
    if (next <= currentMonth()) setMonth(next)
  }

  const used = new Set((plan?.categoryTargets ?? []).map(b => b.categoryId))
  const availableCategories = categories.filter(c => !used.has(c.id))

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">{t('nav_plan')}</h1>
        <p className="text-xs text-muted-theme mt-0.5">{t('budget_subtitle')}</p>
      </div>

      {/* One month selector for the whole page — the headline used to ignore it. */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => changeMonth(-1)} aria-label="Previous month"
          className="p-2 rounded-full hover:bg-[var(--input)] text-muted-theme">‹</button>
        <span className="font-bold text-base-theme text-sm min-w-[120px] text-center">
          {new Date(month + '-01').toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' })}
        </span>
        <button onClick={() => changeMonth(1)} disabled={month >= currentMonth()}
          className="p-2 rounded-full hover:bg-[var(--input)] text-muted-theme disabled:opacity-30">›</button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} retryLabel={t('action_retry')} />
      ) : plan && (
        <>
          <SpendingPlanCard plan={plan} month={month} onChanged={load} />

          {/* Envelopes: the split this app's users actually maintain. */}
          {advancedMode && (
            <button
              onClick={() => navigate('/wallets')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-[var(--border)]
                         active:scale-[0.98] transition-all text-left"
            >
              <div className="w-11 h-11 rounded-2xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <Icon path={mdiWallet} size={1} color="#8b5cf6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base-theme text-sm">{t('plan_wallets_title')}</div>
                <div className="text-xs text-muted-theme mt-0.5">{t('plan_wallets_desc')}</div>
              </div>
              <Icon path={mdiChevronRight} size={0.8} className="text-muted-theme shrink-0" />
            </button>
          )}

          {/* Per-category limits — the optional alternative, folded away by default. */}
          <div className="rounded-2xl bg-card border border-theme overflow-hidden">
            <button
              onClick={() => setShowCategories(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <div className="min-w-0">
                <div className="font-bold text-base-theme text-sm">{t('plan_categories_title')}</div>
                <div className="text-xs text-muted-theme mt-0.5">
                  {plan.categoryTargets.length > 0
                    ? `${plan.categoryTargets.length} · ฿${fmt(plan.targetedTotal)}`
                    : t('plan_categories_desc')}
                </div>
              </div>
              <Icon path={mdiChevronDown} size={0.8}
                className={clsx('text-muted-theme shrink-0 transition-transform', showCategories && 'rotate-180')} />
            </button>

            {showCategories && (
              <div className="px-5 pb-5 space-y-3 border-t border-theme pt-4 animate-fade-up">
                {plan.flexibleAmount !== null && plan.categoryTargets.length > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-theme">{t('plan_flexible')}</span>
                    <span className={clsx('font-bold tabular-nums',
                      plan.flexibleAmount < 0 ? 'text-rose-500' : 'text-base-theme')}>
                      ฿{fmt(plan.flexibleAmount)}
                    </span>
                  </div>
                )}

                {plan.categoryTargets.length === 0 ? (
                  <BudgetRollover month={month} onApplied={load} />
                ) : (
                  <>
                    {plan.categoryTargets.map(b => {
                      const pct = b.amount > 0 ? Math.min(100, (b.actual / b.amount) * 100) : 0
                      const over = b.actual > b.amount
                      return (
                        <div key={b.categoryId}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 flex items-center justify-center rounded-md shrink-0"
                              style={{ backgroundColor: (b.categoryColor ?? '#94a3b8') + '22' }}>
                              <IconDisplay icon={b.categoryIcon ?? 'other'} color={b.categoryColor ?? undefined} size={0.55} />
                            </span>
                            <span className="flex-1 min-w-0 truncate text-xs font-medium text-base-theme">
                              {b.categoryName}
                            </span>
                            <span className={clsx('text-xs tabular-nums', over ? 'text-rose-500 font-semibold' : 'text-muted-theme')}>
                              ฿{fmt(b.actual)} / ฿{fmt(b.amount)}
                            </span>
                            <button onClick={() => handleDelete(b.categoryId)}
                              aria-label={`${t('action_delete')} ${b.categoryName}`}
                              className="p-1 rounded-lg text-muted-theme active:bg-[var(--input)]">
                              <Icon path={mdiTrashCanOutline} size={0.6} />
                            </button>
                          </div>
                          <div className="w-full bg-[var(--input)] rounded-full h-1.5 overflow-hidden">
                            <div className={clsx('h-full rounded-full transition-all',
                              over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {showForm ? (
                  <div className="space-y-2 pt-2 border-t border-theme animate-fade-up">
                    <CustomSelect
                      value={form.categoryId}
                      onChange={(v: string) => setForm(f => ({ ...f, categoryId: v }))}
                      options={availableCategories.map(c => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))}
                      placeholder={t('category')}
                    />
                    <input type="number" inputMode="decimal" step="0.01" min={0.01}
                      placeholder="0" value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-[var(--input)] border border-theme
                                 text-base-theme text-sm outline-none focus:border-brand-500" />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowForm(false); setForm({ categoryId: '', amount: '' }) }}
                        className="flex-1 py-2.5 rounded-xl border border-theme text-sm font-semibold text-base-theme
                                   flex items-center justify-center gap-1.5">
                        <Icon path={mdiClose} size={0.6} /> {t('action_cancel')}
                      </button>
                      <button onClick={handleSave} disabled={saving || !form.categoryId || !form.amount}
                        className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
                                   disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <Icon path={mdiCheck} size={0.6} color="white" /> {saving ? t('saving') : t('save')}
                      </button>
                    </div>
                  </div>
                ) : availableCategories.length > 0 && (
                  <button onClick={() => setShowForm(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                               border border-dashed border-theme text-xs font-semibold text-muted-theme">
                    <Icon path={mdiPlus} size={0.6} /> {t('add')}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmState.open}
        message={t('delete_confirm')}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
