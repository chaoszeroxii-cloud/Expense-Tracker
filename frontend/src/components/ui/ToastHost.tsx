import { useEffect } from 'react'
import Icon from '@mdi/react'
import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiInformationOutline, mdiClose } from '@mdi/js'
import clsx from 'clsx'
import { useToastStore, type Toast } from '../../store/toast.store'
import { useT } from '../../store/i18n.store'

const TONE = {
  error:   { icon: mdiAlertCircleOutline, ring: 'border-rose-200 dark:border-rose-800',       accent: 'text-rose-600 dark:text-rose-400',       color: '#e11d48' },
  success: { icon: mdiCheckCircleOutline, ring: 'border-emerald-200 dark:border-emerald-800', accent: 'text-emerald-600 dark:text-emerald-400', color: '#059669' },
  info:    { icon: mdiInformationOutline, ring: 'border-slate-200 dark:border-slate-700',     accent: 'text-brand-600',                         color: '#4f46e5' },
} as const

/**
 * Renders every queued toast above the bottom navigation.
 * Mounted once at the app root so routes outside `<Layout>` (notably `/add`) get it too.
 */
export default function ToastHost() {
  const toasts = useToastStore(s => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-24 lg:pb-6 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map(t => <ToastRow key={t.id} toast={t} />)}
    </div>
  )
}

function ToastRow({ toast }: { toast: Toast }) {
  const t = useT()
  const dismiss = useToastStore(s => s.dismiss)
  const tone = TONE[toast.tone]

  useEffect(() => {
    if (toast.duration === null) return
    const timer = setTimeout(() => dismiss(toast.id), toast.duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, dismiss])

  return (
    <div
      className={clsx(
        'pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-2xl border bg-card',
        'px-4 py-3 shadow-lg animate-fade-up',
        tone.ring,
      )}
    >
      <Icon path={tone.icon} size={0.85} color={tone.color} className="shrink-0" />
      <p className="flex-1 text-sm font-medium text-base-theme leading-snug">{toast.message}</p>

      {toast.action && (
        <button
          onClick={() => { toast.action!.onPress(); dismiss(toast.id) }}
          className={clsx('shrink-0 text-sm font-bold underline underline-offset-2', tone.accent)}
        >
          {toast.action.label}
        </button>
      )}

      <button
        onClick={() => dismiss(toast.id)}
        aria-label={t('action_dismiss')}
        className="shrink-0 p-1 -mr-1 rounded-lg text-muted-theme hover:bg-[var(--input)]"
      >
        <Icon path={mdiClose} size={0.7} />
      </button>
    </div>
  )
}
