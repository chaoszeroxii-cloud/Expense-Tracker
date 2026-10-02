import Icon from '@mdi/react'
import { mdiCashMultiple, mdiCash, mdiChartLine } from '@mdi/js'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
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
        <p key={p.dataKey} style={{ color: p.color }} className="font-bold flex items-center gap-1.5">
          <Icon path={p.dataKey === 'expense' ? mdiCashMultiple : mdiCash} size={0.5} />
          ฿{Number(p.value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      ))}
    </div>
  )
}

export default function TrendLineChart({ data, loading }:
  { data: MonthlyTrend[] | null; loading: boolean }) {
  const t = useT()

  if (loading) return <Skeleton className="h-44 w-full" />
  if (!data?.length) return (
    <div className="flex flex-col items-center justify-center h-44 text-muted-theme">
      <Icon path={mdiChartLine} size={2} className="text-muted-theme" />
      <p className="text-sm mt-2">{t('no_transactions')}</p>
    </div>
  )

  // Detect dark mode for axis tick colour
  const isDark = document.documentElement.classList.contains('dark')
  const tickColor = isDark ? '#475569' : '#94a3b8'
  const gridColor = isDark ? '#1e293b' : '#f1f5f9'

  return (
    <ResponsiveContainer width="100%" height={176}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="label"
          tick={{ fontSize: 10, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
          axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis
          tick={{ fontSize: 10, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
          axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
        <Tooltip content={<CustomTooltip />} />

        <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2}
          fill="url(#gradIncome)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Area type="monotone" dataKey="expense" stroke="#6366f1" strokeWidth={2}
          fill="url(#gradExpense)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
