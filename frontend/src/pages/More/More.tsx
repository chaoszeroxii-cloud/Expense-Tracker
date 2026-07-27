import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiCashMultiple, mdiTrendingUp, mdiReceiptTextOutline,
  mdiWallet, mdiChevronRight, mdiClockMinusOutline, mdiRobot, mdiCog,
  mdiChartTimelineVariant, mdiTune,
} from '@mdi/js'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useT, TKey } from '../../store/i18n.store'
import { usePanels } from '../../store/panels.store'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'

interface Item {
  icon: string
  color: string
  bg: string
  titleKey: TKey
  descKey: TKey
  to?: string
  action?: 'chat' | 'calc'
}

/**
 * Tools first: the work-time calculator and the AI assistant used to be reachable only
 * through a 3px strip at the screen edge that pulsed for six seconds. They now have a
 * permanent, named home.
 */
const TOOLS: Item[] = [
  { action: 'chat', icon: mdiRobot,             color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', titleKey: 'more_ai_title',       descKey: 'more_ai_desc' },
  { action: 'calc', icon: mdiClockMinusOutline, color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20',   titleKey: 'more_worktime_title', descKey: 'more_worktime_desc' },
  { to: '/reports', icon: mdiChartTimelineVariant, color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-900/20', titleKey: 'reports_title',      descKey: 'reports_subtitle' },
]

/**
 * Everything here is a data silo that does not yet feed the ledger — buying a fund or
 * receiving a loan repayment creates no transaction. Kept, but behind an explicit
 * opt-in rather than occupying primary navigation.
 */
const ADVANCED: Item[] = [
  { to: '/wallets',     icon: mdiWallet,             color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20',   titleKey: 'fin_wallets_title', descKey: 'fin_wallets_desc' },
  { to: '/loans',       icon: mdiCashMultiple,       color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',     titleKey: 'fin_loans_title',   descKey: 'fin_loans_desc' },
  { to: '/investments', icon: mdiTrendingUp,         color: '#06b6d4', bg: 'bg-cyan-50 dark:bg-cyan-900/20',       titleKey: 'fin_inv_title',     descKey: 'fin_inv_desc' },
  { to: '/tax',         icon: mdiReceiptTextOutline, color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', titleKey: 'fin_tax_title',     descKey: 'fin_tax_desc' },
]

const ACCOUNT: Item[] = [
  { to: '/settings', icon: mdiCog, color: '#64748b', bg: 'bg-slate-100 dark:bg-slate-800', titleKey: 'nav_settings', descKey: 'more_settings_desc' },
]

export default function More() {
  const navigate = useNavigate()
  const t = useT()
  const { openChat, openCalc } = usePanels()
  const { user, token, setAuth } = useAuthStore()
  const [toggling, setToggling] = useState(false)

  const advancedMode = user?.advancedMode ?? false

  const run = (item: Item) => {
    if (item.action === 'chat') return openChat()
    if (item.action === 'calc') return openCalc()
    if (item.to) navigate(item.to)
  }

  const toggleAdvanced = async () => {
    setToggling(true)
    try {
      const updated = await authApi.updatePreferences({ advancedMode: !advancedMode })
      if (updated && token) setAuth(token, updated)
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">{t('more_title')}</h1>
        <p className="text-sm text-muted-theme mt-0.5">{t('more_subtitle')}</p>
      </div>

      <Group title={t('more_group_tools')} items={TOOLS} onPick={run} t={t} />

      {/* ── Advanced ── */}
      <section>
        <h2 className="text-xs font-bold text-muted-theme uppercase tracking-wide mb-2 px-1">
          {t('more_group_advanced')}
        </h2>

        <button
          onClick={toggleAdvanced}
          disabled={toggling}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-[var(--border)]
                     active:scale-[0.98] transition-all text-left mb-3 disabled:opacity-60"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <Icon path={mdiTune} size={1.1} color="#64748b" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base-theme text-sm">{t('advanced_title')}</div>
            <div className="text-xs text-muted-theme mt-0.5 leading-relaxed">{t('advanced_desc')}</div>
          </div>
          <span className={clsx(
            'shrink-0 w-10 h-6 rounded-full transition-colors relative',
            advancedMode ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600',
          )}>
            <span className={clsx(
              'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              advancedMode ? 'translate-x-[18px]' : 'translate-x-0.5',
            )} />
          </span>
        </button>

        {advancedMode && (
          <div className="space-y-3 animate-fade-up">
            {ADVANCED.map(item => <Row key={item.titleKey} item={item} onPick={run} t={t} />)}
          </div>
        )}
      </section>

      <Group title={t('more_group_account')} items={ACCOUNT} onPick={run} t={t} />
    </div>
  )
}

function Group({ title, items, onPick, t }: {
  title: string
  items: Item[]
  onPick: (i: Item) => void
  t: (k: TKey) => string
}) {
  return (
    <section>
      <h2 className="text-xs font-bold text-muted-theme uppercase tracking-wide mb-2 px-1">{title}</h2>
      <div className="space-y-3">
        {items.map(item => <Row key={item.titleKey} item={item} onPick={onPick} t={t} />)}
      </div>
    </section>
  )
}

function Row({ item, onPick, t }: { item: Item; onPick: (i: Item) => void; t: (k: TKey) => string }) {
  return (
    <button
      onClick={() => onPick(item)}
      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-[var(--border)]
                 active:scale-[0.98] transition-all text-left hover:border-[var(--text-muted)]"
    >
      <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center shrink-0`}>
        <Icon path={item.icon} size={1.1} color={item.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base-theme text-sm">{t(item.titleKey)}</div>
        <div className="text-xs text-muted-theme mt-0.5 leading-relaxed">{t(item.descKey)}</div>
      </div>
      <Icon path={mdiChevronRight} size={0.8} className="text-muted-theme shrink-0" />
    </button>
  )
}
