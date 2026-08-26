import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { authApi } from '../../api'

/**
 * Refresh the cached profile once per app load.
 *
 * `user` is hydrated from localStorage and, before this, was only ever re-read on the
 * Settings screen. Everything gated on it therefore went stale the moment the account was
 * touched from another device: finish onboarding on a phone, open the app on a laptop, and
 * the laptop still believed `onboardingCompleted: false` — so it redirected to onboarding
 * and completing it a second time overwrote the spending plan that was already set.
 * `advancedMode` and `timezone` drifted the same way.
 *
 * Failures are ignored on purpose. A 401 is already handled by the response interceptor,
 * and an offline start should keep working from the cached copy rather than bouncing the
 * user to the login screen.
 */
function useRefreshProfile(enabled: boolean) {
  const setAuth = useAuthStore(s => s.setAuth)
  const done = useRef(false)

  useEffect(() => {
    if (!enabled || done.current) return
    done.current = true
    authApi.me()
      .then(fresh => {
        const token = useAuthStore.getState().token
        if (token) setAuth(token, fresh)
      })
      .catch(() => { /* interceptor handles 401; stay on the cached profile otherwise */ })
  }, [enabled, setAuth])
}

export default function PrivateRoute() {
  // Selectors rather than the whole store: subscribing to everything re-rendered the
  // entire routed tree on any auth change.
  const token = useAuthStore(s => s.token)
  const onboardingCompleted = useAuthStore(s => s.user?.onboardingCompleted)

  useRefreshProfile(Boolean(token))

  if (!token) return <Navigate to="/login" replace />
  if (onboardingCompleted === false) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function AdminRoute() {
  const token = useAuthStore(s => s.token)
  const role = useAuthStore(s => s.user?.role)

  useRefreshProfile(Boolean(token))

  if (!token) return <Navigate to="/login" replace />
  if (role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
