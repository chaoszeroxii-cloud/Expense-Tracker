import { useState, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiTrendingDown, mdiTrendingUp, mdiWallet,
  mdiSwapVertical, mdiChevronLeft, mdiChevronRight,
  mdiEmoticonHappy, mdiEmoticonSad,
  mdiChartBar, mdiCashMultiple, mdiShield, mdiChevronRight as mdiChevronRightIcon,
} from '@mdi/js'
import { Card, Skeleton, Amount } from '../../components/ui'
import SpendingPieChart from '../../components/charts/SpendingPieChart'
import AllocationWallets from '../../components/allocations/AllocationWallets'
import {
  useSummary, useCategoryBreakdown, useMonthlyTrend, currentMonth,
  useBudgetSummary, useLoanSummary, useEmergencyFund,
} from '../../hooks'
import { useT } from '../../store/i18n.store'

// Lazy-loaded heavy chart section (pulls in recharts)
const TrendSection = lazy(() => import('../../components/charts/TrendSection'))

function monthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMonthLabel(ym: string, lang = 'th') {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-US',
    { month: 'long', year: 'numeric' },
  )
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export default function Dashboard() {
  const t    = useT()
  const navigate = useNavigate()
  const lang = localStorage.getItem('flo_lang') ?? 'th'
  const [month, setMonth] = useState(currentMonth())
  const isCurrentMonth = month === currentMonth()

  const { data: summary,    loading: loadingSum,    refetch: refetchSummary }   = useSummary(month)
  const { data: categories, loading: loadingCat,    refetch: refetchCat }       = useCategoryBreakdown(month, 'expense')
  const { data: trend,      loading: loadingTrend,  refetch: refetchTrend }     = useMonthlyTrend()
  const { data: budgets,    loading: loadingBudget, refetch: refetchBudget }    = useBudgetSummary(month)
  const { data: loanData,   loading: loadingLoans,  refetch: refetchLoans }     = useLoanSummary()
  const { data: efData,     loading: loadingEF,     refetch: refetchEF }        = useEmergencyFund(6)

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('dashboard') || types.includes('transactions')) {
        refetchSummary(); refetchCat(); refetchTrend(); refetchEF()
      }
      if (types.includes('dashboard') || types.includes('budget')) refetchBudget()
      if (types.includes('dashboard') || types.includes('loans')) refetchLoans()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [refetchSummary, refetchCat, refetchTrend, refetchBudget, refetchLoans, refetchEF])

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-base-theme tracking-tight">MoneyFlow</h1>
          <p className="text-xs text-muted-theme font-medium mt-0.5">Expense Tracker</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon path={mdiWallet} size={0.8} color="#4f46e5" />
        </div>
      </div>

      {/* ── Hero Summary Card ── */}
      <div className="relative rounded-3xl overflow-hidden bg-brand-600 text-white px-5 pt-5 pb-6
                      shadow-xl shadow-brand-500/30 animate-fade-up">
        <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-60 top-10 w-60 h-60 rounded-full bg-brand-900/50" />
        <div className="absolute right-10 bottom-20 w-40 h-40 rounded-full bg-brand-700/50" />
        <div className="absolute right-32 top-40 w-20 h-20 rounded-full bg-brand-700/30" />

        {/* Month selector */}
        <div className="flex items-center justify-between mb-4 relative z-10">
          <button
            onClick={() => setMonth(m => monthOffset(m, -1))}
            className="p-1.5 rounded-full bg-white/20 active:bg-white/30 transition-colors"
          >
            <Icon path={mdiChevronLeft} size={0.7} color="white" />
          </button>
          <span className="text-sm font-semibold text-white/90">
            {formatMonthLabel(month, lang)}
          </span>
          <button
            onClick={() => setMonth(m => monthOffset(m, 1))}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-full bg-white/20 active:bg-white/30 transition-colors
                       disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Icon path={mdiChevronRight} size={0.7} color="white" />
          </button>
        </div>

        {/* Total expense */}
        <p className="text-xs font-medium text-white/60 mb-1 relative z-10">{t('total_expenses')}</p>
        {loadingSum
          ? <div className="h-10 w-36 rounded-xl bg-white/20 animate-pulse mb-4" />
          : (
            <p className="text-4xl font-extrabold tracking-tight mb-4 relative z-10">
              ฿{(summary?.totalExpense ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
            </p>
          )
        }

        {/* Sub stats */}
        <div className="flex gap-3 relative z-10">
          <StatPill
            icon={mdiTrendingUp}
            label={t('income')}
            value={loadingSum ? null : summary?.totalIncome ?? 0}
            color="emerald"
          />
          <StatPill
            icon={mdiTrendingDown}
            label={t('avg_per_day')}
            value={loadingSum ? null : summary?.avgPerDay ?? 0}
            color="amber"
          />
          <StatPill
            icon={mdiSwapVertical}
            label={t('transactions')}
            valueText={loadingSum ? null : String(summary?.transactionCount ?? 0)}
            color="sky"
          />
        </div>
      </div>

      {/* ── Net Balance ── */}
      {!loadingSum && summary && (
        <Card className="animate-fade-up delay-225">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-theme font-medium mb-0.5">{t('net_balance')}</p>
              <Amount value={summary.net} type="net" size="lg" />
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl
              ${summary.net >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
              {summary.net >= 0 ? <Icon path={mdiEmoticonHappy} size={1} color="#00ff33" /> : <Icon path={mdiEmoticonSad} size={1} color="#ff0000" />}
            </div>
          </div>
          {summary.net < 0 && (
            <p className="text-xs text-rose-400 mt-2 font-medium">
              −฿{Math.abs(summary.net).toLocaleString()}
            </p>
          )}
        </Card>
      )}

      {/* ── Spending by Category (Pie) ── */}
      <Card className="animate-fade-up delay-75">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base-theme text-sm">{t('spending_category')}</h2>
          <span className="text-xs text-muted-theme font-medium">{t('this_month')}</span>
        </div>
        <SpendingPieChart data={categories} loading={loadingCat} />
      </Card>

      {/* ── 12-Month Trend (collapsible + analysis) ── */}
      <Suspense fallback={<Skeleton className="h-44 w-full rounded-3xl" />}>
        <TrendSection
          trend={trend}
          loadingTrend={loadingTrend}
          categories={categories}
          lang={lang}
        />
      </Suspense>

      {/* ── Budget Progress ── */}
      {!loadingBudget && budgets && budgets.length > 0 && (
        <Card className="animate-fade-up">
          <button
            onClick={() => navigate('/budget')}
            className="flex items-center justify-between w-full mb-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <Icon path={mdiChartBar} size={0.7} color="#6366f1" />
              </div>
              <h2 className="font-bold text-base-theme text-sm">งบประมาณเดือนนี้</h2>
            </div>
            <Icon path={mdiChevronRightIcon} size={0.7} className="text-muted-theme" />
          </button>
          <div className="space-y-3">
            {budgets.slice(0, 4).map(b => {
              const pct = b.budgeted > 0 ? Math.min(100, (b.actual / b.budgeted) * 100) : 0
              const over = b.actual > b.budgeted
              return (
                <div key={b.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-base-theme font-medium">{b.categoryIcon} {b.categoryName}</span>
                    <span className={over ? 'text-red-500 font-semibold' : 'text-muted-theme'}>
                      {over ? `เกิน ฿${fmt(b.actual - b.budgeted)}` : `฿${fmt(b.actual)} / ฿${fmt(b.budgeted)}`}
                    </span>
                  </div>
                  <div className="w-full bg-[var(--input)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {budgets.length > 4 && (
              <p className="text-xs text-muted-theme text-center">+{budgets.length - 4} หมวดอื่น</p>
            )}
          </div>
        </Card>
      )}

      {/* ── Emergency Fund ── */}
      {!loadingEF && efData && (
        <Card className="animate-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Icon path={mdiShield} size={0.7} color="#f59e0b" />
            </div>
            <h2 className="font-bold text-base-theme text-sm">เงินสำรองฉุกเฉิน</h2>
          </div>
          <div className="w-full bg-[var(--input)] rounded-full h-3 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${efData.progress >= 100 ? 'bg-emerald-500' : efData.progress >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
              style={{ width: `${efData.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-theme">฿{fmt(efData.currentAmount)}</span>
            <span className={`font-semibold ${efData.progress >= 100 ? 'text-emerald-500' : 'text-muted-theme'}`}>
              {efData.progress >= 100 ? '✓ ครบแล้ว!' : `${efData.progress.toFixed(0)}% (เป้า ฿${fmt(efData.suggestedTarget)})`}
            </span>
          </div>
          {efData.remaining > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">ต้องออมอีก ฿{fmt(efData.remaining)} เพื่อครบ {efData.targetMonths} เดือน</p>
          )}
        </Card>
      )}

      {/* ── Loan Summary ── */}
      {!loadingLoans && loanData && loanData.activeLoans > 0 && (() => {
        const lent     = loanData.loans.filter((l: any) => l.direction === 'lent')
        const borrowed = loanData.loans.filter((l: any) => l.direction === 'borrowed')
        return (
          <Card className="animate-fade-up">
            <button onClick={() => navigate('/loans')} className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <Icon path={mdiCashMultiple} size={0.7} color="#f59e0b" />
                </div>
                <h2 className="font-bold text-base-theme text-sm">หนี้สิน</h2>
              </div>
              <Icon path={mdiChevronRightIcon} size={0.7} className="text-muted-theme" />
            </button>

            {/* ลูกหนี้ (lent) */}
            {lent.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-1.5 uppercase tracking-wide">ลูกหนี้</p>
                <div className="space-y-1.5">
                  {lent.slice(0, 3).map((loan: any) => (
                    <div key={loan.id} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-0">
                      <span className="text-sm text-base-theme font-medium">{loan.borrower}</span>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">฿{fmt(loan.outstanding)}</span>
                    </div>
                  ))}
                  {lent.length > 3 && <p className="text-xs text-muted-theme text-center">+{lent.length - 3} คนอื่น</p>}
                </div>
              </div>
            )}

            {/* เจ้าหนี้ (borrowed) */}
            {borrowed.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold mb-1.5 uppercase tracking-wide">ต้องคืน</p>
                <div className="space-y-1.5">
                  {borrowed.slice(0, 2).map((loan: any) => (
                    <div key={loan.id} className="flex items-center justify-between py-1 border-b border-[var(--border)] last:border-0">
                      <span className="text-sm text-base-theme font-medium">{loan.borrower}</span>
                      <span className="text-sm font-bold text-rose-500 dark:text-rose-400">฿{fmt(loan.outstanding)}</span>
                    </div>
                  ))}
                  {borrowed.length > 2 && <p className="text-xs text-muted-theme text-center">+{borrowed.length - 2} รายการ</p>}
                </div>
              </div>
            )}

            {/* Summary row */}
            <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
              {lent.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-theme">ลูกหนี้ค้างทั้งหมด</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">฿{fmt(loanData.totalOutstanding)}</span>
                </div>
              )}
              {borrowed.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-theme">ที่ต้องคืนทั้งหมด</span>
                  <span className="font-bold text-rose-500 dark:text-rose-400">฿{fmt(loanData.totalOwed)}</span>
                </div>
              )}
            </div>
          </Card>
        )
      })()}

      {/* ── Wallet Balances ── */}
      <AllocationWallets />
    </div>
  )
}

function StatPill({ icon, label, value, valueText, color }: {
  icon: string; label: string
  value?: number | null; valueText?: string | null; color: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-200',
    amber:   'bg-amber-500/20 text-amber-200',
    sky:     'bg-sky-500/20 text-sky-200',
  }
  return (
    <div className={`flex-1 rounded-2xl px-3 py-2 ${colorMap[color]}`}>
      <div className="flex items-center gap-1 mb-1 opacity-80">
        <Icon path={icon} size={0.6} />
        <span className="text-[10px] font-semibold">{label}</span>
      </div>
      {value === null || valueText === null
        ? <div className="h-4 w-10 rounded bg-white/20 animate-pulse" />
        : <p className="text-sm font-bold">
            {valueText ?? `฿${(value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
          </p>
      }
    </div>
  )
}
