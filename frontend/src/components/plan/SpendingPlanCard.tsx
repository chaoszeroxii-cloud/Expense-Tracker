import { useState, useEffect } from 'react'
import Icon from '@mdi/react'
import { mdiPencilOutline, mdiTargetVariant, mdiNotebookOutline, mdiCheck, mdiClose, mdiCalendarArrowRight } from '@mdi/js'
import clsx from 'clsx'
import { budgetsApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT, useI18n } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { WorkTimeBadge } from '../ui'
import { fmt, fmtRound } from '../../utils/money'
import { apiErrorMessage } from '../../utils/apiError'
import { track } from '../../utils/telemetry'
import type { SpendingPlanView } from '../../types'

/**
 * The monthly spending total, scoped to the month on screen.
 *
 * It used to live on the user record with no month at all, while sitting above a month
 * selector labelled "this month" — so scrolling back to June changed the rows underneath
 * but not the headline. Now the figure belongs to the month, and a month with none of
 * its own inherits the last one the user set, labelled as such.
 */
export default function SpendingPlanCard({ plan, month, onChanged }: {
  plan: SpendingPlanView
  month: string
  onChanged: () => void
}) {
  const t = useT()
  const { lang } = useI18n()
  const trackingMode = useAuthStore(s => s.user?.trackingMode ?? 'plan')

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAmount(plan.totalAmount != null ? String(plan.totalAmount) : '')
  }, [plan.totalAmount, month])

  const amountNum = Number(amount)
  const valid = amount !== '' && Number.isFinite(amountNum) && amountNum >= 0.01

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleDateString(
      lang === 'th' ? 'th-TH' : 'en-US', { month: 'long' },
    )
  }

  const save = async (next: number | null) => {
    setSaving(true)
    try {
      await budgetsApi.setPlanTotal(month, next)
      track(plan.state === 'explicit' ? 'plan_changed' : 'plan_set')
      toast.success(next === null ? t('plan_cleared') : t('plan_saved'))
      setEditing(false)
      onChanged()
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard'] } }))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setSaving(false)
    }
  }

  if (trackingMode === 'track_only') {
    return (
      <div className="rounded-2xl bg-card border border-theme shadow-sm p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon path={mdiNotebookOutline} size={0.7} className="text-muted-theme" />
          <h2 className="font-bold text-base-theme text-sm">{t('home_track_only')}</h2>
        </div>
        <p className="text-xs text-muted-theme leading-relaxed">{t('home_track_only_body')}</p>
      </div>
    )
  }

  const pct = plan.totalAmount && plan.totalAmount > 0
    ? Math.min(100, (plan.totalActual / plan.totalAmount) * 100)
    : 0
  const over = plan.totalAmount !== null && plan.totalActual > plan.totalAmount

  return (
    <div className="rounded-2xl bg-card border border-theme shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon path={mdiTargetVariant} size={0.7} color="#4f46e5" />
          </div>
          <h2 className="font-bold text-base-theme text-sm">{t('plan_total_title')}</h2>
        </div>
        {!editing && plan.totalAmount !== null && (
          <button onClick={() => setEditing(true)} aria-label={t('action_edit')}
            className="p-1.5 rounded-lg text-muted-theme active:bg-[var(--input)] transition-colors">
            <Icon path={mdiPencilOutline} size={0.7} />
          </button>
        )}
      </div>

      {/* Where the number came from, whenever it is not this month's own. */}
      {!editing && plan.state === 'inherited' && plan.sourceMonth && (
        <button
          onClick={() => setEditing(true)}
          className="w-full flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-left
                     bg-[var(--input)] active:opacity-80 transition-opacity"
        >
          <Icon path={mdiCalendarArrowRight} size={0.6} className="text-muted-theme shrink-0" />
          <span className="flex-1 text-[11px] text-muted-theme leading-snug">
            {t('plan_inherited_from')} {monthLabel(plan.sourceMonth)}
          </span>
          <span className="text-[11px] font-bold text-brand-600 shrink-0">{t('plan_review')}</span>
        </button>
      )}

      {editing ? (
        <div className="space-y-3 animate-fade-up">
          <div>
            <label htmlFor="plan-total" className="text-[10px] font-semibold text-muted-theme block mb-1 uppercase">
              {t('plan_limit_label')}
            </label>
            <input
              id="plan-total" type="number" inputMode="decimal" step="0.01" min={0.01}
              value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus
              className="w-full text-3xl font-extrabold text-base-theme bg-transparent outline-none
                         placeholder:text-slate-200 dark:placeholder:text-slate-600 tabular-nums"
            />
            <WorkTimeBadge amount={amountNum} className="mt-1" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 py-2.5 rounded-xl border border-theme bg-card text-sm font-semibold
                         text-base-theme flex items-center justify-center gap-1.5">
              <Icon path={mdiClose} size={0.65} />
              {t('action_cancel')}
            </button>
            <button onClick={() => save(valid ? amountNum : null)} disabled={saving || !valid}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5',
                valid && !saving ? 'bg-brand-600 text-white active:scale-95' : 'bg-slate-300 dark:bg-slate-700 text-muted-theme',
              )}>
              <Icon path={mdiCheck} size={0.65} />
              {saving ? t('saving') : t('save')}
            </button>
          </div>
          {plan.totalAmount !== null && (
            <button onClick={() => save(null)} disabled={saving}
              className="w-full py-2 text-xs text-muted-theme hover:text-rose-500 transition-colors">
              {t('plan_clear')}
            </button>
          )}
        </div>

      ) : plan.totalAmount === null ? (
        <div>
          <p className="text-xs text-muted-theme leading-relaxed mb-3">{t('home_no_plan_body')}</p>
          <button onClick={() => setEditing(true)}
            className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
                       active:scale-[0.98] transition-transform">
            {t('home_set_plan')}
          </button>
        </div>

      ) : (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-extrabold text-base-theme tabular-nums">
              ฿{fmtRound(plan.totalAmount)}
            </span>
            <span className={clsx('text-xs font-semibold tabular-nums',
              over ? 'text-rose-500' : 'text-muted-theme')}>
              {t('spent')} ฿{fmtRound(plan.totalActual)}
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[var(--input)] overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all',
              over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${pct}%` }} />
          </div>

          <p className={clsx('text-xs font-semibold mt-2', over ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
            {over
              ? `${t('budget_over')} ฿${fmt(plan.totalActual - plan.totalAmount)}`
              : `${t('budget_left')} ฿${fmt(plan.totalAmount - plan.totalActual)}`}
          </p>
          <WorkTimeBadge amount={plan.totalAmount} className="mt-1" />
        </div>
      )}
    </div>
  )
}
