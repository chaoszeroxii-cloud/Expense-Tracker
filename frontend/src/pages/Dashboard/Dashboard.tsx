import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiChartTimelineVariant, mdiChevronRight, mdiWallet } from '@mdi/js'
import { Card, Skeleton, ErrorState, Empty, Amount, IconDisplay, WorkTimeBadge } from '../../components/ui'
import SafeToSpendCard from '../../components/home/SafeToSpendCard'
import QuickCaptureBar from '../../components/home/QuickCaptureBar'
import CoverageStrip from '../../components/home/CoverageStrip'
import PendingSyncBanner from '../../components/home/PendingSyncBanner'
import AllocationWallets from '../../components/allocations/AllocationWallets'
import { useDailyBrief } from '../../hooks'
import { useT, useI18n } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { track } from '../../utils/telemetry'
import type { DailyBriefTransaction } from '../../types'

/**
 * Home answers exactly one question: what can I spend today?
 *
 * It previously mounted eleven requests and led with total spend for the month — a
 * backward-looking figure that supports no decision. Above the fold is now a single
 * `daily-brief` request; charts, wallets, loans and long-term trends moved to Reports
 * and More.
 */
export default function Dashboard() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const advancedMode = useAuthStore(s => s.user?.advancedMode ?? false)

  const { data: brief, loading, error, refetch, setData } = useDailyBrief()

  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('dashboard') || types.includes('transactions')) refetch()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [refetch])

  useEffect(() => { if (brief) track('daily_brief_viewed') }, [brief])

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5">
        <img src="/icon.svg" alt="" className="w-10 h-auto" />
        <h1 className="text-xl font-extrabold text-base-theme tracking-tight">MoneyFlow</h1>
      </div>

      {/* ── The daily number ── */}
      {loading ? (
        <Skeleton className="h-60 w-full rounded-3xl" />
      ) : error ? (
        <Card>
          <ErrorState message={t('err_load_failed')} onRetry={refetch} retryLabel={t('action_retry')} />
        </Card>
      ) : brief ? (
        <SafeToSpendCard brief={brief} />
      ) : null}

      {/* ── Anything captured offline, still waiting for a connection ── */}
      <PendingSyncBanner />

      {/* ── Fastest way in: plain language straight to the assistant ── */}
      <QuickCaptureBar />

      {/* ── Seven-day coverage. Not a streak: see CoverageStrip. ── */}
      {brief && (
        <CoverageStrip
          coverage={brief.coverage}
          onChange={next => setData({ ...brief, coverage: next })}
        />
      )}

      {/* ── What just happened ── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base-theme text-sm">{t('home_recent')}</h2>
          <button
            onClick={() => navigate('/history')}
            className="flex items-center gap-0.5 text-xs font-semibold text-brand-600"
          >
            {t('nav_transactions')}
            <Icon path={mdiChevronRight} size={0.6} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !brief?.recentTransactions.length ? (
          <Empty
            compact
            icon="📭"
            title={t('empty_no_tx_title')}
            sub={t('empty_no_tx_sub')}
            action={{ label: t('action_add_first'), onPress: () => navigate('/add') }}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {brief.recentTransactions.map(tx => (
              <RecentRow key={tx.id} tx={tx} lang={lang} />
            ))}
          </ul>
        )}
      </Card>

      {/* ── Reports live one tap away, not on this screen ── */}
      <button
        onClick={() => navigate('/reports')}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-[var(--border)]
                   active:scale-[0.98] transition-all text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0">
          <Icon path={mdiChartTimelineVariant} size={0.9} color="#6366f1" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base-theme text-sm">{t('home_view_reports')}</div>
          <div className="text-xs text-muted-theme mt-0.5">{t('reports_subtitle')}</div>
        </div>
        <Icon path={mdiChevronRight} size={0.8} className="text-muted-theme shrink-0" />
      </button>

      {/* ── Envelope wallets only for users who opted into them ── */}
      {advancedMode && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Icon path={mdiWallet} size={0.6} className="text-muted-theme" />
            <span className="text-xs font-bold text-muted-theme uppercase tracking-wide">
              {t('nav_wallets')}
            </span>
          </div>
          <AllocationWallets />
        </div>
      )}
    </div>
  )
}

function RecentRow({ tx, lang }: { tx: DailyBriefTransaction; lang: string }) {
  const time = new Date(tx.occurredAt).toLocaleDateString(
    lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' },
  )
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: (tx.categoryColor ?? '#e2e8f0') + '22' }}
      >
        <IconDisplay icon={tx.categoryIcon ?? 'other'} color={tx.categoryColor ?? undefined} size="md" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-base-theme truncate">
          {tx.categoryName ?? 'Uncategorized'}
        </p>
        <p className="text-[11px] text-muted-theme truncate">{tx.note || time}</p>
      </div>
      <div className="text-right shrink-0">
        <Amount value={tx.amount} type={tx.type} size="sm" />
        {tx.type === 'expense' && <WorkTimeBadge amount={tx.amount} className="block mt-0.5" />}
      </div>
    </li>
  )
}
