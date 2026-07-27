import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiCheck, mdiChevronLeft, mdiChevronRight, mdiTrendingUp, mdiSwapVertical, mdiTrendingDown } from '@mdi/js'
import { Card, Skeleton, Amount, ErrorState } from '../../components/ui'
import SpendingPieChart from '../../components/charts/SpendingPieChart'
import WeeklyReviewCard from '../../components/charts/WeeklyReviewCard'
import {
  useSummary, useCategoryBreakdown, useMonthlyTrend, currentMonth,
  useEmergencyFund, useRecommendationsOnDemand, useWeeklyReview,
} from '../../hooks'
import { useT, useI18n } from '../../store/i18n.store'
import { monthOffset } from '../../utils/localDate'
import { fmt } from '../../utils/money'

// Recharts is ~550kB; it only loads once someone actually opens this page.
const TrendSection      = lazy(() => import('../../components/charts/TrendSection'))
const MonthlyBarSection = lazy(() => import('../../components/charts/MonthlyBarSection'))
const AiInsightsSection = lazy(() => import('../../components/charts/AiInsightsSection'))

function formatMonthLabel(ym: string, lang = 'th') {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-US',
    { month: 'long', year: 'numeric' },
  )
}

/**
 * Everything that used to sit below the fold on Home.
 *
 * Charts answer "what happened over time", which is a question people ask
 * occasionally — not the one they open the app with. Moving them here keeps the
 * daily screen to a single request and defers the chart bundle entirely.
 */
export default function Reports() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonth())
  const isCurrentMonth = month === currentMonth()

  const { data: summary,    loading: loadingSum,   error: errorSum,   refetch: refetchSum }   = useSummary(month)
  const { data: categories, loading: loadingCat,   error: errorCat,   refetch: refetchCat }   = useCategoryBreakdown(month, 'expense')
  const { data: trend,      loading: loadingTrend }                                            = useMonthlyTrend()
  const { data: efData,     loading: loadingEF }                                               = useEmergencyFund(6)
  const { data: weekly, loading: loadingWeekly, error: errorWeekly, refetch: refetchWeekly }   = useWeeklyReview()
  const aiInsights = useRecommendationsOnDemand()

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('dashboard') || types.includes('transactions')) { refetchSum(); refetchCat() }
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [refetchSum, refetchCat])

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">{t('reports_title')}</h1>
        <p className="text-sm text-muted-theme mt-0.5">{t('reports_subtitle')}</p>
      </div>

      {/* ── This week, from SQL rather than a model ── */}
      <WeeklyReviewCard
        data={weekly}
        loading={loadingWeekly}
        error={errorWeekly}
        onRetry={refetchWeekly}
      />

      {/* ── Month selector + totals ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setMonth(m => monthOffset(m, -1))}
            aria-label="Previous month"
            className="p-1.5 rounded-full bg-[var(--input)] active:opacity-70 transition-opacity"
          >
            <Icon path={mdiChevronLeft} size={0.7} className="text-base-theme" />
          </button>
          <span className="text-sm font-bold text-base-theme">{formatMonthLabel(month, lang)}</span>
          <button
            onClick={() => setMonth(m => monthOffset(m, 1))}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="p-1.5 rounded-full bg-[var(--input)] active:opacity-70 transition-opacity
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Icon path={mdiChevronRight} size={0.7} className="text-base-theme" />
          </button>
        </div>

        {loadingSum ? (
          <Skeleton className="h-16 w-full" />
        ) : errorSum ? (
          <ErrorState compact message={t('err_load_failed')} onRetry={refetchSum} retryLabel={t('action_retry')} />
        ) : summary && (
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={mdiTrendingDown} label={t('total_expenses')} value={summary.totalExpense} tone="text-rose-500" />
            <Stat icon={mdiTrendingUp}   label={t('income')}         value={summary.totalIncome}  tone="text-emerald-500" />
            <div className="rounded-2xl bg-[var(--input)] px-3 py-2.5">
              <div className="flex items-center gap-1 mb-1 text-muted-theme">
                <Icon path={mdiSwapVertical} size={0.55} />
                <span className="text-[10px] font-semibold">{t('transactions')}</span>
              </div>
              <p className="text-sm font-bold text-base-theme tabular-nums">{summary.transactionCount}</p>
            </div>
          </div>
        )}

        {!loadingSum && !errorSum && summary && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-theme">
            <span className="text-xs text-muted-theme font-medium">{t('net_balance')}</span>
            <Amount value={summary.net} type="net" size="md" />
          </div>
        )}
      </Card>

      {/* ── Spending by category ── */}
      <Card>
        <h2 className="font-bold text-base-theme text-sm mb-4">{t('spending_category')}</h2>
        <SpendingPieChart
          data={categories}
          loading={loadingCat}
          error={errorCat}
          onRetry={refetchCat}
          onAdd={() => navigate('/add')}
        />
      </Card>

      <Suspense fallback={<Skeleton className="h-44 w-full rounded-3xl" />}>
        <TrendSection trend={trend} loadingTrend={loadingTrend} categories={categories} lang={lang} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-14 w-full rounded-3xl" />}>
        <MonthlyBarSection trend={trend} loadingTrend={loadingTrend} lang={lang} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-14 w-full rounded-3xl" />}>
        <AiInsightsSection
          data={aiInsights.data}
          loading={aiInsights.loading}
          error={aiInsights.error}
          onRun={aiInsights.run}
          hasRun={aiInsights.hasRun}
        />
      </Suspense>

      {/* ── Emergency fund ── */}
      {!loadingEF && efData && (
        <Card>
          <h2 className="font-bold text-base-theme text-sm mb-3">{t('dash_emergency_fund')}</h2>
          <div className="w-full bg-[var(--input)] rounded-full h-3 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${
                efData.progress >= 100 ? 'bg-emerald-500' : efData.progress >= 60 ? 'bg-amber-500' : 'bg-rose-400'
              }`}
              style={{ width: `${Math.min(100, efData.progress)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-theme">฿{fmt(efData.currentAmount)}</span>
            <span className={`font-semibold flex items-center gap-1 ${efData.progress >= 100 ? 'text-emerald-500' : 'text-muted-theme'}`}>
              {efData.progress >= 100
                ? <><Icon path={mdiCheck} size={0.5} aria-hidden="true" />{t('dash_ef_complete')}</>
                : `${efData.progress.toFixed(0)}% (${t('dash_ef_target')} ฿${fmt(efData.suggestedTarget)})`}
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-[var(--input)] px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1 text-muted-theme">
        <Icon path={icon} size={0.55} />
        <span className="text-[10px] font-semibold">{label}</span>
      </div>
      <p className={`text-sm font-bold tabular-nums ${tone}`}>฿{fmt(value)}</p>
    </div>
  )
}
