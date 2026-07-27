import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiCheck, mdiMinus, mdiCurrencyUsdOff } from '@mdi/js'
import clsx from 'clsx'
import { checkInsApi } from '../../api'
import { useT, useI18n } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { shiftDateLocal } from '../../utils/localDate'
import type { Coverage } from '../../types'

/**
 * Seven days, and how many of them are accounted for.
 *
 * Explicitly not a streak. A streak resets to zero when you miss a day, which means a
 * day with no spending — the behaviour the app is trying to encourage — would read as a
 * failure unless you opened the app anyway. Here a no-spend day counts as covered once
 * you say so, missing a day costs one square out of seven, and nothing ever resets.
 *
 * Yesterday can still be marked. Forgetting once should be recoverable.
 */
export default function CoverageStrip({ coverage, onChange }: {
  coverage: Coverage
  onChange: (next: Coverage) => void
}) {
  const t = useT()
  const { lang } = useI18n()
  const [busy, setBusy] = useState(false)

  const mark = async (date: string) => {
    setBusy(true)
    try {
      const next = await checkInsApi.markNoSpend(date)
      onChange(next)
      toast.success(t('cov_marked'), {
        label: t('cov_undo'),
        onPress: async () => {
          try { onChange(await checkInsApi.undo(date)) }
          catch (err) { toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline'))) }
        },
      })
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  const weekday = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(
      lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'narrow' },
    )

  const complete = coverage.covered === coverage.total

  return (
    <div className="rounded-2xl bg-card border border-theme shadow-sm px-4 py-3 animate-fade-up">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold text-muted-theme">{t('cov_title')}</span>
        <span className={clsx('text-xs font-bold tabular-nums',
          complete ? 'text-emerald-500' : 'text-base-theme')}>
          {coverage.covered}/{coverage.total} {t('cov_counted')}
        </span>
      </div>

      <div className="flex items-center justify-between gap-1">
        {coverage.days.map(day => (
          <div key={day.date} className="flex flex-col items-center gap-1 flex-1">
            <div className={clsx(
              'w-full aspect-square max-w-9 rounded-xl flex items-center justify-center transition-colors',
              day.covered
                ? day.source === 'no_spend'
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-[var(--input)] text-muted-theme',
              day.isToday && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-[var(--bg-card)]',
            )}>
              <Icon
                path={day.covered ? (day.source === 'no_spend' ? mdiCurrencyUsdOff : mdiCheck) : mdiMinus}
                size={0.6}
              />
            </div>
            <span className="text-[9px] text-muted-theme font-medium">{weekday(day.date)}</span>
          </div>
        ))}
      </div>

      {coverage.canMarkToday && (
        <button
          onClick={() => mark(coverage.days[coverage.days.length - 1].date)}
          disabled={busy}
          className="w-full mt-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300
                     text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {t('cov_no_spend_cta')}
        </button>
      )}

      {/* One day of grace, offered only once today is settled. */}
      {!coverage.canMarkToday && coverage.canMarkYesterday && (
        <button
          onClick={() => mark(shiftDateLocal(coverage.days[coverage.days.length - 1].date, -1))}
          disabled={busy}
          className="w-full mt-3 py-2 rounded-xl bg-[var(--input)] text-muted-theme
                     text-xs font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {t('cov_no_spend_yesterday')}
        </button>
      )}

      {complete && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 text-center mt-2.5 font-medium">
          {t('cov_all_done')}
        </p>
      )}
    </div>
  )
}
