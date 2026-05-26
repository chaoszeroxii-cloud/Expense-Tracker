import { useState } from 'react'
import Icon from '@mdi/react'
import {
  mdiChevronDown, mdiChevronUp,
  mdiAlertCircleOutline, mdiLightbulbOutline, mdiCheckCircleOutline,
  mdiRobotOutline, mdiRefresh,
} from '@mdi/js'
import clsx from 'clsx'
import { Card } from '../ui'
import type { AiRecommendation } from '../../types'

const CONFIG: Record<AiRecommendation['type'], { icon: string; iconColor: string; bg: string }> = {
  warning: { icon: mdiAlertCircleOutline,  iconColor: '#f43f5e', bg: 'bg-rose-50 dark:bg-rose-900/20' },
  tip:     { icon: mdiLightbulbOutline,    iconColor: '#818cf8', bg: 'bg-slate-50 dark:bg-slate-700/40' },
  good:    { icon: mdiCheckCircleOutline,  iconColor: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
}

interface AiInsightsSectionProps {
  data: AiRecommendation[] | null
  loading: boolean
  onRefresh: () => void
  lang?: string
}

export default function AiInsightsSection({
  data, loading, onRefresh, lang = 'th',
}: AiInsightsSectionProps) {
  const [open, setOpen] = useState(false)
  const isTh = lang === 'th'

  return (
    <Card className="animate-fade-up delay-200 overflow-hidden" padding={false}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left
                   active:bg-slate-50 dark:active:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon path={mdiRobotOutline} size={0.6} color="#6366f1" />
          </div>
          <span className="text-xs text-muted-theme font-medium">
            {isTh ? 'AI วิเคราะห์การเงิน' : 'AI Financial Insights'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-base-theme">
            {isTh ? 'คำแนะนำส่วนตัว' : 'Personalized Tips'}
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
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
              ))}
            </div>
          ) : !data?.length ? (
            <p className="text-sm text-muted-theme text-center py-4">
              {isTh ? 'ไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์' : 'Not enough data to analyze yet'}
            </p>
          ) : (
            <div className="space-y-2">
              {data.map((rec, i) => {
                const { icon, iconColor, bg } = CONFIG[rec.type]
                return (
                  <div key={i} className={clsx('flex items-start gap-2.5 rounded-2xl px-3.5 py-3', bg)}>
                    <div className="flex-shrink-0 mt-0.5">
                      <Icon path={icon} size={0.75} color={iconColor} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-base-theme mb-0.5">{rec.title}</p>
                      <p className="text-xs font-medium leading-relaxed text-base-theme">{rec.body}</p>
                    </div>
                  </div>
                )
              })}

              <button
                onClick={(e) => { e.stopPropagation(); onRefresh() }}
                className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 rounded-xl
                           text-xs text-muted-theme font-medium
                           bg-slate-100 dark:bg-slate-700/40
                           active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
              >
                <Icon path={mdiRefresh} size={0.6} />
                {isTh ? 'วิเคราะห์ใหม่' : 'Refresh'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
