import { useState } from 'react'
import Icon from '@mdi/react'
import {
  mdiChevronDown, mdiChevronUp,
  mdiTrendingDown, mdiTrendingUp, mdiTrendingNeutral,
  mdiLightbulbOutline, mdiAlertCircleOutline, mdiCheckCircleOutline,
} from '@mdi/js'
import clsx from 'clsx'
import { Card } from '../ui'
import TrendLineChart from './TrendLineChart'
import { useT } from '../../store/i18n.store'
import type { MonthlyTrend, CategoryBreakdown } from '../../types'

// ── Helpers ────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

// ── Analysis derivation ────────────────────────────────────────
interface Analysis {
  expenseChange: number
  incomeChange: number
  thisMonthExpense: number
  prevMonthExpense: number
  thisMonthIncome: number
  topCategory: CategoryBreakdown | null
  savingsRate: number
}

function deriveAnalysis(
  trend: MonthlyTrend[],
  categories: CategoryBreakdown[],
): Analysis | null {
  if (trend.length < 1) return null
  const sorted = [...trend].sort((a, b) => b.month.localeCompare(a.month))
  const curr = sorted[0]
  const prev = sorted[1] ?? null

  const thisMonthExpense = curr.expense
  const prevMonthExpense = prev?.expense ?? 0
  const thisMonthIncome  = curr.income
  const expenseChange = pctChange(thisMonthExpense, prevMonthExpense)
  const incomeChange  = prev ? pctChange(thisMonthIncome, prev.income) : 0
  const topCategory   = categories.length > 0
    ? [...categories].sort((a, b) => b.total - a.total)[0]
    : null
  const savingsRate = thisMonthIncome > 0
    ? Math.round(((thisMonthIncome - thisMonthExpense) / thisMonthIncome) * 100)
    : 0

  return {
    expenseChange, incomeChange,
    thisMonthExpense, prevMonthExpense, thisMonthIncome,
    topCategory, savingsRate,
  }
}

// ── Insight Pill ───────────────────────────────────────────────
function InsightPill({
  icon, iconColor, bg, children,
}: {
  icon: string; iconColor: string; bg: string; children: React.ReactNode
}) {
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-2xl px-3.5 py-3', bg)}>
      <div className="flex-shrink-0 mt-0.5">
        <Icon path={icon} size={0.75} color={iconColor} />
      </div>
      <p className="text-xs font-medium leading-relaxed text-base-theme">{children}</p>
    </div>
  )
}

