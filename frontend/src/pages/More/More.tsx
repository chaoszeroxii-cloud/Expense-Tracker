import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiCashMultiple, mdiTrendingUp, mdiReceiptTextOutline,
  mdiWallet, mdiChevronRight, mdiClockMinusOutline, mdiRobot, mdiCog,
} from '@mdi/js'
import { useT, TKey } from '../../store/i18n.store'
import { usePanels } from '../../store/panels.store'

interface Item {
  icon: string
  color: string
  bg: string
  titleKey: TKey
  descKey: TKey
  /** Either navigate somewhere or run an action (open an overlay). */
  to?: string
  action?: 'chat' | 'calc'
}

/**
 * Tools first: the work-time calculator and the AI assistant were previously reachable
 * only through a 3px strip at the screen edge that stopped pulsing after six seconds.
 * They now have a permanent, named home.
 */
const TOOLS: Item[] = [
  { action: 'calc', icon: mdiClockMinusOutline, color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20',   titleKey: 'more_worktime_title', descKey: 'more_worktime_desc' },
  { action: 'chat', icon: mdiRobot,             color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', titleKey: 'more_ai_title',       descKey: 'more_ai_desc' },
]

const ADVANCED: Item[] = [
  { to: '/wallets',     icon: mdiWallet,             color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20', titleKey: 'fin_wallets_title', descKey: 'fin_wallets_desc' },
  { to: '/loans',       icon: mdiCashMultiple,       color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',   titleKey: 'fin_loans_title',   descKey: 'fin_loans_desc' },
  { to: '/investments', icon: mdiTrendingUp,         color: '#06b6d4', bg: 'bg-cyan-50 dark:bg-cyan-900/20',     titleKey: 'fin_inv_title',     descKey: 'fin_inv_desc' },
  { to: '/tax',         icon: mdiReceiptTextOutline, color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', titleKey: 'fin_tax_title',   descKey: 'fin_tax_desc' },
]

const ACCOUNT: Item[] = [
  { to: '/settings', icon: mdiCog, color: '#64748b', bg: 'bg-slate-100 dark:bg-slate-800', titleKey: 'nav_settings', descKey: 'more_settings_desc' },
]

export default function More() {
  const navigate = useNavigate()
  const t = useT()
  const { openChat, openCalc } = usePanels()

  const run = (item: Item) => {
    if (item.action === 'chat') return openChat()
    if (item.action === 'calc') return openCalc()
    if (item.to) navigate(item.to)
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">{t('more_title')}</h1>
        <p className="text-sm text-muted-theme mt-0.5">{t('more_subtitle')}</p>
      </div>

      <Group title={t('more_group_tools')}    items={TOOLS}    onPick={run} t={t} />
      <Group title={t('more_group_advanced')} items={ADVANCED} onPick={run} t={t} />
      <Group title={t('more_group_account')}  items={ACCOUNT}  onPick={run} t={t} />
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
        {items.map(item => (
          <button
            key={item.titleKey}
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
        ))}
      </div>
    </section>
  )
}
