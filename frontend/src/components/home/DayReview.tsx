import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkInsApi } from '../../api'
import { useFetch } from '../../hooks'
import { useT } from '../../store/i18n.store'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { apiErrorMessage } from '../../utils/apiError'
import { shiftDateLocal } from '../../utils/localDate'
import { ErrorState } from '../ui'
import type { Coverage } from '../../types'

export default function DayReview({
  coverage,
  onChange,
  initialOpen = false,
}: {
  coverage?: Coverage
  onChange?: (next: Coverage) => void
  initialOpen?: boolean
}) {
  const t = useT(),
    navigate = useNavigate()
  const timezone = useAuthStore((s) => s.user?.timezone ?? 'Asia/Bangkok')
  const today =
    coverage?.days[coverage.days.length - 1]?.date ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  const [open, setOpen] = useState(initialOpen)
  const [date, setDate] = useState(today),
    [busy, setBusy] = useState(false)
  const { data, loading, error, refetch } = useFetch(
    () => (open ? checkInsApi.reviews() : Promise.resolve(null)),
    [open],
  )
  useEffect(() => {
    const refresh = () => {
      if (open) void refetch()
    }
    window.addEventListener('moneyflow:refresh', refresh)
    return () => window.removeEventListener('moneyflow:refresh', refresh)
  }, [open, refetch])
  const day = data?.days.find((d) => d.date === date)
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="mt-4 border-t border-theme pt-4"
    >
      <summary className="cursor-pointer text-sm font-bold">{t('dc_review_day')}</summary>
      <p className="page-description mb-3">{t('dc_review_hint')}</p>
      {error && (
        <ErrorState compact message={error} onRetry={refetch} retryLabel={t('action_retry')} />
      )}
      {data && (
        <>
          <p className="text-xs text-muted-theme mb-2">{t('dc_recent_days')}</p>
          <div className="grid grid-cols-7 gap-1 mb-4" aria-label={t('dc_recent_days')}>
            {data.days.slice(-14).map((d) => (
              <button
                type="button"
                key={d.date}
                aria-pressed={date === d.date}
                aria-label={`${d.date} · ${t(d.reviewed || d.source === 'no_spend' ? 'dc_reviewed' : 'dc_not_reviewed')}`}
                className={`min-h-11 rounded-lg text-xs ${date === d.date ? 'ring-2 ring-[var(--accent)]' : ''} ${d.reviewed || d.source === 'no_spend' ? 'bg-[var(--accent-soft)] text-brand-600' : 'bg-input text-muted-theme'}`}
                onClick={() => setDate(d.date)}
              >
                {Number(d.date.slice(-2))}
                {d.reviewed || d.source === 'no_spend' ? ' ✓' : ''}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="field-label">
        {t('date')}
        <input
          type="date"
          className="field-input"
          min={shiftDateLocal(today, -90)}
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {day && (
        <p className="text-xs text-muted-theme mt-2">
          {t(day.reviewed || day.source === 'no_spend' ? 'dc_reviewed' : 'dc_not_reviewed')}
        </p>
      )}
      <div className="flex flex-col gap-2 mt-3">
        <button
          className="text-action justify-start"
          disabled={!date}
          onClick={() => navigate(`/history?startDate=${date}&endDate=${date}`)}
        >
          {t('dc_week_details')} →
        </button>
        <button
          className="secondary-action"
          disabled={!date}
          onClick={() => navigate(`/capture?date=${date}`)}
        >
          {t('dc_batch')}
        </button>
        <button
          className="primary-action"
          disabled={busy || loading || !day || !!error}
          onClick={async () => {
            setBusy(true)
            try {
              const next = await checkInsApi.review(
                date,
                !(day?.reviewed || day?.source === 'no_spend'),
              )
              onChange?.(next)
              await refetch()
              window.dispatchEvent(
                new CustomEvent('moneyflow:refresh', { detail: { types: ['dashboard'] } }),
              )
              toast.success(t('dc_review_changed'))
            } catch (e) {
              toast.error(apiErrorMessage(e, t('err_save_failed'), t('err_offline')))
            } finally {
              setBusy(false)
            }
          }}
        >
          {day?.reviewed || day?.source === 'no_spend'
            ? t('dc_undo_review')
            : t('dc_mark_reviewed')}
        </button>
      </div>
    </details>
  )
}
