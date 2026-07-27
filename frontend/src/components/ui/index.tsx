import { ReactNode } from 'react'
import clsx from 'clsx'
import Icon from '@mdi/react'
import { mdiAlertCircleOutline } from '@mdi/js'

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, className, padding = true }:
  { children: ReactNode; className?: string; padding?: boolean }) {
  return (
    <div className={clsx(
      'bg-card rounded-2xl shadow-sm border border-theme',
      padding && 'p-5', className,
    )}>
      {children}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700', className)} />
}

// ── Amount ────────────────────────────────────────────────────
export function Amount({ value, currency = '฿', type, size = 'md' }:
  { value: number; currency?: string; type?: 'expense'|'income'|'net'; size?: 'sm'|'md'|'lg'|'xl' }) {
  const color = type ? {
    expense: 'text-rose-500',
    income:  'text-emerald-500',
    net:     value >= 0 ? 'text-emerald-500' : 'text-rose-500',
  }[type] : 'text-base-theme'
  const sz = { sm:'text-sm font-semibold', md:'text-base font-semibold',
               lg:'text-xl font-bold', xl:'text-3xl font-bold tracking-tight' }[size]
  return (
    <span className={clsx(sz, color)}>
      {type === 'expense' && value > 0 ? '−' : ''}
      {currency}{value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

// ── Empty ─────────────────────────────────────────────────────
// An empty state is the user's next step, not a dead end: pass an `action` unless
// there is genuinely nothing for them to do.
export function Empty({ icon, title, sub, action, compact }: {
  icon: string
  title: string
  sub?: string
  action?: { label: string; onPress: () => void }
  compact?: boolean
}) {
  return (
    <div className={clsx(
      'flex flex-col items-center gap-2 text-muted-theme text-center',
      compact ? 'py-6' : 'py-12',
    )}>
      <Icon
        path={icon}
        size={compact ? 1.5 : 2}
        aria-hidden="true"
        className="text-muted-theme"
      />
      <p className="font-semibold text-sub">{title}</p>
      {sub && <p className="text-sm max-w-xs">{sub}</p>}
      {action && (
        <button
          onClick={action.onPress}
          className="mt-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold
                     active:scale-95 transition-transform"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── ErrorState ────────────────────────────────────────────────
// A failed request must never render as "no data" — that reads as a true zero and
// quietly destroys trust in every number on the screen.
export function ErrorState({ message, onRetry, retryLabel, compact }: {
  message: string
  onRetry?: () => void
  retryLabel: string
  compact?: boolean
}) {
  return (
    <div className={clsx(
      'flex flex-col items-center gap-2 text-center',
      compact ? 'py-6' : 'py-10',
    )}>
      <Icon
        path={mdiAlertCircleOutline}
        size={compact ? 1.4 : 1.8}
        color="#f43f5e"
        aria-hidden="true"
      />
      <p className="font-semibold text-sm text-base-theme max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-4 py-2 rounded-xl border border-theme bg-card text-sm font-semibold
                     text-base-theme active:scale-95 transition-transform"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export { default as IconDisplay } from './IconDisplay'
export { default as ConfirmModal } from './ConfirmModal'
export { default as ToastHost } from './ToastHost'
export { default as WorkTimeBadge } from './WorkTimeBadge'
