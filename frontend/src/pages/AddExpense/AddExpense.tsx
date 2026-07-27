import { useState, useEffect, useMemo, useRef, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChevronLeft, mdiCalendar, mdiCheckCircle, mdiChevronDown,
  mdiWallet, mdiCash, mdiInformationOutline, mdiPlus,
} from '@mdi/js'
import clsx from 'clsx'
import { expensesApi } from '../../api'
import { useCategories, useAllocations, useDailyBrief } from '../../hooks'
import { IconDisplay, WorkTimeBadge } from '../../components/ui'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast, UNDO_WINDOW_MS } from '../../store/toast.store'
import { round2, fmt } from '../../utils/money'
import { todayLocal, dateInputToTimestamp } from '../../utils/localDate'
import { apiErrorMessage } from '../../utils/apiError'
import { track, startTimer } from '../../utils/telemetry'
import type { EntryType, Category } from '../../types'

const QUICK = [20, 50, 100, 500]

export default function AddExpense() {
  const navigate = useNavigate()
  const t = useT()
  const { data: categories, loading: loadingCats } = useCategories()
  const { data: allocations }                      = useAllocations()
  const { data: brief }                            = useDailyBrief()
  const user = useAuthStore(s => s.user)
  const advancedMode = user?.advancedMode ?? false
  const expectedMonthlyIncome = user?.expectedMonthlyIncome

  const [type,       setType]   = useState<EntryType>('expense')
  const [amount,     setAmount] = useState('')
  const [categoryId, setCatId]  = useState('')
  const [note,       setNote]   = useState('')
  const [occurredAt, setDate]   = useState(todayLocal)
  const [showDetails, setShowDetails] = useState(false)
  const [showAllCats, setShowAllCats] = useState(false)
  const [submitting, setSubmit] = useState(false)
  const [success,    setSuccess]= useState(false)

  const amountRef = useRef<HTMLInputElement>(null)
  // Measures add_opened → expense_created; the sub-10-second target lives on this.
  const timerRef = useRef<ReturnType<typeof startTimer> | null>(null)

  useEffect(() => {
    track('add_opened')
    timerRef.current = startTimer('expense_created')
    // Focusing immediately removes one tap and raises the keyboard on mobile.
    amountRef.current?.focus()
  }, [])

  const filteredCats = useMemo(
    () => categories?.filter(c => c.type === type) ?? [],
    [categories, type],
  )

  /**
   * The four categories this user actually reaches for, from the daily brief's
   * recency-weighted frequency list. Everything else stays one tap away.
   *
   * Falls back to the head of the category list for a brand-new account, which is
   * ordered with the everyday categories first when seeded.
   */
  const frequentCats = useMemo<Category[]>(() => {
    if (type !== 'expense') return []
    const ids = brief?.recentCategoryIds ?? []
    const byId = new Map(filteredCats.map(c => [c.id, c]))
    const picked = ids.map(id => byId.get(id)).filter((c): c is Category => !!c)
    if (picked.length >= 4) return picked.slice(0, 4)
    const rest = filteredCats.filter(c => !picked.some(p => p.id === c.id))
    return [...picked, ...rest].slice(0, 4)
  }, [brief, filteredCats, type])

  const showShortlist = !showAllCats && frequentCats.length > 0
  const visibleCats = showShortlist ? frequentCats : filteredCats

  const amountNum   = Number(amount)
  const amountValid = amount !== '' && Number.isFinite(amountNum) && amountNum >= 0.01
  const canSubmit   = amountValid && !!categoryId && !submitting

  // Wallet previews only mean something to users who opted into envelopes.
  const linkedAlloc = advancedMode && type === 'expense' && categoryId
    ? allocations?.find(a => a.categories.some(c => c.id === categoryId))
    : null
  const linkedIncomeAlloc = advancedMode && type === 'income' && categoryId
    ? allocations?.find(a => a.incomeCategories?.some(c => c.id === categoryId))
    : null

  const handleTypeChange = (tp: EntryType) => {
    setType(tp)
    setCatId('')
    setShowAllCats(tp === 'income')
    if (tp === 'income' && !amount && expectedMonthlyIncome) {
      setAmount(Number(expectedMonthlyIncome).toFixed(2))
    }
  }

  const resetForNext = () => {
    setAmount('')
    setCatId('')
    setNote('')
    setShowDetails(false)
    setSuccess(false)
    setSubmit(false)
    timerRef.current = startTimer('expense_created')
    amountRef.current?.focus()
  }

  const save = async (): Promise<string | null> => {
    const created = await expensesApi.create({
      categoryId,
      amount: amountNum,
      type,
      note: note || undefined,
      occurredAt: dateInputToTimestamp(occurredAt),
    })
    timerRef.current?.()
    window.dispatchEvent(new CustomEvent('moneyflow:refresh', {
      detail: { types: ['dashboard', 'transactions'] },
    }))
    return created?.id ?? null
  }

  /** Removes a just-saved transaction. A mistake must cost one tap, not a trip to History. */
  const undo = async (id: string) => {
    try {
      await expensesApi.remove(id)
      track('undo_used')
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', {
        detail: { types: ['dashboard', 'transactions'] },
      }))
      toast.success(t('add_undone'))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    }
  }

  const handleSubmit = async (e: FormEvent, andAnother = false) => {
    e.preventDefault()
    if (!amountValid) { toast.error(t('err_amount_positive')); return }
    if (!categoryId) return
    setSubmit(true)
    try {
      const id = await save()
      const undoAction = id ? { label: t('add_undo'), onPress: () => undo(id) } : undefined

      if (andAnother) {
        toast.success(t('saved'), undoAction, UNDO_WINDOW_MS)
        resetForNext()
        return
      }
      setSuccess(true)
      // The Undo has to outlive the navigation back to Home, or it is gone before
      // the user has registered that they picked the wrong category.
      toast.success(t('saved'), undoAction, UNDO_WINDOW_MS)
      setTimeout(() => navigate('/'), 700)
    } catch (err) {
      // Never swallow this: a silent failure is indistinguishable from a save that
      // quietly lost the transaction.
      setSubmit(false)
      track('add_failed')
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    }
  }

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in bg-app">
      <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
        <Icon path={mdiCheckCircle} size={2.2} color="#10b981" />
      </div>
      <p className="text-lg font-bold text-base-theme">{t('saved')}</p>
      {brief?.safeToday !== null && brief?.safeToday !== undefined && (
        <p className="text-sm text-muted-theme">
          {t('home_safe_today')} ฿{fmt(Math.max(0, brief.safeToday - amountNum))}
        </p>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-app">
      <div className="flex items-center gap-3 px-4 pt-6 pb-3">
        <button onClick={() => navigate(-1)} aria-label={t('ob_back')}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200 transition-colors">
          <Icon path={mdiChevronLeft} size={0.9} className="text-base-theme" />
        </button>
        <h1 className="text-lg font-bold text-base-theme">{t('add_transaction')}</h1>
      </div>

      <form onSubmit={e => handleSubmit(e)} className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">

        {/* Type toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
          {(['expense', 'income'] as EntryType[]).map(tp => (
            <button key={tp} type="button" onClick={() => handleTypeChange(tp)}
              className={clsx(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                type === tp
                  ? tp === 'expense'
                    ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-sm'
                    : 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm'
                  : 'text-muted-theme',
              )}>
              <Icon path={tp === 'expense' ? mdiWallet : mdiCash} size={0.65} />
              {tp === 'expense' ? t('expense') : t('income_tab')}
            </button>
          ))}
        </div>

        {/* Amount — focused on mount, with the work-time lens right beneath it */}
        <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4">
          <label htmlFor="amount" className="text-xs font-semibold text-muted-theme block mb-1 uppercase tracking-wide">
            {t('amount')}
          </label>
          <input
            id="amount" ref={amountRef}
            type="number" inputMode="decimal" step="0.01" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)} required min={0.01}
            className="w-full text-4xl font-extrabold text-base-theme bg-transparent
                       outline-none placeholder:text-slate-200 dark:placeholder:text-slate-600 tracking-tight"
          />
          {type === 'expense' && <WorkTimeBadge amount={amountNum} size="md" className="mt-1" />}

          <div className="flex gap-2 mt-3 flex-wrap">
            {QUICK.map(v => (
              <button key={v} type="button"
                onClick={() => setAmount(p => round2((p ? Number(p) : 0) + v).toFixed(2))}
                className="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600
                           text-xs font-semibold active:bg-brand-100 transition-colors">
                +{v}
              </button>
            ))}
            {amount && (
              <button type="button" onClick={() => setAmount('')}
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-muted-theme
                           text-xs font-semibold transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Categories — the four you actually use, everything else one tap away */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
              {showShortlist ? t('add_frequent') : t('category')}
            </label>
            {showShortlist && filteredCats.length > frequentCats.length && (
              <button type="button" onClick={() => setShowAllCats(true)}
                className="text-xs font-semibold text-brand-600">
                {t('add_more_cats')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {loadingCats
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                ))
              : visibleCats.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCatId(cat.id)}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all bg-card',
                      categoryId === cat.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                        : 'border-transparent',
                    )}>
                    <div className="w-8 h-8 flex items-center justify-center rounded-xl">
                      <IconDisplay icon={cat.icon} color={cat.color} size="lg" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-theme leading-tight text-center px-1 truncate w-full">
                      {cat.name}
                    </span>
                  </button>
                ))
            }
          </div>
        </div>

        {/* Wallet effect — advanced mode only */}
        {advancedMode && type === 'expense' && categoryId && (
          <div className={clsx(
            'rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up',
            linkedAlloc
              ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800'
              : 'bg-slate-50 dark:bg-slate-800 border border-theme',
          )}>
            <Icon path={mdiWallet} size={0.8} color={linkedAlloc ? '#4f46e5' : '#94a3b8'} />
            {linkedAlloc ? (
              <div>
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-1">
                  {t('will_deduct')}
                  <IconDisplay icon={linkedAlloc.icon} size="sm" />
                  {linkedAlloc.name}
                </p>
                <p className="text-[10px] text-brand-400 mt-0.5">
                  {t('current_balance')} ฿{fmt(Number(linkedAlloc.balance))}
                  {amountValid && (
                    <span className="ml-1 text-rose-400">
                      → ฿{fmt(Number(linkedAlloc.balance) - amountNum)} {t('after')}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-theme font-medium">{t('no_wallet_linked')}</p>
            )}
          </div>
        )}

        {advancedMode && type === 'income' && categoryId && linkedIncomeAlloc && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-up
                          bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
            <Icon path={mdiWallet} size={0.8} color="#10b981" />
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
              {t('will_credit')}
              <IconDisplay icon={linkedIncomeAlloc.icon} size="sm" />
              {linkedIncomeAlloc.name}
            </p>
          </div>
        )}

        {type === 'income' && !advancedMode && (
          <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20
                          border border-emerald-100 dark:border-emerald-800
                          rounded-2xl px-4 py-3 animate-fade-up">
            <Icon path={mdiInformationOutline} size={0.8} color="#10b981" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
              {t('income_park_info')}
            </p>
          </div>
        )}

        {/* Date and note are almost always "today" and "nothing" — collapsed by default */}
        <div className="bg-card rounded-2xl border border-theme shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3"
          >
            <span className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
              {t('add_more_details')}
            </span>
            <div className="flex items-center gap-2">
              {occurredAt !== todayLocal() && (
                <span className="text-[10px] font-semibold text-brand-600">{occurredAt}</span>
              )}
              <Icon path={mdiChevronDown} size={0.7}
                className={clsx('text-muted-theme transition-transform', showDetails && 'rotate-180')} />
            </div>
          </button>

          {showDetails && (
            <div className="px-5 pb-4 space-y-3 animate-fade-up">
              <div>
                <label htmlFor="date" className="text-[10px] font-semibold text-muted-theme block mb-1 uppercase">
                  {t('date')}
                </label>
                <div className="flex items-center gap-3">
                  <Icon path={mdiCalendar} size={0.8} color="#818cf8" />
                  <input id="date" type="date" value={occurredAt} onChange={e => setDate(e.target.value)}
                    max={todayLocal()} required
                    className="flex-1 text-base-theme font-semibold bg-transparent outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="note" className="text-[10px] font-semibold text-muted-theme block mb-1 uppercase">
                  {t('note_optional')}
                </label>
                <input id="note" type="text" placeholder={t('note_placeholder')} value={note}
                  onChange={e => setNote(e.target.value)} maxLength={200}
                  className="w-full text-base-theme font-medium bg-transparent outline-none placeholder:text-muted-theme" />
              </div>
            </div>
          )}
        </div>

        {/* Save, plus a path that keeps you here for the next one */}
        <div className="flex gap-2">
          <button type="submit"
            disabled={!canSubmit}
            className={clsx(
              'flex-1 py-4 rounded-2xl font-bold text-white text-base transition-all',
              'active:scale-[0.98] shadow-lg',
              !canSubmit
                ? 'bg-slate-300 dark:bg-slate-700 shadow-none cursor-not-allowed'
                : type === 'expense'
                  ? 'bg-brand-600 shadow-brand-500/30'
                  : 'bg-emerald-500 shadow-emerald-500/30',
            )}>
            {submitting ? t('saving') : type === 'expense' ? t('save_expense') : t('save_income')}
          </button>

          <button
            type="button"
            onClick={e => handleSubmit(e, true)}
            disabled={!canSubmit}
            aria-label={t('add_another')}
            className={clsx(
              'px-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]',
              canSubmit
                ? 'bg-card border-2 border-brand-500 text-brand-600'
                : 'bg-slate-100 dark:bg-slate-800 text-muted-theme cursor-not-allowed',
            )}>
            <Icon path={mdiPlus} size={0.9} />
          </button>
        </div>
      </form>
    </div>
  )
}
