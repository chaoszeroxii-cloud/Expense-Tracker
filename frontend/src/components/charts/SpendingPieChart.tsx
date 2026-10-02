import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryBreakdown } from '../../types'
import { Skeleton, Empty, ErrorState } from '../ui'
import IconDisplay from '../ui/IconDisplay'
import { useT } from '../../store/i18n.store'
import { mdiInboxOutline } from '@mdi/js'

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as CategoryBreakdown
  return (
    <div className="bg-card rounded-xl shadow-lg border border-theme px-3 py-2 text-sm">
      <p className="font-semibold text-base-theme flex items-center gap-1.5">
        <IconDisplay icon={d.categoryIcon} color={d.categoryColor} size="sm" />
        {d.categoryName}
      </p>
      <p className="text-brand-600 font-bold">฿{d.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p className="text-muted-theme">{d.percentage}%</p>
    </div>
  )
}

export default function SpendingPieChart({ data, loading, error, onRetry, onAdd }: {
  data: CategoryBreakdown[] | null
  loading: boolean
  error?: string | null
  onRetry?: () => void
  onAdd?: () => void
}) {
  const t = useT()

  if (loading) return <Skeleton className="h-52 w-full" />

  // A failed load previously rendered as "no transactions", which reads as a real zero.
  if (error) return <ErrorState compact message={t('err_load_failed')} onRetry={onRetry} retryLabel={t('action_retry')} />

  if (!data?.length) return (
    <Empty
      compact
      icon={mdiInboxOutline}
      title={t('empty_no_tx_title')}
      sub={t('empty_no_tx_sub')}
      action={onAdd ? { label: t('action_add_first'), onPress: onAdd } : undefined}
    />
  )

  const top  = data.slice(0, 6)
  const rest = data.slice(6)
  const chartData = rest.length > 0
    ? [...top, {
        categoryId: 'other', categoryName: 'Other', categoryIcon: 'other',
        categoryColor: '#cbd5e1',
        total: rest.reduce((s, r) => s + r.total, 0),
        count: rest.length,
        percentage: rest.reduce((s, r) => s + r.percentage, 0),
      }]
    : top

  return (
    <div className="flex items-center gap-4">
      <div className="w-40 h-40 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%"
              innerRadius={44} outerRadius={68} paddingAngle={2}
              dataKey="total" stroke="none">
              {chartData.map(entry => (
                <Cell key={entry.categoryId} fill={entry.categoryColor} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-2 min-w-0">
        {chartData.map(d => (
          <li key={d.categoryId} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.categoryColor }} />
            <span className="text-xs text-base-theme truncate flex-1">{d.categoryName}</span>
            <span className="text-xs font-semibold text-base-theme flex-shrink-0">{d.percentage}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
