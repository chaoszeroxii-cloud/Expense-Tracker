import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiArrowTopRight, mdiLeaf, mdiTargetVariant } from '@mdi/js'
import { useT } from '../../store/i18n.store'
import { WorkTimeBadge } from '../ui'
import { fmt, fmtRound } from '../../utils/money'
import type { DailyBrief } from '../../types'

/** The allowance is a spending plan, never a bank balance. No plan means no allowance. */
export default function SafeToSpendCard({ brief }: { brief: DailyBrief }) {
  const t = useT()
  const navigate = useNavigate()
  const hasPlan = brief.mode !== 'track_only' && brief.monthlyLimit !== null && brief.safeToday !== null
  const monthPct =
    hasPlan && brief.monthlyLimit! > 0
      ? Math.min(100, Math.max(0, (brief.monthSpent / brief.monthlyLimit!) * 100))
      : 0
  const overBy = hasPlan ? Math.max(0, brief.monthSpent - brief.monthlyLimit!) : 0
  const status =
    brief.planStatus === 'over'
      ? t('home_status_over')
      : brief.planStatus === 'close'
        ? t('home_status_close')
        : t('home_status_on_track')

  return (
    <section
      className="daily-hero h-full flex flex-col"
      data-status={hasPlan ? brief.planStatus : 'no_plan'}
      aria-label={t('ux_today_title')}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-white/85">
          <Icon path={mdiLeaf} size={0.8} />
          {hasPlan ? t('home_safe_today') : t('home_spent_today')}
        </span>
        {hasPlan && (
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold shrink-0">{status}</span>
        )}
      </div>
      <div className="mt-6 mb-5">
        <p className="daily-amount">฿{fmtRound(hasPlan ? brief.safeToday! : brief.spentToday)}</p>
        <p className="text-xs text-white/75 mt-2 leading-relaxed">
          {hasPlan ? t('home_safe_caveat') : t('home_track_only_body')}
        </p>
        {hasPlan && brief.unpaidBills > 0 && <p className="text-xs text-white/90 mt-3 leading-relaxed">{t('life_reserved_home')} ฿{fmt(brief.unpaidBills)}</p>}
        <WorkTimeBadge
          amount={hasPlan ? brief.safeToday! : brief.spentToday}
          className="!text-white/80 mt-2"
        />
      </div>
      {overBy > 0 && (
        <p className="rounded-xl bg-white/10 p-3 mb-4 text-sm">
          {t('home_status_over')} ฿{fmt(overBy)}
        </p>
      )}
      {hasPlan ? (
        <div className="mt-auto">
          <div className="flex justify-between flex-wrap gap-2 text-xs text-white/80 mb-2">
            <span>
              {t('ux_month_spent')} ฿{fmtRound(brief.monthSpent)}
            </span>
            <span>฿{fmtRound(brief.monthlyLimit!)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t('home_month_used')}
            aria-valuenow={Math.round(monthPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 rounded-full bg-black/20 overflow-hidden"
          >
            <div className="h-full rounded-full bg-brand-200" style={{ width: `${monthPct}%` }} />
          </div>
          <div className="flex items-end justify-between gap-4 mt-6 pt-5 border-t border-white/15">
            <div>
              <p className="text-xs text-white/75">{t('home_spent_today')}</p>
              <p className="text-xl font-bold tabular-nums mt-1">฿{fmtRound(brief.spentToday)}</p>
            </div>
            <button
              onClick={() => navigate('/budget')}
              className="min-h-11 flex items-center gap-2 text-xs font-semibold text-white/90 text-right"
            >
              {brief.daysRemaining} {t('home_days_left')}
              <Icon path={mdiArrowTopRight} size={0.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-auto">
          <div className="flex items-center justify-between text-sm py-4 border-t border-white/15">
            <span className="text-white/75">{t('ux_month_spent')}</span>
            <span className="font-bold tabular-nums">฿{fmtRound(brief.monthSpent)}</span>
          </div>
          <button
            onClick={() => navigate('/budget')}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand-100 text-brand-900 w-full px-4 py-3 text-sm font-bold"
          >
            <Icon path={mdiTargetVariant} size={0.8} />
            {t('home_set_plan')}
          </button>
        </div>
      )}
    </section>
  )
}
