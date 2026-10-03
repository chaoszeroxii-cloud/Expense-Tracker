import { useState } from 'react'
import clsx from 'clsx'
import { authApi } from '../../api'
import { useAuthStore } from '../../store/auth.store'
import { useT } from '../../store/i18n.store'

export default function HomeBalanceSetting({ loading }: { loading: boolean }) {
  const t = useT()
  const { user, token, setAuth } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const enabled = user?.showCumulativeBalance === true

  const toggle = async () => {
    if (!user || !token || saving || loading) return
    setSaving(true); setFailed(false)
    try {
      const updated = await authApi.updatePreferences({ showCumulativeBalance: !enabled })
      const current = useAuthStore.getState()
      if (current.token !== token || current.user?.id !== user.id) return
      setAuth(token, { ...current.user, showCumulativeBalance: updated.showCumulativeBalance === true })
      window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard'] } }))
    } catch {
      setFailed(true)
    } finally { setSaving(false) }
  }

  return <div className="mt-4 pt-4 border-t border-theme">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-base-theme">{t('settings_cumulative_balance')}</p>
        <p id="home-balance-setting-hint" className="text-xs text-muted-theme mt-1.5 leading-relaxed">{t('settings_cumulative_balance_hint')}</p>
      </div>
      <button type="button" role="switch" aria-checked={enabled}
        aria-label={t('settings_cumulative_balance')} aria-describedby="home-balance-setting-hint"
        aria-busy={saving} disabled={loading || saving || !user || !token} onClick={toggle}
        className="shrink-0 min-h-11 flex items-center disabled:opacity-50">
        <span className={clsx('relative block w-12 h-6 rounded-full transition-colors', enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600')}>
          <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', enabled && 'translate-x-6')} />
        </span>
      </button>
    </div>
    {failed && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300 mt-2">{t('err_generic')}</p>}
  </div>
}
