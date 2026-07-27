import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiPlus, mdiTargetVariant, mdiNotebookOutline } from '@mdi/js'
import clsx from 'clsx'
import { useT } from '../../store/i18n.store'
import { WorkTimeBadge } from '../ui'
import { fmt, fmtRound } from '../../utils/money'
import type { DailyBrief } from '../../types'

/**
 * The one figure the home screen exists to deliver: what is still spendable today.
 *
 * The old hero showed total spend for the month — accurate, backward-looking, and
 * useless at the moment of a purchase. This answers "can I buy this?" instead.
 *
 * Two rules this component must never break:
 *   1. The number is a *planned* allowance. It is not derived from `totalBalance`
 *      (which starts at zero and only counts what was recorded here), so it must
 *      always carry the caveat that it is not a bank balance.
 *   2. No plan means no number. Rendering ฿0 would read as "spend nothing today",
 *      which is a different and false claim.
 */
export default function SafeToSpendCard({ brief }: { brief: DailyBrief }) {
  const t = useT()
  const navigate = useNavigate()

  const hasPlan = brief.monthlyLimit !== null && brief.safeToday !== null
  const overBy = hasPlan ? Math.max(0, brief.monthSpent - brief.monthlyLimit!) : 0

  // Status drives colour; brand purple is kept out of it so the state reads at a glance.
  const tone = !hasPlan
    ? { ring: 'from-slate-600 to-slate-700', bar: 'bg-slate-400', text: 'text-white' }
    : brief.planStatus === 'over'
      ? { ring: 'from-rose-600 to-rose-700',       bar: 'bg-rose-300',    text: 'text-white' }
      : brief.planStatus === 'close'
        ? { ring: 'from-amber-500 to-amber-600',   bar: 'bg-amber-200',   text: 'text-white' }
        : { ring: 'from-emerald-600 to-emerald-700', bar: 'bg-emerald-300', text: 'text-white' }

  const statusLabel = brief.planStatus === 'over'  ? t('home_status_over')
                    : brief.planStatus === 'close' ? t('home_status_close')
                    : t('home_status_on_track')

  const monthPct = hasPlan && brief.monthlyLimit! > 0
    ? Math.min(100, (brief.monthSpent / brief.monthlyLimit!) * 100)
    : 0

  return (
    <div className={clsx(
      'relative rounded-3xl overflow-hidden px-5 pt-5 pb-5 shadow-xl animate-fade-up',
      'bg-gradient-to-br', tone.ring, tone.text,
    )}>
      <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10 blur-2xl" />

      {/* ── Track-only: no limit exists to compare against ── */}
      {brief.mode === 'track_only' ? (
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon path={mdiNotebookOutline} size={0.6} color="rgba(255,255,255,0.7)" />
            <p className="text-xs font-medium text-white/70">{t('home_track_only')}</p>
          </div>
          <p className="text-xs text-white/60 mb-3">{t('home_track_only_body')}</p>

          <p className="text-xs font-medium text-white/60 mb-1">{t('home_spent_today')}</p>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums">
            ฿{fmtRound(brief.spentToday)}
          </p>
          <WorkTimeBadge amount={brief.spentToday} className="!text-white/60 mt-1" />

          <button
            onClick={() => navigate('/budget')}
            className="mt-4 w-full py-2.5 rounded-xl bg-white/20 text-white text-sm font-semibold
                       active:bg-white/30 transition-colors"
          >
            {t('home_set_plan')}
          </button>
        </div>

      /* ── No plan yet: ask for the one number, do not invent it ── */
      ) : !hasPlan ? (
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon path={mdiTargetVariant} size={0.6} color="rgba(255,255,255,0.7)" />
            <p className="text-xs font-medium text-white/70">{t('home_no_plan_title')}</p>
          </div>
          <p className="text-xs text-white/70 leading-relaxed mb-4">{t('home_no_plan_body')}</p>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-xs text-white/60">{t('home_spent_today')}</span>
            <span className="text-2xl font-extrabold tabular-nums">฿{fmtRound(brief.spentToday)}</span>
          </div>

          <button
            onClick={() => navigate('/budget')}
            className="w-full py-3 rounded-xl bg-white text-slate-900 text-sm font-bold
                       active:scale-[0.98] transition-transform"
          >
            {t('home_set_plan')}
          </button>
        </div>

      /* ── The daily number ── */
      ) : (
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-white/70">{t('home_safe_today')}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">
              {statusLabel}
            </span>
          </div>

          <p className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums mt-1">
            ฿{fmtRound(brief.safeToday!)}
          </p>

          {/* The caveat is not optional: this figure is a plan, not cash on hand. */}
          <p className="text-[10px] text-white/60 mt-1.5">{t('home_safe_caveat')}</p>
          <WorkTimeBadge amount={brief.safeToday!} className="!text-white/70 mt-1" />

          {brief.planStatus === 'over' && overBy > 0 && (
            <p className="text-xs font-semibold text-white mt-3 bg-white/15 rounded-xl px-3 py-2">
              {t('home_status_over')} ฿{fmt(overBy)}
            </p>
          )}

          {/* ── Month progress ── */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-white/70 mb-1.5">
              <span>{t('home_month_used')} ฿{fmtRound(brief.monthSpent)} / ฿{fmtRound(brief.monthlyLimit!)}</span>
              <span>{brief.daysRemaining} {t('home_days_left')}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', tone.bar)}
                   style={{ width: `${monthPct}%` }} />
            </div>
          </div>

          {/* ── Today's spend, secondary ── */}
          <div className="flex items-center justify-between mt-4">
            <div>
              <p className="text-[11px] text-white/60">{t('home_spent_today')}</p>
              <p className="text-lg font-bold tabular-nums">฿{fmtRound(brief.spentToday)}</p>
            </div>
            <button
              onClick={() => navigate('/add')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-slate-900
                         text-sm font-bold active:scale-95 transition-transform"
            >
              <Icon path={mdiPlus} size={0.7} />
              {t('home_add_expense')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
