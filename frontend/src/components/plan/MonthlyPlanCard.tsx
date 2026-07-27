import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiPencilOutline, mdiTargetVariant, mdiNotebookOutline, mdiCheck, mdiClose } from '@mdi/js'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { WorkTimeBadge } from '../ui'
import { fmt } from '../../utils/money'
import { apiErrorMessage } from '../../utils/apiError'
import { track } from '../../utils/telemetry'
import type { TrackingMode } from '../../types'

/**
 * The monthly limit that the daily allowance is derived from.
 *
 * It sits at the top of the Plan tab rather than buried in Settings: this is the number
 * the whole home screen depends on, so it belongs with the other planning controls, not
 * next to theme and language.
 */
export default function MonthlyPlanCard({ onChanged }: { onChanged?: () => void }) {
  const t = useT()
  const { user, token, setAuth } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<TrackingMode>(user?.trackingMode ?? 'plan')
  const [limit, setLimit] = useState(
    user?.monthlySpendingLimit != null ? String(user.monthlySpendingLimit) : '',
  )
  const [saving, setSaving] = useState(false)

  const currentLimit = user?.monthlySpendingLimit ?? null
  const limitNum = Number(limit)
  const limitValid = limit !== '' && Number.isFinite(limitNum) && limitNum >= 0.01
  const canSave = saving ? false : mode === 'track_only' || limitValid

  const open = () => {
    setMode(user?.trackingMode ?? 'plan')
    setLimit(user?.monthlySpendingLimit != null ? String(user.monthlySpendingLimit) : '')
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await authApi.updatePreferences(
        mode === 'plan'
          ? { trackingMode: 'plan', monthlySpendingLimit: limitNum }
          // An explicit null clears the plan — omitting the key would leave a stale
          // limit behind that reappears if the user switches back.
          : { trackingMode: 'track_only', monthlySpendingLimit: null },
      )
      if (updated && token) setAuth(token, updated)
      track(currentLimit === null ? 'plan_set' : 'plan_changed')
      toast.success(mode === 'plan' ? t('plan_saved') : t('plan_cleared'))
      setEditing(false)
      onChanged?.()
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard'] } }))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-theme shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon path={mdiTargetVariant} size={0.7} color="#4f46e5" />
          </div>
          <h2 className="font-bold text-base-theme text-sm">{t('plan_title')}</h2>
        </div>
        {!editing && (
          <button onClick={open} aria-label={t('action_edit')}
            className="p-1.5 rounded-lg text-muted-theme active:bg-[var(--input)] transition-colors">
            <Icon path={mdiPencilOutline} size={0.7} />
          </button>
        )}
      </div>

      {!editing ? (
        user?.trackingMode === 'track_only' || currentLimit === null ? (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon path={mdiNotebookOutline} size={0.6} className="text-muted-theme" />
              <p className="text-sm font-semibold text-base-theme">
                {user?.trackingMode === 'track_only' ? t('home_track_only') : t('home_no_plan_title')}
              </p>
            </div>
            <p className="text-xs text-muted-theme leading-relaxed mb-3">{t('home_no_plan_body')}</p>
            <button onClick={open}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
                         active:scale-[0.98] transition-transform">
              {t('home_set_plan')}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-theme mb-0.5">{t('plan_limit_label')}</p>
            <p className="text-3xl font-extrabold text-base-theme tabular-nums">฿{fmt(currentLimit)}</p>
            <WorkTimeBadge amount={currentLimit} className="mt-1" />
          </div>
        )
      ) : (
        <div className="space-y-3 animate-fade-up">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
            {([
              { value: 'plan'       as const, label: t('plan_mode_plan') },
              { value: 'track_only' as const, label: t('plan_mode_track') },
            ]).map(opt => (
              <button key={opt.value} type="button" onClick={() => setMode(opt.value)}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
                  mode === opt.value
                    ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-sm'
                    : 'text-muted-theme',
                )}>
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'plan' && (
            <div>
              <label htmlFor="plan-limit" className="text-[10px] font-semibold text-muted-theme block mb-1 uppercase">
                {t('plan_limit_label')}
              </label>
              <input
                id="plan-limit" type="number" inputMode="decimal" step="0.01" min={0.01}
                value={limit} onChange={e => setLimit(e.target.value)} placeholder="0" autoFocus
                className="w-full text-3xl font-extrabold text-base-theme bg-transparent outline-none
                           placeholder:text-slate-200 dark:placeholder:text-slate-600 tabular-nums"
              />
              <WorkTimeBadge amount={limitNum} className="mt-1" />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} disabled={saving}
              className="flex-1 py-2.5 rounded-xl border border-theme bg-card text-sm font-semibold
                         text-base-theme flex items-center justify-center gap-1.5">
              <Icon path={mdiClose} size={0.65} />
              {t('action_cancel')}
            </button>
            <button onClick={save} disabled={!canSave}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5',
                canSave ? 'bg-brand-600 text-white active:scale-95' : 'bg-slate-300 dark:bg-slate-700 text-muted-theme',
              )}>
              <Icon path={mdiCheck} size={0.65} />
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
