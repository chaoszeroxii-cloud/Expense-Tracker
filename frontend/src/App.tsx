import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Layout from './components/layout/Layout'
import PrivateRoute, { AdminRoute } from './components/layout/PrivateRoute'
import Dashboard from './pages/Dashboard/Dashboard'
// Login is part of the precached boot bundle. On a first visit its lazy chunk used
// to load before the worker took control, leaving a newly installed app unable to
// open the sign-in screen offline until the user visited it a second time.
import AuthPage from './pages/Auth/AuthPage'
import { ToastHost } from './components/ui'

// ── Lazy-loaded pages ──────────────────────────────────
const ForgotPassword   = lazy(() => import('./pages/Auth/ForgotPasswordPage'))
const ResetPassword    = lazy(() => import('./pages/Auth/ResetPasswordPage'))
const AddExpense    = lazy(() => import('./pages/AddExpense/AddExpense'))
const History       = lazy(() => import('./pages/History/History'))
const Settings      = lazy(() => import('./pages/Settings/Settings'))
const Wallets       = lazy(() => import('./pages/Wallets/Wallets'))
const Onboarding    = lazy(() => import('./pages/Onboarding/Onboarding'))
const More          = lazy(() => import('./pages/More/More'))
const Reports       = lazy(() => import('./pages/Reports/Reports'))
const Budget        = lazy(() => import('./pages/Budget/Budget'))
const BatchCapture = lazy(() => import('./pages/Capture/BatchCapture'))
const Loans         = lazy(() => import('./pages/Loans/Loans'))
const Investments   = lazy(() => import('./pages/Investments/Investments'))
const Tax           = lazy(() => import('./pages/Tax/Tax'))
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'))

function PageLoader() {
  return (
    <div aria-hidden="true" className="px-4 pt-6 sm:px-6 lg:px-2 space-y-6">
      <div className="skeleton h-9 w-40 rounded-xl" />
      <div className="skeleton h-4 w-64 max-w-full rounded-xl" />
      <div className="skeleton h-16 rounded-2xl" />
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="skeleton h-52 rounded-3xl" />
        <div className="skeleton h-52 rounded-3xl" />
      </div>
    </div>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <SpeedInsights beforeSend={event => {
        // OAuth completion and password reset URLs can carry short-lived secrets.
        // Performance metrics need the route only, never the query or fragment.
        const url = new URL(event.url, window.location.origin)
        return { ...event, url: url.origin + url.pathname }
      }} />
      {/* Mounted at the root so routes outside <Layout> (e.g. /add) can raise toasts too. */}
      <ToastHost />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<AuthPage />} />
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
            <Route path="/reports"    element={<Lazy><Reports /></Lazy>} />
            {/* Finance was the old hub; keep the URL working for existing bookmarks. */}
            <Route path="/finance"    element={<Navigate to="/more" replace />} />
            <Route path="/budget"     element={<Lazy><Budget /></Lazy>} />
            <Route path="/capture" element={<Lazy><BatchCapture /></Lazy>} />
            <Route path="/loans"      element={<Lazy><Loans /></Lazy>} />
            <Route path="/investments" element={<Lazy><Investments /></Lazy>} />
            <Route path="/tax"        element={<Lazy><Tax /></Lazy>} />
          </Route>
          <Route path="/add" element={
            <Lazy>
              <div className="min-h-dvh bg-app">
                <div className="flex flex-col h-dvh max-w-lg mx-auto bg-app sm:border-x border-theme">
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

// Auth-only route (no onboarding redirect).
// A selector, not the whole store — subscribing to everything re-rendered this on any
// auth change, including the profile refresh PrivateRoute now performs on load.
function OnboardingRoute() {
  const token = useAuthStore(s => s.token)
  return token ? <Outlet /> : <Navigate to="/login" replace />
}
