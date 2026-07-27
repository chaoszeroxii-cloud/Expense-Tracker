import { useEffect, useState } from 'react'
import Icon from '@mdi/react'
import { mdiBellOutline, mdiBellCheckOutline, mdiCellphoneArrowDown, mdiBellOffOutline } from '@mdi/js'
import clsx from 'clsx'
import { notificationsApi, authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { detectSupport, subscribeToPush, unsubscribeFromPush, type PushSupport } from '../../utils/push'

/**
 * The daily reminder.
 *
 * Permission is requested from a tap here rather than on load: Safari refuses a prompt
 * that did not come from a gesture, and a site that asks the moment you arrive tends to
 * get a permanent "no" — after which only the browser settings can undo it.
 *
 * The whole section hides itself when the server has no VAPID keys, so the feature never
 * appears as a switch that does nothing.
 */
export default function ReminderSettings() {
  const t = useT()
  const { user, token, setAuth } = useAuthStore()

  const [status, setStatus] = useState<Awaited<ReturnType<typeof notificationsApi.status>> | null>(null)
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [busy, setBusy] = useState(false)
  const [time, setTime] = useState('20:30')

  useEffect(() => {
    setSupport(detectSupport())
    notificationsApi.status()
      .then(s => { setStatus(s); setTime(s.remindAt) })
      .catch(() => setStatus(null))
  }, [])

  if (!status?.configured) return null

  const enabled = status.enabled && status.deviceCount > 0

  const enable = async () => {
    setBusy(true)
    try {
      const subscription = await subscribeToPush(status.publicKey!)
      if (!subscription) {
        // Declining is a valid answer; say what happened rather than failing silently.
        setSupport(detectSupport())
        toast.info(t('rem_permission_declined'))
        return
      }
      await notificationsApi.subscribe(subscription)
      setStatus(await notificationsApi.status())
      toast.success(t('rem_enabled'))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const endpoint = await unsubscribeFromPush()
      await notificationsApi.unsubscribe(endpoint ?? undefined)
      setStatus(await notificationsApi.status())
      toast.success(t('rem_disabled'))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  const saveTime = async (value: string) => {
    setTime(value)
    try {
      const updated = await authApi.updatePreferences({ remindAt: value })
      if (updated && token) setAuth(token, updated)
      setStatus(await notificationsApi.status())
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_save_failed'), t('err_offline')))
    }
  }

  const sendTest = async () => {
    setBusy(true)
    try {
      const res = await notificationsApi.test()
      if (res.sent > 0) toast.success(t('rem_test_sent'))
      else toast.error(t('rem_test_failed'))
    } catch (err) {
      toast.error(apiErrorMessage(err, t('err_generic'), t('err_offline')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-theme shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon path={enabled ? mdiBellCheckOutline : mdiBellOutline} size={0.7} color="#4f46e5" />
        </div>
        <h2 className="font-bold text-base-theme text-sm">{t('rem_title')}</h2>
      </div>

      {/* iOS grants push only to an installed PWA, so say that instead of "unsupported". */}
      {support === 'ios-needs-install' ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <Icon path={mdiCellphoneArrowDown} size={0.75} color="#f59e0b" className="shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{t('rem_ios_install')}</p>
        </div>
      ) : support === 'denied' ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-[var(--input)] px-4 py-3">
          <Icon path={mdiBellOffOutline} size={0.75} className="text-muted-theme shrink-0 mt-0.5" />
          <p className="text-xs text-muted-theme leading-relaxed">{t('rem_blocked')}</p>
        </div>
      ) : support === 'unsupported' ? (
        <p className="text-xs text-muted-theme leading-relaxed">{t('rem_unsupported')}</p>
      ) : (
        <>
          <p className="text-xs text-muted-theme leading-relaxed mb-4">{t('rem_desc')}</p>

          <button
            onClick={enabled ? disable : enable}
            disabled={busy}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl
                       bg-[var(--input)] border border-theme text-left disabled:opacity-60"
          >
            <span className="text-sm font-semibold text-base-theme">
              {enabled ? t('rem_on') : t('rem_off')}
            </span>
            <span className={clsx('shrink-0 w-10 h-6 rounded-full transition-colors relative',
              enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}>
              <span className={clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </span>
          </button>

          {enabled && (
            <div className="mt-3 space-y-3 animate-fade-up">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="remind-at" className="text-xs font-medium text-base-theme">
                  {t('rem_time')}
                </label>
                <input
                  id="remind-at" type="time" value={time}
                  onChange={e => saveTime(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[var(--input)] border border-theme
                             text-sm text-base-theme outline-none"
                />
              </div>
              <p className="text-[11px] text-muted-theme leading-relaxed">
                {t('rem_skip_note')} · {status.timezone}
              </p>
              <button
                onClick={sendTest}
                disabled={busy}
                className="w-full py-2.5 rounded-xl border border-theme bg-card text-xs font-semibold
                           text-base-theme active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {t('rem_send_test')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
