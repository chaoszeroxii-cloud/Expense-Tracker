import { useAuthStore } from '../store/auth.store'
import { todayLocal } from './localDate'

/**
 * Minimal first-party product telemetry.
 *
 * Only the event name plus a duration and two coarse client descriptors are sent —
 * never an amount, note, category name, or any other financial content. The server
 * rejects any name outside its own whitelist.
 *
 * Every call is fire-and-forget: analytics must never be able to fail a user action,
 * delay one, or surface an error. Failures are dropped on the floor by design.
 */
export type TelemetryEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped_plan'
  | 'add_opened'
  | 'expense_created'
  | 'add_failed'
  | 'daily_brief_viewed'
  | 'quick_capture_used'
  | 'undo_used'
  | 'plan_set'
  | 'plan_changed'
  | 'work_time_toggled'
  | 'ai_analysis_requested'

const platform = (): string =>
  window.matchMedia?.('(display-mode: standalone)').matches ? 'pwa' : 'web'

const baseUrl = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

export function track(name: TelemetryEvent, durationMs?: number): void {
  const token = useAuthStore.getState().token
  if (!token) return

  const body = JSON.stringify({
    name,
    ...(durationMs !== undefined ? { durationMs: Math.max(0, Math.round(durationMs)) } : {}),
    platform: platform(),
    appVersion: __APP_VERSION__,
    localDate: todayLocal(),
  })

  // `keepalive` lets the request outlive a navigation, which matters for events
  // fired right before the app moves to another screen.
  void fetch(`${baseUrl}/telemetry/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
    keepalive: true,
  }).catch(() => { /* never surface analytics failures */ })
}

/**
 * Measures the time between two moments in a flow, e.g. opening Add and saving.
 * Returns a function that reports the elapsed duration when called.
 */
export function startTimer(name: TelemetryEvent): (event?: TelemetryEvent) => void {
  const startedAt = performance.now()
  return (event = name) => track(event, performance.now() - startedAt)
}
