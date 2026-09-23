import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChartTimelineVariant,
  mdiArrowTopRight,
  mdiInboxOutline,
  mdiLeaf,
  mdiCheck,
} from '@mdi/js'
import { Card, Skeleton, ErrorState, Empty, Amount, IconDisplay, WorkTimeBadge } from '../../components/ui'
import SafeToSpendCard from '../../components/home/SafeToSpendCard'
import QuickCaptureBar from '../../components/home/QuickCaptureBar'
import CoverageStrip from '../../components/home/CoverageStrip'
import PendingSyncBanner from '../../components/home/PendingSyncBanner'
import { useDailyBrief } from '../../hooks'
import { useT, useI18n } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { track } from '../../utils/telemetry'
import type { DailyBriefTransaction } from '../../types'

export default function Dashboard() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data: brief, loading, refreshing, error, refetch, setData } = useDailyBrief()
  useEffect(() => {
    const handler = (e: Event) => {
      const types: string[] = (e as CustomEvent).detail?.types ?? []
      if (types.includes('dashboard') || types.includes('transactions')) refetch()
    }
    window.addEventListener('moneyflow:refresh', handler)
    return () => window.removeEventListener('moneyflow:refresh', handler)
  }, [refetch])
  useEffect(() => {
    if (brief) track('daily_brief_viewed')
  }, [brief])
  const todayDone = brief?.coverage.days.some((day) => day.isToday && day.covered)
  const date = brief ? new Date(`${brief.date}T12:00:00`) : new Date()

  return (
    <div aria-busy={loading || refreshing} className="px-4 pt-6 pb-4 sm:px-6 lg:px-2 space-y-6">
      <header className="flex justify-between items-start gap-3 pb-1">
        <div className="min-w-0">
          <p className="text-xs text-muted-theme mb-2 truncate">
            {t('ux_greeting')}
            {user?.name ? `, ${user.name}` : ''} <span aria-hidden="true">☀</span>
          </p>
          <h1 className="page-heading">
            {t('ux_today_title')}
            <span className="text-brand-500" aria-hidden="true">
              {lang === 'th' ? '.' : ''}
            </span>
          </h1>
          <p className="page-description">{t('ux_today_sub')}</p>
        </div>
        <div className="text-right shrink-0">
          <button
            onClick={() => navigate('/settings')}
            aria-label={t('nav_settings')}
            className="lg:hidden rounded-full bg-[var(--accent-soft)] w-11 h-11 inline-flex justify-center items-center font-bold text-brand-600"
          >
            {user?.name?.slice(0, 1).toUpperCase() || 'M'}
          </button>
          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-theme rounded-full border border-theme px-4 py-2.5 mt-2">
            <Icon path={mdiLeaf} size={0.65} />
            {date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
      </header>
      <PendingSyncBanner />
      <div className="grid md:grid-cols-[1.05fr_1fr] gap-4 lg:gap-5 items-stretch">
        {loading ? (
          <Skeleton className="h-80 w-full rounded-3xl" />
        ) : error ? (
          <Card>
            <ErrorState message={t('err_load_failed')} onRetry={refetch} retryLabel={t('action_retry')} />
          </Card>
        ) : brief ? (
          <SafeToSpendCard brief={brief} />
        ) : null}
        <QuickCaptureBar recent={error ? [] : brief?.recentTransactions} />
      </div>
      {!error && todayDone && (
        <p className="flex items-center gap-2 text-xs text-brand-600 px-1">
          <Icon path={mdiCheck} size={0.7} />
          {t('ux_today_done')}
        </p>
      )}
      <div className="grid md:grid-cols-[1.3fr_1fr] gap-5 items-stretch" data-home-detail-grid>
        <section className="surface p-5 sm:p-6 flex flex-col" aria-label={t('home_recent')}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="section-title">{t('home_recent')}</h2>
            <button onClick={() => navigate('/history')} className="text-action">
              {t('ux_view_all')}
              <Icon path={mdiArrowTopRight} size={0.7} />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              compact
              message={t('err_load_failed')}
              onRetry={refetch}
              retryLabel={t('action_retry')}
            />
          ) : !brief?.recentTransactions.length ? (
            <Empty
              compact
              icon={mdiInboxOutline}
              title={t('empty_no_tx_title')}
              sub={t('empty_no_tx_sub')}
              action={{ label: t('action_add_first'), onPress: () => navigate('/add') }}
            />
          ) : (
            <ul className="flex-1 flex flex-col divide-y divide-[var(--border)]">
              {brief.recentTransactions.map((tx) => (
                <RecentRow key={tx.id} tx={tx} lang={lang} />
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-col gap-5">
          {!error && brief?.nextBill && <button onClick={() => navigate('/budget')} className="surface w-full p-5 text-left">
            <p className="text-xs text-muted-theme">{t('life_upcoming')}</p>
            <p className="font-bold text-base-theme mt-2 break-words">{brief.nextBill.name}</p>
            <p className="text-xs text-muted-theme mt-2">{new Date(`${brief.nextBill.dueDate}T12:00:00`).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short' })} · ฿{brief.nextBill.amount.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</p>
            <span className="text-action mt-3">{t('life_back_plan')} <Icon path={mdiArrowTopRight} size={0.65} /></span>
          </button>}
          {loading ? <Skeleton className="h-72 w-full rounded-3xl" /> : !error && brief && (
            <CoverageStrip
              coverage={brief.coverage}
              onChange={(next) => setData((current) => (current ? { ...current, coverage: next } : current))}
            />
          )}
          <button
            onClick={() => navigate('/reports')}
            className="surface w-full flex items-start gap-3 p-5 text-left hover:border-brand-300 transition-colors"
          >
            <span className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-brand-600 shrink-0">
              <Icon path={mdiChartTimelineVariant} size={0.9} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-base-theme text-sm">{t('home_view_reports')}</span>
              <span className="block text-xs text-muted-theme mt-1.5 leading-relaxed">
                {t('ux_report_hint')}
              </span>
            </span>
            <Icon path={mdiArrowTopRight} size={0.8} className="text-brand-600 shrink-0" />
          </button>
        </div>
      </div>

    </div>
  )
}

function RecentRow({ tx, lang }: { tx: DailyBriefTransaction; lang: string }) {
  const t = useT()
  const timezone = useAuthStore((s) => s.user?.timezone)
  const time = new Date(tx.occurredAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  })
  return (
    <li className="flex flex-1 items-center gap-3 py-4">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: (tx.categoryColor ?? '#94a3b8') + '18' }}
      >
        <IconDisplay icon={tx.categoryIcon ?? 'other'} color={tx.categoryColor ?? undefined} size="md" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-base-theme truncate">
          {tx.note || tx.categoryName || t('category')}
        </p>
        <p className="text-xs text-muted-theme truncate mt-1">
          {tx.note ? `${tx.categoryName ?? t('category')} · ` : ''}
          {time}
        </p>
      </div>
      <div className="text-right shrink-0 max-w-[48%]">
        <Amount value={tx.amount} type={tx.type} size="sm" />
        {tx.type === 'expense' && <div className="mt-1"><WorkTimeBadge amount={tx.amount} className="justify-end" /></div>}
      </div>
    </li>
  )
}
