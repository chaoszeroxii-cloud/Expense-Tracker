import Icon from '@mdi/react'
import {
  mdiTrendingDown, mdiTrendingUp, mdiCalendarWeek,
  mdiLightbulbOnOutline, mdiAlertCircleOutline, mdiCheckCircleOutline,
} from '@mdi/js'
import clsx from 'clsx'
import { Card, Skeleton, ErrorState, IconDisplay } from '../ui'
import { useT, useI18n } from '../../store/i18n.store'
import { fmt, fmtRound } from '../../utils/money'
import type { WeeklyReview } from '../../types'

/**
 * The weekly half of the reward loop: enough to notice a change, not a dashboard.
 *
 * Every figure comes from SQL rather than a model — exact, free, instant, and each line
 * traceable to a query. It also cannot fail with a timeout, which matters for something
 * meant to be a small pleasant moment rather than a loading state.
 */
export default function WeeklyReviewCard({ data, loading, error, onRetry }: {
  data: WeeklyReview | null
  loading: boolean
  error?: string | null
  onRetry?: () => void
}) {
  const t = useT()
  const { lang } = useI18n()

  if (loading) return <Skeleton className="h-40 w-full rounded-3xl" />
  if (error) return (
    <Card><ErrorState compact message={t('err_load_failed')} onRetry={onRetry} retryLabel={t('action_retry')} /></Card>
  )
  if (!data) return null

  const improved = data.delta < 0
  const hasData = data.thisWeek > 0 || data.lastWeek > 0

  const formatDay = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(
      lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' },
    )

  return (
    <Card className="animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon path={mdiCalendarWeek} size={0.7} color="#4f46e5" />
        </div>
        <h2 className="font-bold text-base-theme text-sm">{t('wk_title')}</h2>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-theme text-center py-4">{t('wk_no_data')}</p>
      ) : (
        <>
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs text-muted-theme mb-0.5">{t('wk_spent')}</p>
              <p className="text-3xl font-extrabold text-base-theme tabular-nums">
                ฿{fmtRound(data.thisWeek)}
              </p>
            </div>
            {data.lastWeek > 0 && (
              <div className={clsx(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold',
                improved
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
              )}>
                <Icon path={improved ? mdiTrendingDown : mdiTrendingUp} size={0.6} />
                {improved ? '−' : '+'}฿{fmtRound(Math.abs(data.delta))}
                {data.deltaPct !== null && ` (${Math.abs(data.deltaPct)}%)`}
              </div>
            )}
          </div>

          <dl className="space-y-2 text-xs">
            <Row label={t('wk_daily_avg')} value={`฿${fmt(data.dailyAverage)}`} />
            {data.topCategory && (
              <Row
                label={t('wk_top_category')}
                value={`฿${fmtRound(data.topCategory.total)} · ${data.topCategory.share}%`}
                prefix={
                  <span className="inline-flex items-center gap-1">
                    <IconDisplay icon={data.topCategory.icon ?? 'other'} color={data.topCategory.color ?? undefined} size="sm" />
                    {data.topCategory.name}
                  </span>
                }
              />
            )}
            {data.biggestDay && (
              <Row label={t('wk_biggest_day')} value={`฿${fmtRound(data.biggestDay.total)}`} prefix={formatDay(data.biggestDay.date)} />
            )}
          </dl>
        </>
      )}

      {data.action && <ActionLine action={data.action} />}
    </Card>
  )
}

function Row({ label, value, prefix }: { label: string; value: string; prefix?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-theme shrink-0">{label}</dt>
      <dd className="flex items-center gap-2 min-w-0 text-base-theme font-semibold">
        {prefix && <span className="truncate text-muted-theme font-medium">{prefix}</span>}
        <span className="tabular-nums shrink-0">{value}</span>
      </dd>
    </div>
  )
}

/** One suggestion, never a list — a review ending in five is one nobody acts on. */
function ActionLine({ action }: { action: NonNullable<WeeklyReview['action']> }) {
  const t = useT()

  const config = {
    spending_down:   { icon: mdiCheckCircleOutline,  color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', tone: 'text-emerald-700 dark:text-emerald-300' },
    over_plan:       { icon: mdiAlertCircleOutline,  color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',     tone: 'text-amber-700 dark:text-amber-300' },
    reduce_category: { icon: mdiLightbulbOnOutline,  color: '#6366f1', bg: 'bg-slate-50 dark:bg-slate-700/40',     tone: 'text-base-theme' },
    set_plan:        { icon: mdiLightbulbOnOutline,  color: '#6366f1', bg: 'bg-slate-50 dark:bg-slate-700/40',     tone: 'text-base-theme' },
    need_more_data:  { icon: mdiLightbulbOnOutline,  color: '#94a3b8', bg: 'bg-slate-50 dark:bg-slate-700/40',     tone: 'text-muted-theme' },
  }[action.kind]

  const text =
    action.kind === 'spending_down'   ? `${t('wk_act_down')} ฿${fmtRound(action.amount)}`
    : action.kind === 'over_plan'     ? `${t('wk_act_over')} ฿${fmtRound(action.amount)}`
    : action.kind === 'reduce_category' ? `${t('wk_act_reduce')} ${action.categoryName} — ฿${fmtRound(action.amount)}`
    : action.kind === 'set_plan'      ? t('wk_act_set_plan')
    : t('wk_act_more_data')

  return (
    <div className={clsx('flex items-start gap-2.5 rounded-2xl px-3.5 py-3 mt-4', config.bg)}>
      <Icon path={config.icon} size={0.75} color={config.color} className="shrink-0 mt-0.5" />
      <p className={clsx('text-xs font-medium leading-relaxed', config.tone)}>{text}</p>
    </div>
  )
}