// ── Analysis Panel ─────────────────────────────────────────────
function AnalysisPanel({
  analysis,
  lang,
}: {
  analysis: Analysis
  lang: string
}) {
  const isTh = lang === 'th'

  const {
    expenseChange, incomeChange,
    thisMonthExpense, prevMonthExpense, thisMonthIncome,
    topCategory, savingsRate,
  } = analysis

  const insights: Array<{
    icon: string; iconColor: string; bg: string; text: string
  }> = []

  // 1. Expense vs last month
  if (expenseChange > 20) {
    insights.push({
      icon: mdiAlertCircleOutline,
      iconColor: '#f43f5e',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      text: isTh
        ? `รายจ่ายเดือนนี้ ฿${fmt(thisMonthExpense)} สูงกว่าเดือนที่แล้ว ${Math.abs(expenseChange)}% (฿${fmt(prevMonthExpense)}) — ควรตรวจสอบหมวดหมู่ที่ใช้จ่ายมากผิดปกติ`
        : `Spending ฿${fmt(thisMonthExpense)} is ${Math.abs(expenseChange)}% higher than last month (฿${fmt(prevMonthExpense)}) — review unusually high categories.`,
    })
  } else if (expenseChange < -10) {
    insights.push({
      icon: mdiCheckCircleOutline,
      iconColor: '#10b981',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: isTh
        ? `ยอดเยี่ยม! รายจ่ายเดือนนี้ลดลง ${Math.abs(expenseChange)}% เมื่อเทียบเดือนที่แล้ว — คุณควบคุมค่าใช้จ่ายได้ดีขึ้น`
        : `Great job! Spending dropped ${Math.abs(expenseChange)}% vs last month — your budget discipline is paying off.`,
    })
  } else if (prevMonthExpense > 0) {
    insights.push({
      icon: mdiTrendingNeutral,
      iconColor: '#6366f1',
      bg: 'bg-brand-50 dark:bg-brand-900/20',
      text: isTh
        ? `รายจ่ายเดือนนี้ใกล้เคียงกับเดือนที่แล้ว (เปลี่ยนแปลง ${expenseChange > 0 ? '+' : ''}${expenseChange}%) — รูปแบบการใช้จ่ายคงที่`
        : `Spending is in line with last month (${expenseChange > 0 ? '+' : ''}${expenseChange}%) — consistent spending pattern.`,
    })
  }

  // 2. Top category
  if (topCategory) {
    const isHigh = topCategory.percentage >= 40
    insights.push({
      icon: isHigh ? mdiAlertCircleOutline : mdiLightbulbOutline,
      iconColor: isHigh ? '#f97316' : '#818cf8',
      bg: isHigh
        ? 'bg-orange-50 dark:bg-orange-900/20'
        : 'bg-slate-50 dark:bg-slate-700/40',
      text: isTh
        ? `หมวดหมู่ที่ใช้จ่ายสูงสุดคือ "${topCategory.categoryName}" คิดเป็น ${topCategory.percentage}% ของรายจ่ายทั้งหมด (฿${fmt(topCategory.total)})${isHigh ? ' — ลองตั้งงบให้หมวดนี้เพื่อควบคุมค่าใช้จ่าย' : ''}`
        : `Top spending category: "${topCategory.categoryName}" at ${topCategory.percentage}% of total expenses (฿${fmt(topCategory.total)})${isHigh ? ' — consider setting a budget cap.' : '.'}`,
    })
  }

  // 3. Savings rate
  if (thisMonthIncome > 0) {
    if (savingsRate >= 20) {
      insights.push({
        icon: mdiCheckCircleOutline,
        iconColor: '#10b981',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: isTh
          ? `อัตราการออมเดือนนี้ ${savingsRate}% — ดีมาก! ลองแบ่งเงินส่วนหนึ่งเข้าซองเงินออมหรือลงทุน`
          : `Savings rate this month: ${savingsRate}% — excellent! Consider moving some to a savings or investment wallet.`,
      })
    } else if (savingsRate > 0) {
      insights.push({
        icon: mdiLightbulbOutline,
        iconColor: '#f59e0b',
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        text: isTh
          ? `อัตราการออมอยู่ที่ ${savingsRate}% — ตั้งเป้าไว้ที่ 20% จะช่วยให้การเงินมั่นคงในระยะยาว`
          : `Savings rate is ${savingsRate}% — aim for 20%+ for long-term financial stability.`,
      })
    } else {
      insights.push({
        icon: mdiAlertCircleOutline,
        iconColor: '#f43f5e',
        bg: 'bg-rose-50 dark:bg-rose-900/20',
        text: isTh
          ? `รายจ่ายเกินรายรับเดือนนี้ — ลองตรวจสอบและลดหมวดหมู่ที่ไม่จำเป็น`
          : `Expenses exceeded income this month — review and cut non-essential categories.`,
      })
    }
  }

  if (insights.length === 0) return null

  return (
    <div className="mt-4 space-y-2 animate-fade-in">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon path={mdiLightbulbOutline} size={0.65} color="#818cf8" />
        <p className="text-[10px] font-bold text-muted-theme uppercase tracking-widest">
          {isTh ? 'วิเคราะห์เดือนนี้' : 'Monthly Analysis'}
        </p>
      </div>
      {insights.map((ins, i) => (
        <InsightPill key={i} icon={ins.icon} iconColor={ins.iconColor} bg={ins.bg}>
          {ins.text}
        </InsightPill>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
interface TrendSectionProps {
  trend: MonthlyTrend[] | null
  loadingTrend: boolean
  categories: CategoryBreakdown[] | null
  lang?: string
}

export default function TrendSection({
  trend,
  loadingTrend,
  categories,
  lang = 'th',
}: TrendSectionProps) {
  const t = useT()
  const [open, setOpen] = useState(false)

  const analysis =
    trend && categories ? deriveAnalysis(trend, categories) : null

  return (
    <Card className="animate-fade-up delay-150 overflow-hidden" padding={false}>
      {/* ── Header / Toggle ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left
                   active:bg-slate-50 dark:active:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-theme">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
              {t('spent')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              {t('income')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-theme">{t('trend_12m')}</span>
          <div
            className={clsx(
              'w-7 h-7 rounded-xl flex items-center justify-center transition-colors',
              open
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600'
                : 'bg-slate-100 dark:bg-slate-700 text-muted-theme',
            )}
          >
            <Icon path={open ? mdiChevronUp : mdiChevronDown} size={0.7} />
          </div>
        </div>
      </button>

      {/* ── Collapsible Body ── */}
      {open && (
        <div className="px-5 pb-5 animate-fade-up">
          {/* Chart */}
          <TrendLineChart data={trend} loading={loadingTrend} />

          {/* Divider */}
          {analysis && (
            <div className="border-t border-theme mt-4" />
          )}

          {/* Analysis */}
          {!loadingTrend && analysis && (
            <AnalysisPanel analysis={analysis} lang={lang} />
          )}
        </div>
      )}
    </Card>
  )
}
