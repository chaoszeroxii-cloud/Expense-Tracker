import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChartBar, mdiCashMultiple, mdiTrendingUp, mdiReceiptTextOutline,
  mdiWallet, mdiChevronRight,
} from '@mdi/js'
import { useT, TKey } from '../../store/i18n.store'

const FEATURE_DEFS: { to: string; icon: string; color: string; bg: string; titleKey: TKey; descKey: TKey }[] = [
  { to: '/budget',      icon: mdiChartBar,          color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-900/20', titleKey: 'fin_budget_title', descKey: 'fin_budget_desc' },
  { to: '/loans',       icon: mdiCashMultiple,       color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',  titleKey: 'fin_loans_title',  descKey: 'fin_loans_desc'  },
  { to: '/investments', icon: mdiTrendingUp,         color: '#06b6d4', bg: 'bg-cyan-50 dark:bg-cyan-900/20',    titleKey: 'fin_inv_title',    descKey: 'fin_inv_desc'    },
  { to: '/tax',         icon: mdiReceiptTextOutline,  color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', titleKey: 'fin_tax_title', descKey: 'fin_tax_desc'  },
  { to: '/wallets',     icon: mdiWallet,             color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20', titleKey: 'fin_wallets_title', descKey: 'fin_wallets_desc' },
]

export default function Finance() {
  const navigate = useNavigate()
  const t = useT()

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-base-theme">{t('finance_title')}</h1>
        <p className="text-sm text-muted-theme mt-0.5">{t('finance_subtitle')}</p>
      </div>

      <div className="space-y-3">
        {FEATURE_DEFS.map(f => (
          <button
            key={f.to}
            onClick={() => navigate(f.to)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-[var(--border)]
                       active:scale-[0.98] transition-all text-left hover:border-[var(--text-muted)]"
          >
            <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center shrink-0`}>
              <Icon path={f.icon} size={1.1} color={f.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base-theme text-sm">{t(f.titleKey)}</div>
              <div className="text-xs text-muted-theme mt-0.5 leading-relaxed">{t(f.descKey)}</div>
            </div>
            <Icon path={mdiChevronRight} size={0.8} className="text-muted-theme shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
