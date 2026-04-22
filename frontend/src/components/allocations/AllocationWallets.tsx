import Icon from '@mdi/react'
import { mdiBriefcase } from '@mdi/js'
import { useAllocations, useAllocationSummary } from '../../hooks'
import { Card, Skeleton } from '../ui'
import IconDisplay from '../ui/IconDisplay'
import { useT } from '../../store/i18n.store'
import type { Allocation, AllocationSummary } from '../../types'

interface Enriched extends Allocation {
  spentThisMonth: number; receivedThisMonth: number; usagePercent: number
}
function enrich(allocations: Allocation[], summaries: AllocationSummary[]): Enriched[] {
  return allocations.map(a => {
    const s = summaries.find(x => x.allocationId === a.id)
    const spent = s?.spentThisMonth ?? 0
    const inflow = Number(a.balance) + spent
    return { ...a, spentThisMonth: spent, receivedThisMonth: s?.receivedThisMonth??0,
             usagePercent: inflow > 0 ? Math.min(100, Math.round(spent/inflow*100)) : 0 }
  })
}

export default function AllocationWallets() {
  const t = useT()
  const { data: allocations, loading: la } = useAllocations()
  const { data: summaries,   loading: ls } = useAllocationSummary()

  if (la || ls) return (
    <Card>
      <p className="text-sm font-bold text-base-theme mb-3 flex items-center gap-2">
        <Icon path={mdiBriefcase} size={0.6} /> {t('wallets')}
      </p>
      <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-14 w-full"/>)}</div>
    </Card>
  )

  if (!allocations?.length) return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-base-theme flex items-center gap-2">
          <Icon path={mdiBriefcase} size={0.6} /> {t('wallets')}
        </p>
        <span className="text-xs text-muted-theme">{t('settings_wallets')}</span>
      </div>
      <p className="text-xs text-muted-theme mt-2 text-center py-4">{t('no_wallets')}</p>
    </Card>
  )

  const enriched = enrich(allocations, summaries ?? [])
  return (
    <Card padding={false}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-sm font-bold text-base-theme flex items-center gap-2">
          <Icon path={mdiBriefcase} size={0.6} /> {t('wallets')}
        </h2>
        <span className="text-xs text-muted-theme font-medium">{t('balance')}</span>
      </div>
      <ul className="divide-y divide-theme pb-3">
        {enriched.map(a => (
          <li key={a.id} className="px-5 py-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: (a.color??'#6366f1')+'22' }}>
                <IconDisplay icon={a.icon??'💼'} color={a.color} size="md" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-base-theme truncate">{a.name}</p>
                  <p className="text-sm font-bold text-base-theme flex-shrink-0">
                    ฿{Number(a.balance).toLocaleString('th-TH',{maximumFractionDigits:0})}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-theme mt-0.5">
                  <span>{a.categories.slice(0,3).map(c=>c.icon).join(' ')}{a.categories.length>3&&` +${a.categories.length-3}`}</span>
                  {a.spentThisMonth>0 && (
                    <span className="text-rose-400 font-medium">
                      −฿{a.spentThisMonth.toLocaleString('th-TH',{maximumFractionDigits:0})} {t('this_month')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width:`${a.usagePercent}%`,
                  backgroundColor: a.usagePercent>80?'#f43f5e':a.usagePercent>50?'#f97316':(a.color??'#6366f1') }} />
            </div>
            {a.usagePercent>0 && (
              <p className="text-[10px] text-muted-theme mt-1 text-right">{a.usagePercent}% {t('used')}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
