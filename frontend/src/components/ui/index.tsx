import { ReactNode } from 'react'
import clsx from 'clsx'

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
export function Empty({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-muted-theme">
      <div className="text-4xl">{icon}</div>
      <p className="font-semibold text-sub">{title}</p>
      {sub && <p className="text-sm">{sub}</p>}
    </div>
  )
}

export { default as IconDisplay } from './IconDisplay'
export { default as ConfirmModal } from './ConfirmModal'
