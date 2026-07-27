import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Layout from './components/layout/Layout'
import PrivateRoute, { AdminRoute } from './components/layout/PrivateRoute'
import Dashboard from './pages/Dashboard/Dashboard'
import { ToastHost } from './components/ui'

// ── Lazy-loaded pages ──────────────────────────────────
const AuthPage         = lazy(() => import('./pages/Auth/AuthPage'))
const ForgotPassword   = lazy(() => import('./pages/Auth/ForgotPasswordPage'))
const ResetPassword    = lazy(() => import('./pages/Auth/ResetPasswordPage'))
const AddExpense    = lazy(() => import('./pages/AddExpense/AddExpense'))
const History       = lazy(() => import('./pages/History/History'))
const Settings      = lazy(() => import('./pages/Settings/Settings'))
const Wallets       = lazy(() => import('./pages/Wallets/Wallets'))
const Onboarding    = lazy(() => import('./pages/Onboarding/Onboarding'))
const More          = lazy(() => import('./pages/More/More'))
const Budget        = lazy(() => import('./pages/Budget/Budget'))
const Loans         = lazy(() => import('./pages/Loans/Loans'))
const Investments   = lazy(() => import('./pages/Investments/Investments'))
const Tax           = lazy(() => import('./pages/Tax/Tax'))
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <SpeedInsights />
      {/* Mounted at the root so routes outside <Layout> (e.g. /add) can raise toasts too. */}
      <ToastHost />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Lazy><AuthPage /></Lazy>} />
        <Route path="/forgot-password" element={<Lazy><ForgotPassword /></Lazy>} />
        <Route path="/reset-password" element={<Lazy><ResetPassword /></Lazy>} />

        {/* Onboarding — auth required but not onboarding-gated */}
        <Route element={<OnboardingRoute />}>
          <Route path="/onboarding" element={<Lazy><Onboarding /></Lazy>} />
        </Route>

        {/* Protected + onboarding-gated */}
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/history"    element={<Lazy><History /></Lazy>} />
            <Route path="/wallets"    element={<Lazy><Wallets /></Lazy>} />
            <Route path="/settings"   element={<Lazy><Settings /></Lazy>} />
            <Route path="/more"       element={<Lazy><More /></Lazy>} />
            {/* Finance was the old hub; keep the URL working for existing bookmarks. */}
            <Route path="/finance"    element={<Navigate to="/more" replace />} />
            <Route path="/budget"     element={<Lazy><Budget /></Lazy>} />
            <Route path="/loans"      element={<Lazy><Loans /></Lazy>} />
            <Route path="/investments" element={<Lazy><Investments /></Lazy>} />
            <Route path="/tax"        element={<Lazy><Tax /></Lazy>} />
          </Route>
          <Route path="/add" element={
            <Lazy>
              <div className="min-h-dvh bg-app">
                <div className="flex flex-col h-dvh max-w-md mx-auto bg-app">
                  <AddExpense />
                </div>
              </div>
            </Lazy>
          } />
        </Route>

        {/* Admin — role-gated */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<Lazy><AdminDashboard /></Lazy>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// Auth-only route (no onboarding redirect)
function OnboardingRoute() {
  const { token } = useAuthStoreRaw()
  return token ? <Outlet /> : <Navigate to="/login" replace />
}

import { useAuthStore } from './store/auth.store'
import { Outlet } from 'react-router-dom'
function useAuthStoreRaw() { return useAuthStore() }
