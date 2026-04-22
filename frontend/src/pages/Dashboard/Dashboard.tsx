import { useState } from 'react'
import Icon from '@mdi/react'
import {
  mdiTrendingDown, mdiTrendingUp, mdiWallet,
  mdiSwapVertical, mdiChevronLeft, mdiChevronRight,
  mdiEmoticonHappy,
  mdiEmoticonSad,
} from '@mdi/js'
import { Card, Skeleton, Amount } from '../../components/ui'
import SpendingPieChart from '../../components/charts/SpendingPieChart'
import TrendLineChart from '../../components/charts/TrendLineChart'
import AllocationWallets from '../../components/allocations/AllocationWallets'
import { useSummary, useCategoryBreakdown, useMonthlyTrend, currentMonth } from '../../hooks'
import { useT } from '../../store/i18n.store'

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

export default function Dashboard() {
  const t    = useT()
  const lang = localStorage.getItem('flo_lang') ?? 'th'
  const [month, setMonth] = useState(currentMonth())
  const isCurrentMonth = month === currentMonth()

  const { data: summary,    loading: loadingSum }   = useSummary(month)
  const { data: categories, loading: loadingCat }   = useCategoryBreakdown(month, 'expense')
  const { data: trend,      loading: loadingTrend } = useMonthlyTrend()

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

      {/* ── Spending by Category (Pie) ── */}
      <Card className="animate-fade-up delay-75">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base-theme text-sm">{t('spending_category')}</h2>
          <span className="text-xs text-muted-theme font-medium">{t('this_month')}</span>
        </div>
        <SpendingPieChart data={categories} loading={loadingCat} />
      </Card>

      {/* ── 12-Month Trend ── */}
      <Card className="animate-fade-up delay-150">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base-theme text-sm">{t('trend_12m')}</h2>
          <div className="flex items-center gap-3 text-xs text-muted-theme">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" /> {t('spent')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {t('income')}
            </span>
          </div>
        </div>
        <TrendLineChart data={trend} loading={loadingTrend} />
      </Card>

      {/* ── Wallet Balances ── */}
      <AllocationWallets />

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
