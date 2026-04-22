// src/components/ui/ConfirmModal.tsx
import Icon from '@mdi/react'
import { mdiAlertCircleOutline } from '@mdi/js'
import clsx from 'clsx'

interface Props {
  open: boolean
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open, message, confirmLabel = 'ตกลง', cancelLabel = 'ยกเลิก',
  danger = true, onConfirm, onCancel,
}: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 sm:items-center"
         onClick={onCancel}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl p-6 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className={clsx(
            'w-14 h-14 rounded-2xl flex items-center justify-center',
            danger ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
          )}>
            <Icon
              path={mdiAlertCircleOutline}
              size={1.4}
              color={danger ? '#f43f5e' : '#f59e0b'}
            />
          </div>
          <p className="text-base font-semibold text-base-theme leading-snug">{message}</p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700
                       text-sm font-semibold text-muted-theme
                       active:bg-slate-200 dark:active:bg-slate-600 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-colors',
              danger
                ? 'bg-rose-500 active:bg-rose-600'
                : 'bg-brand-600 active:bg-brand-700'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}