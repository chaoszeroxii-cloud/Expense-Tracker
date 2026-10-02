import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiChevronDown, mdiChevronUp } from '@mdi/js'
import clsx from 'clsx'
import { Card } from '../ui'
import MonthlyBarChart from './MonthlyBarChart'
import type { MonthlyTrend } from '../../types'

interface MonthlyBarSectionProps {
  trend: MonthlyTrend[] | null
  loadingTrend: boolean
  lang?: string
}

export default function MonthlyBarSection({
  trend,
  loadingTrend,
  lang = 'th',
}: MonthlyBarSectionProps) {
  const [open, setOpen] = useState(false)
  const isTh = lang === 'th'

  return (
    <Card className="animate-fade-up delay-175 overflow-hidden" padding={false}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left
                   active:bg-slate-50 dark:active:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-3 text-xs text-muted-theme">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            {isTh ? 'รายรับ' : 'Income'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
            {isTh ? 'รายจ่าย' : 'Expense'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-theme">
            {isTh ? 'เปรียบเทียบ 12 เดือน' : '12-Month Comparison'}
          </span>
          <div className={clsx(
            'w-7 h-7 rounded-xl flex items-center justify-center transition-colors',
            open
              ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600'
              : 'bg-slate-100 dark:bg-slate-700 text-muted-theme',
          )}>
            <Icon path={open ? mdiChevronUp : mdiChevronDown} size={0.7} />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 animate-fade-up">
          <MonthlyBarChart data={trend} loading={loadingTrend} />
        </div>
      )}
    </Card>
  )
}
