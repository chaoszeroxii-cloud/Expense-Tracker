import { useState } from 'react'
import { planningApi } from '../../api'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import { savingsScenario } from '../../utils/savingsScenario'
import { ConfirmModal } from '../ui'
import type { PlanningOverview } from '../../types/planning'
export default function GoalSimulator({
  planning,
  limit,
  onChanged,
}: {
  planning: PlanningOverview
  limit: number | null
  onChanged: () => void
}) {
  const t = useT(),
    [id, setId] = useState(''),
    [monthly, setMonthly] = useState(1000),
    [extra, setExtra] = useState(0),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false)
  const activeLimit = limit
  const goal = planning.goals.find((g) => g.id === id) ?? planning.goals[0]
  const result = goal
    ? savingsScenario(planning.today, goal.targetAmount, goal.savedAmount, monthly, extra)
    : null
  return (
    <details className="surface p-5">
      <summary className="cursor-pointer section-title">{t('dc_simulate')}</summary>
      <p className="page-description mb-4">{t('dc_sim_hint')}</p>
      {!goal ? (
        <p className="text-sm text-muted-theme">{t('dc_goal_empty')}</p>
      ) : (
        <div className="space-y-4">
          <label className="field-label">
            {t('dc_goal')}
            <select className="field-input" value={goal.id} onChange={(e) => setId(e.target.value)}>
              {planning.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="field-label">
              {t('dc_monthly_save')}
              <input
                className="field-input"
                type="number"
                min={0}
                max={9999999999.99}
                step="0.01"
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
              />
            </label>
            <label className="field-label">
              {t('dc_extra_save')}
              <input
                className="field-input"
                type="number"
                min={0}
                max={9999999999.99}
                step="0.01"
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
            </label>
          </div>
          {result && (
            <div className="rounded-xl bg-input p-4 space-y-3">
              <p className="font-bold">
                {t('dc_finish')}: {result.targetDate} · {result.months} {t('dc_months')}
              </p>
              {activeLimit !== null ? (
                <>
                  <p className="text-xs text-muted-theme">{t('dc_plan_effect')}</p>
                  <p className="text-sm">
                    {t('dc_new_limit')}: ฿{fmt(activeLimit - extra)}
                    {activeLimit - extra < 0 ? ` · ${t('home_status_over')}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-theme">{t('dc_sim_no_plan')}</p>
              )}
              <button
                className="text-action"
                disabled={busy || result.months === 0}
                onClick={() => setConfirm(true)}
              >
                {t('dc_apply_date')}
              </button>
            </div>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirm}
        danger={false}
        message={`${goal?.name ?? ''} → ${result?.targetDate ?? ''}`}
        confirmLabel={t('dc_confirm_date')}
        cancelLabel={t('action_cancel')}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (!goal || !result || busy) return
          setConfirm(false)
          setBusy(true)
          try {
            await planningApi.saveGoal(
              {
                name: goal.name,
                targetAmount: goal.targetAmount,
                savedAmount: goal.savedAmount,
                targetDate: result.targetDate,
              },
              goal.id,
            )
            onChanged()
            toast.success(t('dc_sim_saved'))
          } catch (e) {
            toast.error(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
          } finally {
            setBusy(false)
          }
        }}
      />
    </details>
  )
}
