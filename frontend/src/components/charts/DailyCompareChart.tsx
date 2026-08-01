import { useEffect, useState } from 'react'
import Icon from '@mdi/react'
import { mdiChartLine } from '@mdi/js'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DailySummary } from '../../types'
import { Skeleton } from '../ui'
import { useT } from '../../store/i18n.store'
import { fmt } from '../../utils/money'

/**
 * Per-mode series colours, validated against this app's real card surfaces
 * (#ffffff light, #1e293b dark) for the OKLCH lightness band, chroma floor, protan/deutan
 * separation and WCAG contrast. Dark is a *selected* pair, not a lightened copy of light:
 * emerald-500 and indigo-400 both sit outside the dark band, so the indigo steps down one
 * stop and the emerald holds.
 */
const SERIES = {
  light: { expense: '#4f46e5', income: '#059669' },
  dark:  { expense: '#6366f1', income: '#059669' },
}

interface Row { day: number; label: string; expense: number; income: number }

/**
 * Round the axis top up to 1/2/5×10ⁿ.
 *
 * Recharts' auto-domain ended at the data max, and the `k` formatter then rounded those
 * ticks to 5k / 9k / 14k / 18k — numbers that look arbitrary and make the gridlines hard
 * to read a value against. A rounded ceiling puts them on 5k / 10k / 15k / 20k.
 */
export function niceMax(v: number): number {
  if (v <= 0) return 100
  const mag = 10 ** Math.floor(Math.log10(v))
  const n = v / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * mag
}

/**
 * The API returns only days that had activity, so plotting it raw would draw a line
 * between the 3rd and the 11th as if the week between them never existed. Fill every
 * day with zeros first.
 *
 * The current month stops at today rather than running to the 31st: trailing zeros for
 * days that have not happened yet read as "spent nothing", which is a different claim
 * from "not yet known".
 */
export function buildDays(data: DailySummary[], month: string, today = new Date()): Row[] {
  const [year, mon] = month.split('-').map(Number)
  if (!year || !mon) return []

  const daysInMonth = new Date(year, mon, 0).getDate()
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === mon
  const lastDay = isCurrent ? Math.min(today.getDate(), daysInMonth) : daysInMonth

  const byDate = new Map(data.map(d => [d.date, d]))
  const rows: Row[] = []
  for (let day = 1; day <= lastDay; day++) {
    const key = `${month}-${String(day).padStart(2, '0')}`
    const hit = byDate.get(key)
    rows.push({
      day,
      label: String(day),
      expense: hit?.expense ?? 0,
      income: hit?.income ?? 0,
    })
  }
  return rows
}

/**
 * Values wear ink tokens; the series colour rides on a dot beside them. Colouring the
 * numbers themselves makes identity depend on hue alone, which is exactly what the
 * legend and this dot exist to avoid.
 */
function DailyTooltip({ active, payload, label, dayWord }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card rounded-xl shadow-lg border border-theme px-3 py-2 text-xs">
      <p className="font-semibold text-muted-theme mb-1.5">{dayWord} {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-base-theme">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-theme">{p.name}</span>
          <span className="font-bold tabular-nums ml-auto">฿{fmt(Number(p.value))}</span>
        </p>
      ))}
    </div>
  )
}

export default function DailyCompareChart({ data, loading, month }: {
  data: DailySummary[] | null
  loading: boolean
  month: string
}) {
  const t = useT()

  // Recharts takes colours as props, so the theme has to be read rather than inherited.
  // Re-read on class changes or the chart keeps the palette it mounted with.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setIsDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  if (loading) return <Skeleton className="h-52 w-full" />

  const rows = buildDays(data ?? [], month)
  const hasAny = rows.some(r => r.expense > 0 || r.income > 0)

  if (!hasAny) return (
    <div className="flex flex-col items-center justify-center h-52 text-muted-theme">
      <Icon path={mdiChartLine} size={2} />
      <p className="text-sm mt-2">{t('daily_compare_empty')}</p>
    </div>
  )

  const c = isDark ? SERIES.dark : SERIES.light
  const tickColor = isDark ? '#64748b' : '#94a3b8'
  const gridColor = isDark ? '#334155' : '#f1f5f9'

  // A month is 28–31 points and a phone is ~340px wide; every label would collide, so
  // thin them to roughly one per 5 days and let Recharts keep the ends.
  const tickStep = rows.length > 20 ? 4 : 2
  const axisTop = niceMax(Math.max(...rows.map(r => Math.max(r.expense, r.income))))

  return (
    <>
      {/* Legend is not optional at two series — identity must survive a greyscale print. */}
      <div className="flex items-center gap-4 mb-3">
        <LegendKey color={c.expense} label={t('spent')} />
        <LegendKey color={c.income} label={t('income')} />
      </div>

      <ResponsiveContainer width="100%" height={208}>
        <LineChart data={rows} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
            axisLine={false} tickLine={false} interval={tickStep}
          />
          <YAxis
            tick={{ fontSize: 10, fill: tickColor, fontFamily: 'Plus Jakarta Sans' }}
            axisLine={false} tickLine={false}
            domain={[0, axisTop]} tickCount={5} allowDecimals={false}
            tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip
            content={<DailyTooltip dayWord={t('daily_compare_day')} />}
            cursor={{ stroke: tickColor, strokeWidth: 1, strokeDasharray: '3 3' }}
          />

          {/* Straight segments, not `monotone`. A day's total is a discrete measurement:
              a spline bulges between points and turns a single ฿17,000 pay-in on the 1st
              into a hump spanning the 1st–3rd, implying money that was never moved.

              Expense drawn last so it sits above income where the two cross. Animation
              off: the theme observer remounts these on every dark-mode toggle, and a
              31-point line re-sweeping each time reads as a glitch. */}
          <Line
            type="linear" dataKey="income" name={t('income')}
            stroke={c.income} strokeWidth={2} dot={false} isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }}
          />
          <Line
            type="linear" dataKey="expense" name={t('spent')}
            stroke={c.expense} strokeWidth={2} dot={false} isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-theme">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
