import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiTargetVariant, mdiNotebookOutline, mdiCheck, mdiChevronLeft } from '@mdi/js'
import clsx from 'clsx'
import { authApi, expensesApi } from '../../api'
import { useCategories } from '../../hooks'
import { useAuthStore } from '../../store/auth.store'
import { useI18n, useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { IconDisplay, WorkTimeBadge } from '../../components/ui'
import { todayLocal, dateInputToTimestamp } from '../../utils/localDate'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import { track } from '../../utils/telemetry'
import type { TrackingMode } from '../../types'

const TOTAL_STEPS = 3

/**
 * Three screens, under two minutes, ending in a real number on the home screen.
 *
 * The previous flow pre-selected seven envelope wallets and asked the user to review a
 * list with "recommended %" labels that the backend never applied — wallets were created
 * at a zero balance with no category links, so the envelope system did nothing until the
 * user went and wired it up by hand. That was pure setup cost paid at the moment
 * motivation is weakest, with no value returned.
 *
 * Now onboarding collects the single number the daily loop runs on, and offers to record
 * one transaction so the first home screen has something real on it. Wallets moved to an
 * opt-in inside advanced mode.
 */
export default function Onboarding() {
  const navigate = useNavigate()
  const { lang } = useI18n()
  const t = useT()
  const { user, token, setAuth } = useAuthStore()
  const { data: categories } = useCategories()

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<TrackingMode>('plan')
  const [limit, setLimit] = useState('')
  const [saving, setSaving] = useState(false)

  // Step 3
  const [amount, setAmount] = useState('')
  const [categoryId, setCatId] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => { track('onboarding_started') }, [])
  useEffect(() => { if (step === 3) amountRef.current?.focus() }, [step])

  const expenseCats = useMemo(
    () => (categories ?? []).filter(c => c.type === 'expense').slice(0, 8),
    [categories],
  )

  const limitNum = Number(limit)
  const limitValid = limit !== '' && Number.isFinite(limitNum) && limitNum >= 0.01

  const timezone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok' }
    catch { return 'Asia/Bangkok' }
  })()

  /** Persists the plan and unlocks the app. Step 3 is optional and runs after this. */
  const commitPlan = async (chosenMode: TrackingMode, chosenLimit?: number) => {
    const res = await authApi.completeOnboarding({
      trackingMode: chosenMode,
      ...(chosenMode === 'plan' && chosenLimit ? { monthlySpendingLimit: chosenLimit } : {}),
      timezone,
      lang,
    })
    if (res?.user && token) setAuth(token, res.user)
    track('onboarding_completed')
    if (chosenMode === 'plan' && chosenLimit) track('plan_set')
    else track('onboarding_skipped_plan')
    return res
  }

  const goToFirstTransaction = async (chosenMode: TrackingMode, chosenLimit?: number) => {
    setSaving(true)
    try {
      await commitPlan(chosenMode, chosenLimit)
      setStep(3)
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setSaving(false)
    }
  }

  const saveFirstTransaction = async () => {
    const value = Number(amount)
    if (!(value >= 0.01) || !categoryId) return
    setSaving(true)
    try {
      await expensesApi.create({
        categoryId,
        amount: value,
        type: 'expense',
        occurredAt: dateInputToTimestamp(todayLocal()),
      })
      track('expense_created')
      navigate('/')
    } catch (err) {
      setSaving(false)
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    }
  }

  // Preview of what the home screen will say, so the value is visible before finishing.
  const previewDaily = (() => {
    if (mode !== 'plan' || !limitValid) return null
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysRemaining = daysInMonth - now.getDate() + 1
    return limitNum / daysRemaining
  })()

  return (
    <div className="min-h-dvh bg-app flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md flex-1 flex flex-col animate-fade-in">

        {/* ── Progress ── */}
        <div className="flex items-center gap-2 mb-8">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} aria-label={t('ob_back')}
              className="p-1.5 -ml-1.5 rounded-lg text-muted-theme active:bg-[var(--input)]">
              <Icon path={mdiChevronLeft} size={0.8} />
            </button>
          )}
          <div className="flex-1 flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={clsx(
                'h-1 flex-1 rounded-full transition-colors',
                i < step ? 'bg-brand-600' : 'bg-[var(--input)]',
              )} />
            ))}
          </div>
          <span className="text-[11px] font-semibold text-muted-theme tabular-nums">
            {step}/{TOTAL_STEPS}
          </span>
        </div>

        {/* ── Step 1: what should this help with ── */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <h1 className="text-2xl font-extrabold text-base-theme mb-6">{t('ob_goal_title')}</h1>

            <div className="space-y-3">
              <GoalOption
                icon={mdiTargetVariant}
                title={t('ob_goal_plan')}
                desc={t('ob_goal_plan_desc')}
                selected={mode === 'plan'}
                onSelect={() => setMode('plan')}
              />
              <GoalOption
                icon={mdiNotebookOutline}
                title={t('ob_goal_track')}
                desc={t('ob_goal_track_desc')}
                selected={mode === 'track_only'}
                onSelect={() => setMode('track_only')}
              />
            </div>

            <div className="mt-auto pt-8">
              <button
                onClick={() => (mode === 'plan' ? setStep(2) : goToFirstTransaction('track_only'))}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-sm
                           disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {t('ob_next')}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: the one number ── */}
        {step === 2 && (
          <div className="flex-1 flex flex-col">
            <h1 className="text-2xl font-extrabold text-base-theme mb-2">{t('ob_limit_title')}</h1>
            <p className="text-sm text-muted-theme leading-relaxed mb-6">{t('ob_limit_hint')}</p>

            <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4">
              <label htmlFor="limit" className="text-xs font-semibold text-muted-theme block mb-1 uppercase tracking-wide">
                {t('ob_limit_label')}
              </label>
              <input
                id="limit" type="number" inputMode="decimal" step="0.01" min={0.01}
                placeholder="0" value={limit} onChange={e => setLimit(e.target.value)} autoFocus
                className="w-full text-4xl font-extrabold text-base-theme bg-transparent outline-none
                           placeholder:text-slate-200 dark:placeholder:text-slate-600 tracking-tight"
              />
              <WorkTimeBadge amount={limitNum} size="md" className="mt-1" />
            </div>

            {previewDaily !== null && (
              <div className="mt-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border
                              border-emerald-100 dark:border-emerald-800 px-4 py-3 animate-fade-up">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  {t('home_safe_today')} ≈ ฿{fmt(previewDaily)}
                </p>
                <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  {t('home_safe_caveat')}
                </p>
              </div>
            )}

            <div className="mt-auto pt-8 space-y-2">
              <button
                onClick={() => goToFirstTransaction('plan', limitNum)}
                disabled={!limitValid || saving}
                className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-sm
                           disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {saving ? t('saving') : t('ob_next')}
              </button>
              <button
                onClick={() => goToFirstTransaction('track_only')}
                disabled={saving}
                className="w-full py-2.5 text-sm text-muted-theme hover:text-base-theme transition-colors"
              >
                {t('ob_limit_skip')}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: something real on the first home screen ── */}
        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <h1 className="text-2xl font-extrabold text-base-theme mb-2">{t('ob_first_title')}</h1>
            <p className="text-sm text-muted-theme mb-6">{t('ob_first_hint')}</p>

            <div className="bg-card rounded-2xl border border-theme shadow-sm px-5 py-4 mb-4">
              <label htmlFor="ob-amount" className="text-xs font-semibold text-muted-theme block mb-1 uppercase tracking-wide">
                {t('amount')}
              </label>
              <input
                id="ob-amount" ref={amountRef}
                type="number" inputMode="decimal" step="0.01" min={0.01}
                placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full text-4xl font-extrabold text-base-theme bg-transparent outline-none
                           placeholder:text-slate-200 dark:placeholder:text-slate-600 tracking-tight"
              />
              <WorkTimeBadge amount={Number(amount)} size="md" className="mt-1" />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {expenseCats.map(cat => (
                <button key={cat.id} type="button" onClick={() => setCatId(cat.id)}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all bg-card',
                    categoryId === cat.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 shadow-sm'
                      : 'border-transparent',
                  )}>
                  <div className="w-8 h-8 flex items-center justify-center">
                    <IconDisplay icon={cat.icon} color={cat.color} size="lg" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-theme leading-tight text-center px-1 truncate w-full">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-8 space-y-2">
              <button
                onClick={saveFirstTransaction}
                disabled={saving || !(Number(amount) >= 0.01) || !categoryId}
                className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-bold text-sm
                           disabled:opacity-50 active:scale-[0.98] transition-transform
                           flex items-center justify-center gap-2"
              >
                <Icon path={mdiCheck} size={0.8} color="white" />
                {saving ? t('saving') : t('ob_finish')}
              </button>
              <button
                onClick={() => navigate('/')}
                disabled={saving}
                className="w-full py-2.5 text-sm text-muted-theme hover:text-base-theme transition-colors"
              >
                {t('ob_first_skip')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GoalOption({ icon, title, desc, selected, onSelect }: {
  icon: string; title: string; desc: string; selected: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full flex items-start gap-3 px-4 py-4 rounded-2xl border-2 transition-all text-left',
        selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-[var(--border)] bg-card',
      )}
    >
      <div className={clsx(
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        selected ? 'bg-brand-100 dark:bg-brand-900/40' : 'bg-[var(--input)]',
      )}>
        <Icon path={icon} size={0.9} color={selected ? '#4f46e5' : '#94a3b8'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-base-theme text-sm">{title}</div>
        <div className="text-xs text-muted-theme mt-0.5 leading-relaxed">{desc}</div>
      </div>
      <div className={clsx(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
        selected ? 'border-brand-500 bg-brand-500' : 'border-[var(--border)]',
      )}>
        {selected && <Icon path={mdiCheck} size={0.5} color="white" />}
      </div>
    </button>
  )
}
