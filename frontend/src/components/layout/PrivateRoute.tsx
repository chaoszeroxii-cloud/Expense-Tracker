import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

export default function PrivateRoute() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
