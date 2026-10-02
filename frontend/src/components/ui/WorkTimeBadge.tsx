import Icon from '@mdi/react'
import { mdiClockOutline } from '@mdi/js'
import clsx from 'clsx'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { formatWorkTime, hourlyRateOf } from '../../utils/workTime'

/**
 * An amount rendered as the hours of work it costs.
 *
 * The work-time calculator used to be a standalone modal behind a 3px strip at the
 * screen edge: the user had to remember it existed, open it, and retype the price. As a
 * badge it sits where the decision happens — under the amount field, on the daily
 * allowance, beside a transaction — and costs no navigation at all.
 *
 * Renders nothing when the user has switched it off or when there is no income on file
 * to derive a rate from. It must never nag: an empty badge is the correct output.
 */
export default function WorkTimeBadge({ amount, className, size = 'sm' }: {
  amount: number
  className?: string
  size?: 'sm' | 'md'
}) {
  const t = useT()
  const user = useAuthStore(s => s.user)

  if (!user?.showWorkTime) return null
  if (!(amount > 0)) return null

  const rate = hourlyRateOf(user.expectedMonthlyIncome, user.workHoursPerDay, user.workDaysPerMonth)
  if (!rate) return null

  const label = formatWorkTime(amount, rate, user.workHoursPerDay, {
    day: t('wt_unit_day'), hour: t('wt_unit_hour'), minute: t('wt_unit_minute'),
  })
  if (!label) return null

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-muted-theme font-medium tabular-nums',
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        className,
      )}
    >
      <Icon path={mdiClockOutline} size={size === 'sm' ? 0.5 : 0.6} />
      ≈ {label} {t('wt_of_work')}
    </span>
  )
}
