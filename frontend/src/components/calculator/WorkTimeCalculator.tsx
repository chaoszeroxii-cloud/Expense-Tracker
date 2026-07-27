import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiClose, mdiContentSave, mdiCog, mdiPencilOutline, mdiClockMinusOutline } from '@mdi/js'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { hourlyRateOf, workTimeFor } from '../../utils/workTime'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import { track } from '../../utils/telemetry'

interface Props { onClose: () => void }

/**
 * The full "what would this cost me in work hours" tool, for deliberate what-if
 * questions before a large purchase.
 *
 * Day to day the same lens is delivered inline by WorkTimeBadge — under the amount
 * field, on the daily allowance, beside a transaction — so nobody has to remember this
 * screen exists to benefit from it.
 *
 * Settings live on the user record, not localStorage: the previous version lost the
 * salary on every device change and duplicated `expectedMonthlyIncome`, which the
 * profile already stores.
 */
export default function WorkTimeCalculator({ onClose }: Props) {
  const t = useT()
  const { user, token, setAuth } = useAuthStore()

  const [tab, setTab] = useState<'calc' | 'settings'>('calc')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const [draftIncome, setDraftIncome] = useState(
    user?.expectedMonthlyIncome != null ? String(user.expectedMonthlyIncome) : '',
  )
  const [draftHours, setDraftHours] = useState(String(user?.workHoursPerDay ?? 8))
  const [draftDays, setDraftDays]   = useState(String(user?.workDaysPerMonth ?? 22))

  const income      = user?.expectedMonthlyIncome ?? null
  const hoursPerDay = user?.workHoursPerDay ?? 8
  const daysPerMonth = user?.workDaysPerMonth ?? 22
  const hourlyRate  = hourlyRateOf(income, hoursPerDay, daysPerMonth)

  const priceNum = parseFloat(price) || 0
  const parts = hourlyRate && priceNum > 0 ? workTimeFor(priceNum, hourlyRate, hoursPerDay) : null

  const saveSettings = async () => {
    const incomeNum = parseFloat(draftIncome)
    const hoursNum  = parseFloat(draftHours)
    const daysNum   = parseInt(draftDays, 10)
    if (!(incomeNum > 0) || !(hoursNum > 0) || !(daysNum > 0)) {
      toast.error(t('err_generic'))
      return
    }
    setSaving(true)
    try {
      const updated = await authApi.updatePreferences({
        expectedMonthlyIncome: incomeNum,
        workHoursPerDay: hoursNum,
        workDaysPerMonth: daysNum,
      })
      if (updated && token) setAuth(token, updated)
      toast.success(t('prefs_saved'))
      setTab('calc')
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setSaving(false)
    }
  }

  const toggleBadge = async () => {
    const next = !(user?.showWorkTime ?? true)
    try {
      const updated = await authApi.updatePreferences({ showWorkTime: next })
      if (updated && token) setAuth(token, updated)
      track('work_time_toggled')
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-sm bg-card rounded-t-3xl lg:rounded-3xl p-5 shadow-2xl animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <Icon path={mdiClockMinusOutline} size={0.8} color="#8b5cf6" />
            </div>
            <div>
              <h2 className="font-bold text-base-theme leading-tight">{t('wt_title')}</h2>
              <p className="text-[10px] text-muted-theme">{t('wt_subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab(tab === 'settings' ? 'calc' : 'settings')}
              className={clsx('p-2 rounded-xl transition-colors',
                tab === 'settings'
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'
                  : 'text-muted-theme hover:bg-[var(--input)]')}
              aria-label={t('settings')}
            >
              <Icon path={tab === 'settings' ? mdiPencilOutline : mdiCog} size={0.8} />
            </button>
            <button onClick={onClose} aria-label={t('action_dismiss')}
              className="p-2 text-muted-theme hover:bg-[var(--input)] rounded-xl">
              <Icon path={mdiClose} size={0.8} />
            </button>
          </div>
        </div>

        {tab === 'calc' ? (
          <div className="space-y-4">
            {!hourlyRate && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
                              rounded-2xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <span>{t('wt_needs_income')}</span>
                <button onClick={() => setTab('settings')} className="ml-auto font-bold underline shrink-0">
                  {t('settings')}
                </button>
              </div>
            )}

            {hourlyRate && (
              <div className="bg-[var(--input)] rounded-2xl px-4 py-3 grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-xs font-bold text-base-theme tabular-nums">฿{fmt(income!)}</p>
                  <p className="text-[10px] text-muted-theme">{t('wt_month')}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-base-theme tabular-nums">{hoursPerDay} {t('wt_hr')}</p>
                  <p className="text-[10px] text-muted-theme">{t('wt_per_day')}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-500 tabular-nums">฿{hourlyRate.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-theme">{t('wt_per_hour')}</p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="wt-price" className="text-xs text-muted-theme mb-1.5 block font-medium">
                {t('wt_price_label')}
              </label>
              <input
                id="wt-price" type="number" inputMode="decimal" step="0.01"
                placeholder={t('wt_price_ph')} value={price} onChange={e => setPrice(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-[var(--input)] border border-theme
                           text-base-theme text-sm outline-none focus:border-brand-500 transition-colors"
                autoFocus
              />
            </div>

            {parts && (
              <div className="bg-gradient-to-br from-brand-50 to-violet-50 dark:from-brand-950/60 dark:to-violet-950/40
                              border border-brand-200 dark:border-brand-800/50 rounded-2xl p-4">
                <p className="text-xs text-muted-theme mb-3 text-center font-medium">
                  ฿{fmt(priceNum)} {t('wt_must_work')}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  {[
                    { value: parts.days,    label: t('wt_day') },
                    { value: parts.hours,   label: t('wt_hr') },
                    { value: parts.minutes, label: t('wt_min') },
                  ].map(({ value, label }) => (
                    <div key={label} className="bg-white/70 dark:bg-white/10 rounded-xl py-2.5">
                      <p className="text-xl font-extrabold text-brand-600 leading-none tabular-nums">
                        {value.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-theme mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-muted-theme">
                  {t('wt_total_prefix')} {parts.totalHours.toFixed(2)} {t('wt_hours_unit')}
                  {income ? ` · ${((priceNum / income) * 100).toFixed(1)}% ${t('wt_of_salary')}` : ''}
                </p>
              </div>
            )}
          </div>

        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-theme">{t('wt_settings_desc')}</p>

            {([
              { label: t('wt_salary_label'), value: draftIncome, set: setDraftIncome, step: '0.01', ph: '30000' },
              { label: t('wt_hours_label'),  value: draftHours,  set: setDraftHours,  step: '0.5',  ph: '8' },
              { label: t('wt_days_label'),   value: draftDays,   set: setDraftDays,   step: '1',    ph: '22' },
            ]).map(({ label, value, set, step, ph }) => (
              <div key={label}>
                <label className="text-xs text-muted-theme mb-1.5 block font-medium">{label}</label>
                <input
                  type="number" inputMode="decimal" step={step} min={0} placeholder={ph}
                  value={value} onChange={e => set(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-[var(--input)] border border-theme
                             text-base-theme text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            ))}

            {/* The badge follows the user across devices, so the switch lives here too. */}
            <button
              onClick={toggleBadge}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl
                         bg-[var(--input)] border border-theme text-left"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-base-theme">{t('wt_toggle_label')}</p>
                <p className="text-[10px] text-muted-theme mt-0.5 leading-relaxed">{t('wt_toggle_desc')}</p>
              </div>
              <span className={clsx(
                'shrink-0 w-10 h-6 rounded-full transition-colors relative',
                user?.showWorkTime ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
              )}>
                <span className={clsx(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  user?.showWorkTime ? 'translate-x-[18px]' : 'translate-x-0.5',
                )} />
              </span>
            </button>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-brand-600 text-white font-semibold text-sm
                         active:scale-95 transition-transform flex items-center justify-center gap-2 mt-1
                         disabled:opacity-50"
            >
              <Icon path={mdiContentSave} size={0.8} color="white" />
              {saving ? t('saving') : t('wt_save_settings')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
