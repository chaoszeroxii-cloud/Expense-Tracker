import { useState, useEffect, useMemo, useRef, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiChevronLeft, mdiCalendar, mdiCheckCircle, mdiChevronDown,
  mdiWallet, mdiCash, mdiInformationOutline, mdiPlus,
} from '@mdi/js'
import clsx from 'clsx'
import { expensesApi } from '../../api'
import { useCategories, useAllocations, useDailyBrief } from '../../hooks'
import { IconDisplay, WorkTimeBadge, ErrorState } from '../../components/ui'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast, UNDO_WINDOW_MS } from '../../store/toast.store'
import { round2, fmt } from '../../utils/money'
import { todayLocal, dateInputToTimestamp } from '../../utils/localDate'
import { apiErrorMessage } from '../../utils/apiError'
import { enqueue } from '../../utils/offlineQueue'
import { track, startTimer } from '../../utils/telemetry'
import { readCaptureDraft } from '../../utils/captureDraft'
import type { EntryType, Category } from '../../types'

const QUICK = [20, 50, 100, 500]

export default function AddExpense() {
  const navigate = useNavigate()
  const t = useT()
  const location = useLocation()
  const [draft] = useState(() => readCaptureDraft(location.state))
  const [showPrefill, setShowPrefill] = useState(!!draft?.amount)
  const { data: categories, loading: loadingCats, error: catsError, refetch: reloadCats } = useCategories()
  const { data: allocations }                      = useAllocations()
  const { data: brief }                            = useDailyBrief()
  const user = useAuthStore(s => s.user)
  const advancedMode = user?.advancedMode ?? false
  const expectedMonthlyIncome = user?.expectedMonthlyIncome

  const [type,       setType]   = useState<EntryType>(draft?.type ?? 'expense')
  const [amount,     setAmount] = useState(draft?.amount?.toFixed(2) ?? '')
  const [categoryId, setCatId]  = useState(draft?.categoryId ?? '')
  const [note,       setNote]   = useState(draft?.note ?? '')
  const [occurredAt, setDate]   = useState(todayLocal)
  const [showDetails, setShowDetails] = useState(!!draft?.note)
  const [showAllCats, setShowAllCats] = useState(!!draft?.categoryId)
  const [submitting, setSubmit] = useState(false)
  const [success,    setSuccess]= useState(false)

  const amountRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const captureKey = useRef(crypto.randomUUID())
  const navigationTimer = useRef<ReturnType<typeof setTimeout>>()
  // Measures add_opened → expense_created; the sub-10-second target lives on this.
  const timerRef = useRef<ReturnType<typeof startTimer> | null>(null)

  useEffect(() => {
    track('add_opened')
    timerRef.current = startTimer('expense_created')
    // Focusing immediately removes one tap and raises the keyboard on mobile.
    amountRef.current?.focus()
    return () => clearTimeout(navigationTimer.current)
  }, [])

  const filteredCats = useMemo(
    () => categories?.filter(c => c.type === type) ?? [],
    [categories, type],
  )

  /**
   * The four categories this user actually reaches for, from the daily brief's
   * recency-weighted frequency list. Everything else stays one tap away.
   *
   * For a new account, bring everyday categories forward; the API list is alphabetical.
   */
  const frequentCats = useMemo<Category[]>(() => {
    if (type !== 'expense') return []
    const ids = brief?.recentCategoryIds ?? []
    const byId = new Map(filteredCats.map(c => [c.id, c]))
    const picked = ids.map(id => byId.get(id)).filter((c): c is Category => !!c)
    if (picked.length >= 4) return picked.slice(0, 4)
    const everyday = ['food', 'transport', 'coffee', 'shopping', 'utilities', 'other']
    const rest = filteredCats.filter(c => !picked.some(p => p.id === c.id)).sort((a, b) => {
      const rank = (icon: string) => everyday.includes(icon) ? everyday.indexOf(icon) : everyday.length
      return rank(a.icon) - rank(b.icon)
    })
    return [...picked, ...rest].slice(0, 4)
  }, [brief, filteredCats, type])

  const showShortlist = !showAllCats && frequentCats.length > 0
  const visibleCats = showShortlist ? frequentCats : filteredCats

  const amountNum   = Number(amount)
  const amountValid = amount !== '' && Number.isFinite(amountNum) && amountNum >= 0.01
  const categoryValid = filteredCats.some(c => c.id === categoryId)
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(occurredAt) && occurredAt <= todayLocal()
  const canSubmit   = amountValid && categoryValid && dateValid && !catsError && !loadingCats && !submitting

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
    captureKey.current = crypto.randomUUID()
    setAmount('')
    setShowPrefill(false)
    setCatId('')
    setNote('')
    setDate(todayLocal())
    setShowDetails(false)
    setSuccess(false)
    setSubmit(false)
    submittingRef.current = false
    timerRef.current = startTimer('expense_created')
    amountRef.current?.focus()
  }

  /**
   * Saves, or queues the transaction if the network is unreachable.
   *
   * Returns the created id when it reached the server, or `'queued'` when it is waiting
   * on the device. A save made in a basement food court must not evaporate — that single
   * loss is what teaches someone the app cannot be trusted with their records.
   */
  const save = async (): Promise<{ id: string | null; queued: boolean }> => {
    const payload = {
      clientKey: captureKey.current,
      categoryId,
      amount: amountNum,
      type,
      note: note || undefined,
      occurredAt: dateInputToTimestamp(occurredAt),
    }

    try {
      const created = await expensesApi.create(payload)
      timerRef.current?.()
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', {
        detail: { types: ['dashboard', 'transactions'] },
      }))
      return { id: created?.id ?? null, queued: false }
    } catch (err) {
      // Only a transport failure is queued. A rejection carrying a response means the
      // server understood and refused it, and replaying that would never succeed.
      const status = (err as { response?: { status?: number } })?.response?.status
      if ((status && status < 500 && status !== 408 && status !== 429) || !user?.id) throw err

      const entry = await enqueue(user.id, payload)
      if (!entry) throw err          // IndexedDB unavailable — surface the real error

      timerRef.current?.()
      window.dispatchEvent(new CustomEvent('moneyflow:queued'))
      return { id: null, queued: true }
    }
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
    if (submittingRef.current) return
    if (!amountValid) { toast.error(t('err_amount_positive')); return }
    if (!canSubmit) return
    submittingRef.current = true
    setSubmit(true)
    try {
      const { id, queued } = await save()
      // Undo deletes a server-side row, so it is only offered for one that exists.
      const undoAction = id ? { label: t('add_undo'), onPress: () => undo(id) } : undefined
      const message = queued ? t('offline_queued') : t('saved')

      if (andAnother) {
        if (queued) toast.info(message, undefined, UNDO_WINDOW_MS)
        else toast.success(message, undoAction, UNDO_WINDOW_MS)
        resetForNext()
        return
      }
      setSuccess(true)
      // The Undo has to outlive the navigation back to Home, or it is gone before
      // the user has registered that they picked the wrong category.
      if (queued) toast.info(message, undefined, UNDO_WINDOW_MS)
      else toast.success(message, undoAction, UNDO_WINDOW_MS)
      navigationTimer.current = setTimeout(() => navigate('/', { replace: true }), 700)
    } catch (err) {
      // Never swallow this: a silent failure is indistinguishable from a save that
      // quietly lost the transaction.
      setSubmit(false)
      submittingRef.current = false
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
      <p className="text-sm text-muted-theme">{t('ux_today_sub')}</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-app">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <button onClick={() => navigate('/')} aria-label={t('ux_back_home')}
          className="p-3 rounded-2xl bg-card border border-theme transition-colors">
          <Icon path={mdiChevronLeft} size={0.9} className="text-base-theme" />
        </button>
        <div><h1 className="text-xl font-bold text-base-theme">{t('add_transaction')}</h1><p className="text-xs text-muted-theme mt-1">{t('ux_record_hint')}</p></div>
      </div>

      <form onSubmit={e => handleSubmit(e)} className="flex-1 overflow-y-auto px-5 pb-sheet space-y-5">
        {showPrefill && <p className="text-xs text-brand-600 bg-[var(--accent-soft)] rounded-2xl p-3 leading-relaxed">{t('ux_prefilled')}</p>}

        {/* Type toggle */}
        <div className="flex bg-[var(--input)] rounded-2xl p-1 gap-1">
          {(['expense', 'income'] as EntryType[]).map(tp => (
            <button key={tp} type="button" onClick={() => handleTypeChange(tp)}
              aria-pressed={type === tp}
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
        <div className="surface px-5 py-5">
          <label htmlFor="amount" className="text-xs font-semibold text-muted-theme block mb-1 uppercase tracking-wide">
            <span className="text-brand-600 mr-2">01</span>{t('ux_step_amount')} <span className="font-normal">(฿)</span>
          </label>
          <input
            id="amount" ref={amountRef}
            type="number" inputMode="decimal" step="0.01" placeholder="0" value={amount}
            onChange={e => setAmount(e.target.value)} required min={0.01}
            className="w-full capture-amount text-base-theme bg-transparent placeholder:text-muted-theme/40 rounded-lg"
          />
          {type === 'expense' && <WorkTimeBadge amount={amountNum} size="md" className="mt-1" />}

          <div className="flex gap-2 mt-3 flex-wrap">
            {QUICK.map(v => (
              <button key={v} type="button"
                onClick={() => setAmount(p => round2((p ? Number(p) : 0) + v).toFixed(2))}
                className="px-4 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600
                           text-xs font-semibold active:bg-brand-100 transition-colors">
                +{v}
              </button>
            ))}
            {amount && (
              <button type="button" onClick={() => setAmount('')}
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-muted-theme
                           text-xs font-semibold transition-colors">
                {t('ux_clear')}
              </button>
            )}
          </div>
        </div>

        {/* Categories — the four you actually use, everything else one tap away */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <label className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
              <span className="text-brand-600 mr-2">02</span>{type === 'expense' ? t('ux_step_category') : t('category')}
            </label>
            {showShortlist && filteredCats.length > frequentCats.length && (
              <button type="button" onClick={() => setShowAllCats(true)}
                className="text-xs font-semibold text-brand-600">
                {t('add_more_cats')}
              </button>
            )}
          </div>
          {catsError ? <ErrorState compact message={t('err_load_failed')} onRetry={reloadCats} retryLabel={t('action_retry')} /> : !loadingCats && filteredCats.length === 0 ? <div className="surface p-5 text-sm text-muted-theme"><p>{t('ux_categories_empty')}</p><button type="button" className="text-action mt-2" onClick={() => navigate('/settings')}>{t('nav_settings')}</button></div> : <div className="grid grid-cols-4 gap-2">
            {loadingCats
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                ))
              : visibleCats.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCatId(cat.id)}
                    aria-pressed={categoryId === cat.id}
                    className={clsx(
                      'flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all bg-card',
                      categoryId === cat.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                        : 'border-transparent',
                    )}>
                    <div className="w-8 h-8 flex items-center justify-center rounded-xl">
                      <IconDisplay icon={cat.icon} color={cat.color} size="lg" />
                    </div>
                    <span className="text-xs font-semibold text-base-theme leading-relaxed text-center px-1 break-words w-full">
                      {cat.name}
                    </span>
                  </button>
                ))
            }
          </div>}
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
            aria-expanded={showDetails}
            aria-controls="capture-details"
            className="w-full flex items-center justify-between px-5 py-3"
          >
            <span className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
              {t('add_more_details')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-600">{occurredAt === todayLocal() ? t('ux_habit_today') : occurredAt}</span>
              <Icon path={mdiChevronDown} size={0.7}
                className={clsx('text-muted-theme transition-transform', showDetails && 'rotate-180')} />
            </div>
          </button>

          {showDetails && (
            <div id="capture-details" className="px-5 pb-4 space-y-3 animate-fade-up">
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
        <div className="sticky bottom-0 bg-app pt-3 pb-1 border-t border-theme">
          <p className="text-xs text-muted-theme mb-3 text-center" aria-live="polite">{!amountValid ? t('ux_enter_amount') : !categoryValid ? t('ux_choose_category') : t('ux_ready')}</p>
        <div className="flex gap-2 flex-wrap">
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
            aria-label={t('ux_save_another')}
            className={clsx(
              'px-3 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1',
              canSubmit
                ? 'bg-card border-2 border-brand-500 text-brand-600'
                : 'bg-slate-100 dark:bg-slate-800 text-muted-theme cursor-not-allowed',
            )}>
            <Icon path={mdiPlus} size={0.7} />{t('ux_save_another')}
          </button>
        </div>
        </div>
      </form>
    </div>
  )
}
