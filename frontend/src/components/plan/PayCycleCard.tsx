import { useState } from 'react'
import { planningApi } from '../../api'
import { useT } from '../../store/i18n.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { fmt } from '../../utils/money'
import { ErrorState } from '../ui'
import { useAuthStore } from '../../store/auth.store'
import type { PayCycle } from '../../types/companion'
export default function PayCycleCard({
  onChanged,
  resource,
}: {
  onChanged: () => void
  resource: { data: PayCycle | null; error: string | null; refetch: () => Promise<void> }
}) {
  const t = useT(),
    { data, error, refetch } = resource
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ enabled: false, payDay: 25, budget: 0 })
  return (
    <section className="surface p-5" aria-label={t('dc_cycle')}>
      <div className="flex gap-4 items-center justify-between">
        <div>
          <h2 className="section-title">{t('dc_cycle')}</h2>
          <p className="page-description">{t('dc_cycle_hint')}</p>
        </div>
        <button
          className="text-action shrink-0"
          disabled={!data}
          onClick={() => {
            if (data)
              setForm({ enabled: data.enabled, payDay: data.payDay, budget: data.budget ?? 0 })
            setEditing(!editing)
          }}
        >
          {t('dc_manage')}
        </button>
      </div>
      {error && (
        <ErrorState compact message={error} onRetry={refetch} retryLabel={t('action_retry')} />
      )}
      {data?.enabled && (
        <div className="rounded-xl bg-[var(--accent-soft)] p-4 mt-4 text-sm">
          <p className="font-semibold text-brand-600">{t('dc_cycle_active')}</p>
          {data.period && (
            <p className="mt-2">
              {data.period.start} – {data.period.end} · ฿{fmt(data.period.spent)} / ฿
              {fmt(data.budget ?? 0)}
            </p>
          )}
        </div>
      )}
      {editing && (
        <form
          className="space-y-4 mt-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            try {
              await planningApi.saveCycle(form)
              const auth = useAuthStore.getState()
              if (form.enabled && auth.token && auth.user)
                auth.setAuth(auth.token, { ...auth.user, trackingMode: 'plan' })
              await refetch()
              onChanged()
              setEditing(false)
              window.dispatchEvent(
                new CustomEvent('moneyflow:refresh', {
                  detail: { types: ['dashboard', 'budget', 'planning'] },
                }),
              )
            } catch (e) {
              toast.error(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              {t('dc_cycle_enable')}
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="field-label">
                {t('dc_pay_day')}
                <input
                  className="field-input"
                  type="number"
                  required
                  min={1}
                  max={31}
                  step={1}
                  value={form.payDay}
                  onChange={(e) => setForm({ ...form, payDay: Number(e.target.value) })}
                />
              </label>
              <label className="field-label">
                {t('dc_cycle_budget')}
                <input
                  className="field-input"
                  required
                  type="number"
                  min="0.01"
                  max="9999999999.99"
                  step="0.01"
                  value={form.budget || ''}
                  onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="text-xs text-muted-theme leading-relaxed">{t('dc_cycle_month_end')}</p>
            <button className="primary-action">{t('save')}</button>
          </fieldset>
        </form>
      )}
    </section>
  )
}
