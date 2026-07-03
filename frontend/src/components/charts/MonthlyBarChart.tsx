import Icon from '@mdi/react'
import { mdiChartBar } from '@mdi/js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { MonthlyTrend } from '../../types'
import { Skeleton } from '../ui'
import { useT } from '../../store/i18n.store'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card rounded-xl shadow-lg border border-theme px-3 py-2 text-xs">
      <p className="font-semibold text-muted-theme mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-bold">
          ฿{Number(p.value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      ))}
    </div>
  )
}

export default function MonthlyBarChart({ data, loading }: {
  data: MonthlyTrend[] | null
  loading: boolean
}) {
  const t = useT()

  if (loading) return <Skeleton className="h-52 w-full" />
  if (!data?.length) return (
    <div className="flex flex-col items-center justify-center h-52 text-muted-theme">
      <Icon path={mdiChartBar} size={2} />
      <p className="text-sm mt-2">{t('no_transactions')}</p>
    </div>
  )

  const isDark = document.documentElement.classList.contains('dark')
  const tickColor = isDark ? '#475569' : '#94a3b8'
  const gridColor = isDark ? '#1e293b' : '#f1f5f9'

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 24 }} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
          axisLine={false} tickLine={false}
          angle={-40} textAnchor="end" interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
          axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
        <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expense" fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
