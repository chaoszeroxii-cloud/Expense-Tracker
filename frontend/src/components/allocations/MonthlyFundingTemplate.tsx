import { useState, useEffect } from 'react'
import Icon from '@mdi/react'
import {
  mdiCalendarSync, mdiChevronDown, mdiChevronUp, mdiCheck,
  mdiContentSave, mdiArrowDownBoldBox, mdiCalendarArrowRight,
} from '@mdi/js'
import clsx from 'clsx'
import { allocationsApi } from '../../api'
import { useAllocationPlanPreview } from '../../hooks'
import IconDisplay from '../ui/IconDisplay'
import { useT, useI18n } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'

/**
 * How much each envelope should hold this month, and — separately — actually moving the
 * money to get there.
 *
 * These were one button before, and that was the bug. The plan could only be persisted
 * as a side effect of a successful transfer, so a user with ฿0 unallocated could open
 * the panel, type their split, and find the confirm button permanently disabled: any
 * amount exceeded the pool and zero failed the "> 0" check. The panel promised the
 * figures would "be remembered next month" while making it impossible to record them.
 *
 * Saving intent has no funding precondition. Moving money still does.
 */
export default function MonthlyFundingTemplate({ unallocated, onApplied }: {
  unallocated: number
  onApplied: () => void
}) {
  const t = useT()
  const { lang } = useI18n()
  const { data: preview, loading, refetch } = useAllocationPlanPreview()

  const [open, setOpen] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [savingTargets, setSavingTargets] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!preview) return
    const next: Record<string, string> = {}
    for (const item of preview.items) {
      if (item.targetAmount > 0) next[item.allocationId] = String(item.targetAmount)
    }
    setInputs(next)
  }, [preview])

  if (loading || !preview || preview.items.length === 0) return null

  const targetOf = (id: string) => Number(inputs[id]) || 0
  const totalTarget = preview.items.reduce((sum, i) => sum + targetOf(i.allocationId), 0)

  // What topping every envelope up to its target would still cost right now.
  const totalToFund = preview.items.reduce(
    (sum, i) => sum + Math.max(0, targetOf(i.allocationId) - i.fundedThisMonth), 0,
  )
  const shortfall = Math.max(0, totalToFund - unallocated)
  const canApply = totalToFund > 0 && shortfall === 0 && !applying && !savingTargets

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(y, mo - 1, 1).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'long' })
  }

  const saveTargets = async () => {
    setSavingTargets(true)
    try {
      await allocationsApi.saveTargets(
        preview.month,
        preview.items.map(i => ({ allocationId: i.allocationId, targetAmount: targetOf(i.allocationId) })),
      )
      toast.success(t('tpl_saved'))
      refetch()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setSavingTargets(false)
    }
  }

  const applyMoney = async () => {
    setApplying(true)
    try {
      // Save first so the amounts on screen are what gets remembered, then move money
      // for the gap. Applying no longer rewrites the targets, so the order is safe.
      await allocationsApi.saveTargets(
        preview.month,
        preview.items.map(i => ({ allocationId: i.allocationId, targetAmount: targetOf(i.allocationId) })),
      )
      await allocationsApi.applyPlan(
        preview.items
          .map(i => ({ allocationId: i.allocationId, amount: Math.max(0, targetOf(i.allocationId) - i.fundedThisMonth) }))
          .filter(a => a.amount > 0),
      )
      toast.success(t('move_success'))
      refetch()
      onApplied()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="mx-5 mb-4 animate-fade-up">
      <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 overflow-hidden">
        <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-800/50 flex items-center justify-center shrink-0">
            <Icon path={mdiCalendarSync} size={0.75} color="#8b5cf6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{t('tpl_title')}</p>
            <p className="text-xs text-violet-500 dark:text-violet-400">{t('tpl_desc')}</p>
          </div>
          <Icon path={open ? mdiChevronUp : mdiChevronDown} size={0.8} className="text-violet-400 shrink-0" />
        </button>

        {open && (
          <div className="px-4 pb-4 space-y-3 border-t border-violet-200 dark:border-violet-700/60 pt-3">
            {preview.state === 'inherited' && preview.sourceMonth && (
              <div className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
                <Icon path={mdiCalendarArrowRight} size={0.55} />
                {t('tpl_inherited')} {monthLabel(preview.sourceMonth)}
              </div>
            )}

            <ul className="space-y-2.5">
              {preview.items.map(item => {
                const target = targetOf(item.allocationId)
                const remaining = Math.max(0, target - item.fundedThisMonth)
                return (
                  <li key={item.allocationId}>
                    <div className="flex items-center gap-2">
                      <IconDisplay icon={item.icon} color={item.color} size="sm" />
                      <span className="flex-1 text-xs font-semibold text-base-theme truncate">{item.name}</span>
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-theme">฿</span>
                        <input
                          type="number" inputMode="decimal" step="0.01" min={0} placeholder="0"
                          value={inputs[item.allocationId] ?? ''}
                          onChange={e => setInputs(prev => ({ ...prev, [item.allocationId]: e.target.value }))}
                          aria-label={`${t('tpl_target')} ${item.name}`}
                          className="w-full pl-5 pr-2 py-1.5 rounded-lg border border-theme bg-white dark:bg-slate-700
                                     text-xs font-semibold text-base-theme outline-none
                                     focus:border-violet-400 transition-all"
                        />
                      </div>
                    </div>
                    {/* Three separate figures — the old panel showed one box whose meaning
                        slid between "target" and "amount to move". */}
                    {(item.fundedThisMonth > 0 || remaining > 0) && (
                      <p className="text-[10px] text-muted-theme mt-1 ml-6 tabular-nums">
                        {t('tpl_funded')} ฿{fmt(item.fundedThisMonth)}
                        {remaining > 0 && <> · {t('tpl_remaining')} ฿{fmt(remaining)}</>}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className="space-y-1 pt-1 text-xs font-semibold">
              <div className="flex justify-between">
                <span className="text-muted-theme">{t('tpl_total_target')}</span>
                <span className="text-violet-600 dark:text-violet-400 tabular-nums">฿{fmt(totalTarget)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-theme">{t('tpl_available')}</span>
                <span className="text-muted-theme tabular-nums">฿{fmt(unallocated)}</span>
              </div>
              {shortfall > 0 && (
                <div className="flex justify-between">
                  <span className="text-rose-500">{t('tpl_shortfall')}</span>
                  <span className="text-rose-500 tabular-nums">฿{fmt(shortfall)}</span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-violet-500 dark:text-violet-400 leading-relaxed">
              {t('tpl_save_hint')}
            </p>

            <div className="flex gap-2">
              {/* Always available: recording intent has no funding precondition. */}
              <button
                onClick={saveTargets}
                disabled={savingTargets || applying}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                           border border-violet-300 dark:border-violet-600 bg-card
                           text-xs font-bold text-violet-700 dark:text-violet-300
                           active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                <Icon path={mdiContentSave} size={0.6} />
                {savingTargets ? t('saving') : t('tpl_save')}
              </button>

              <button
                onClick={applyMoney}
                disabled={!canApply}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl',
                  'text-xs font-bold text-white transition-transform active:scale-[0.98]',
                  canApply ? 'bg-violet-600' : 'bg-violet-300 dark:bg-violet-800 cursor-not-allowed',
                )}
              >
                <Icon path={applying ? mdiCheck : mdiArrowDownBoldBox} size={0.6} color="white" />
                {applying ? t('saving') : totalToFund === 0 ? t('tpl_nothing_to_add') : t('tpl_apply_short')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
