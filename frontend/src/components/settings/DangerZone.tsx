import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import { mdiAlertOutline, mdiTrayArrowDown, mdiDeleteSweepOutline, mdiRestartAlert } from '@mdi/js'
import clsx from 'clsx'
import { accountApi, expensesApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT, useI18n } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { exportHistory } from '../../utils/exportHistory'
import { currentMonthLocal, monthOffset } from '../../utils/localDate'
import { fmt } from '../../utils/money'

const RESET_PHRASE = 'ลบรายการทั้งหมด'

/**
 * The two irreversible actions, kept together and behind a typed confirmation.
 *
 * Typing is the guard because a tap is not a decision: an accidental press on a phone is
 * one gesture, whereas reproducing a phrase is deliberate. The two actions ask for
 * *different* phrases on purpose — if both said "confirm", the muscle memory built on the
 * recoverable one would carry straight into the one that wipes the account.
 *
 * An export is offered inside the dialog, since nothing here can be undone.
 */
export default function DangerZone() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const { user, token, setAuth } = useAuthStore()

  const [mode, setMode] = useState<null | 'transactions' | 'factory'>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Range for the transaction reset — defaults to everything.
  const [useRange, setUseRange] = useState(false)
  const [from, setFrom] = useState(monthOffset(currentMonthLocal(), -1))
  const [to, setTo] = useState(currentMonthLocal())
  const [preview, setPreview] = useState<{ count: number; expenseTotal: number; firstMonth: string | null; lastMonth: string | null } | null>(null)

  useEffect(() => {
    if (mode !== 'transactions') return
    let cancelled = false
    accountApi
      .resetPreview(useRange ? from : undefined, useRange ? to : undefined)
      .then(p => { if (!cancelled) setPreview(p) })
      .catch(() => { if (!cancelled) setPreview(null) })
    return () => { cancelled = true }
  }, [mode, useRange, from, to])

  const close = () => { setMode(null); setConfirmText(''); setPreview(null) }

  const downloadBackup = async () => {
    setExporting(true)
    try {
      const rows = await expensesApi.list(
        useRange && mode === 'transactions' ? { from, to } : undefined,
      )
      if (!rows.length) { toast.info(t('export_empty')); return }
      await exportHistory('csv', rows, {
        from: from, to: to, lang,
      })
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setExporting(false)
    }
  }

  const runTransactionReset = async () => {
    setBusy(true)
    try {
      const res = await accountApi.resetTransactions(
        confirmText,
        useRange ? { from, to } : {},
      )
      toast.success(`${t('dz_reset_done')} ${res.deletedTransactions}`)
      close()
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', {
        detail: { types: ['dashboard', 'transactions', 'budget', 'loans'] },
      }))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  const runFactoryReset = async () => {
    setBusy(true)
    try {
      await accountApi.factoryReset(confirmText, lang)
      // Onboarding was re-armed server-side; reflect that locally so the app routes
      // there instead of dropping the user on an empty home screen.
      if (user && token) setAuth(token, { ...user, onboardingCompleted: false, advancedMode: false, monthlySpendingLimit: null })
      toast.success(t('dz_factory_done'))
      navigate('/onboarding', { replace: true })
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
      setBusy(false)
    }
  }

  const expected = mode === 'factory' ? (user?.email ?? '') : RESET_PHRASE
  const matches = mode === 'factory'
    ? confirmText.trim().toLowerCase() === expected.toLowerCase()
    : confirmText.trim() === expected

  return (
    <section className="rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-rose-50 dark:bg-rose-900/20">
        <Icon path={mdiAlertOutline} size={0.75} color="#e11d48" />
        <h2 className="font-bold text-rose-700 dark:text-rose-300 text-sm">{t('dz_title')}</h2>
      </div>

      <div className="p-5 space-y-3">
        <Row
          icon={mdiDeleteSweepOutline}
          title={t('dz_reset_title')}
          desc={t('dz_reset_desc')}
          onPress={() => { setMode('transactions'); setConfirmText('') }}
        />
        <Row
          icon={mdiRestartAlert}
          title={t('dz_factory_title')}
          desc={t('dz_factory_desc')}
          onPress={() => { setMode('factory'); setConfirmText('') }}
        />
      </div>

      {mode && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={close}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-card rounded-t-3xl lg:rounded-3xl p-5 shadow-2xl animate-fade-up
                       max-h-[90dvh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-base-theme mb-1">
              {mode === 'factory' ? t('dz_factory_title') : t('dz_reset_title')}
            </h3>
            <p className="text-xs text-muted-theme leading-relaxed mb-4">
              {mode === 'factory' ? t('dz_factory_warn') : t('dz_reset_warn')}
            </p>

            {mode === 'transactions' && (
              <div className="space-y-3 mb-4">
                <div className="flex bg-[var(--input)] rounded-xl p-1 gap-1">
                  {[
                    { value: false, label: t('dz_range_all') },
                    { value: true,  label: t('dz_range_pick') },
                  ].map(opt => (
                    <button key={String(opt.value)} onClick={() => setUseRange(opt.value)}
                      className={clsx('flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
                        useRange === opt.value ? 'bg-card text-base-theme shadow-sm' : 'text-muted-theme')}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {useRange && (
                  <div className="flex items-center gap-2">
                    <input type="month" value={from} max={currentMonthLocal()}
                      onChange={e => setFrom(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-[var(--input)] border border-theme
                                 text-sm text-base-theme outline-none" />
                    <span className="text-muted-theme text-xs">→</span>
                    <input type="month" value={to} max={currentMonthLocal()}
                      onChange={e => setTo(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl bg-[var(--input)] border border-theme
                                 text-sm text-base-theme outline-none" />
                  </div>
                )}

                {/* State what is at stake, in numbers, before asking them to type. */}
                {preview && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                      {preview.count} {t('dz_will_delete')}
                    </p>
                    {preview.count > 0 && (
                      <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                        {t('total_expenses')} ฿{fmt(preview.expenseTotal)}
                        {preview.firstMonth && ` · ${preview.firstMonth} – ${preview.lastMonth}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nothing here can be undone, so offer the data on the way out. */}
            <button
              onClick={downloadBackup}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mb-4
                         border border-theme bg-card text-xs font-semibold text-base-theme
                         active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Icon path={mdiTrayArrowDown} size={0.65} />
              {exporting ? t('saving') : t('dz_export_first')}
            </button>

            <label htmlFor="dz-confirm" className="text-xs font-semibold text-base-theme block mb-1.5">
              {mode === 'factory' ? t('dz_type_email') : t('dz_type_phrase')}
            </label>
            <p className="text-[11px] text-muted-theme mb-2 font-mono select-all break-all">{expected}</p>
            <input
              id="dz-confirm"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input)] border border-theme
                         text-sm text-base-theme outline-none focus:border-rose-400 mb-4"
            />

            <div className="flex gap-2">
              <button onClick={close} disabled={busy}
                className="flex-1 py-3 rounded-xl border border-theme bg-card text-sm font-semibold text-base-theme">
                {t('action_cancel')}
              </button>
              <button
                onClick={mode === 'factory' ? runFactoryReset : runTransactionReset}
                disabled={!matches || busy || (mode === 'transactions' && preview?.count === 0)}
                className={clsx(
                  'flex-1 py-3 rounded-xl text-sm font-bold transition-transform',
                  matches && !busy && !(mode === 'transactions' && preview?.count === 0)
                    ? 'bg-rose-600 text-white active:scale-95'
                    : 'bg-slate-200 dark:bg-slate-700 text-muted-theme cursor-not-allowed',
                )}
              >
                {busy ? t('saving') : t('dz_confirm_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Row({ icon, title, desc, onPress }: {
  icon: string; title: string; desc: string; onPress: () => void
}) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-theme bg-card
                 active:scale-[0.98] transition-transform text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
        <Icon path={icon} size={0.8} color="#e11d48" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-base-theme">{title}</div>
        <div className="text-[11px] text-muted-theme mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </button>
  )
}
