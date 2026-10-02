import { useState } from 'react'
import Icon from '@mdi/react'
import { mdiContentDuplicate, mdiAutoFix } from '@mdi/js'
import { budgetsApi } from '../../api'
import { useBudgetSuggestions } from '../../hooks'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { IconDisplay, Skeleton } from '../ui'
import { fmt } from '../../utils/money'

/**
 * Fills a new month instead of asking the user to retype it.
 *
 * Setting budgets used to mean adding every category by hand, every month, from a blank
 * page. That is a chore with no starting point, so the page went cold after the first
 * month and per-category budgets stopped being used at all. Two ways out: carry last
 * month forward verbatim, or start from what the user actually spends.
 *
 * Only rendered when the month has no budgets yet — once there are figures on the page,
 * offering to overwrite them is the wrong thing to lead with.
 */
export default function BudgetRollover({ month, onApplied }: {
  month: string
  onApplied: () => void
}) {
  const t = useT()
  const { data: suggestions, loading } = useBudgetSuggestions(month)
  const [busy, setBusy] = useState(false)

  const hasPrevious = (suggestions ?? []).some(s => s.previousAmount !== null)
  const hasAny = (suggestions ?? []).length > 0

  const copyPrevious = async () => {
    setBusy(true)
    try {
      const { copied } = await budgetsApi.copyPrevious(month)
      toast.success(`${t('bud_copy_done')} ${copied}`)
      onApplied()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bud_nothing_to_copy'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  const applySuggestions = async () => {
    if (!suggestions?.length) return
    setBusy(true)
    try {
      await budgetsApi.saveBatch(month, suggestions.map(s => ({
        categoryId: s.categoryId,
        amount: s.suggested,
      })))
      toast.success(t('plan_saved'))
      onApplied()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton className="h-32 w-full rounded-2xl" />
  if (!hasAny) {
    return (
      <div className="rounded-2xl bg-card border border-theme px-5 py-4">
        <p className="text-xs text-muted-theme leading-relaxed">{t('bud_empty_hint')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card border border-theme shadow-sm p-5 space-y-3 animate-fade-up">
      <div>
        <h3 className="font-bold text-base-theme text-sm">{t('bud_suggestions')}</h3>
        <p className="text-xs text-muted-theme mt-0.5 leading-relaxed">{t('bud_empty_hint')}</p>
      </div>

      <ul className="space-y-1.5">
        {suggestions!.slice(0, 5).map(s => (
          <li key={s.categoryId} className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 flex items-center justify-center rounded-md shrink-0"
              style={{ backgroundColor: (s.categoryColor ?? '#94a3b8') + '22' }}>
              <IconDisplay icon={s.categoryIcon ?? 'other'} color={s.categoryColor ?? undefined} size={0.55} />
            </span>
            <span className="flex-1 min-w-0 truncate text-base-theme font-medium">{s.categoryName}</span>
            <span className="text-[10px] text-muted-theme shrink-0">
              {s.previousAmount !== null
                ? `${t('bud_prev_amount')} ฿${fmt(s.previousAmount)}`
                : `${t('bud_avg_actual')} ฿${fmt(s.averageActual)}`}
            </span>
            <span className="font-bold text-base-theme tabular-nums shrink-0">฿{fmt(s.suggested)}</span>
          </li>
        ))}
        {suggestions!.length > 5 && (
          <li className="text-[11px] text-muted-theme text-center pt-1">
            +{suggestions!.length - 5} {t('dash_more_categories')}
          </li>
        )}
      </ul>

      <div className="flex gap-2 pt-1">
        {hasPrevious && (
          <button
            onClick={copyPrevious}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                       border border-theme bg-card text-xs font-semibold text-base-theme
                       active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Icon path={mdiContentDuplicate} size={0.6} />
            {t('bud_copy_previous')}
          </button>
        )}
        <button
          onClick={applySuggestions}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                     bg-brand-600 text-white text-xs font-bold
                     active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <Icon path={mdiAutoFix} size={0.6} color="white" />
          {busy ? t('saving') : t('bud_suggest_apply')}
        </button>
      </div>
    </div>
  )
}
