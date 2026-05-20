import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import PrivateRoute from './components/layout/PrivateRoute'
import Dashboard from './pages/Dashboard/Dashboard'

// ── Lazy-loaded pages ──────────────────────────────────
const AuthPage   = lazy(() => import('./pages/Auth/AuthPage'))
const AddExpense = lazy(() => import('./pages/AddExpense/AddExpense'))
const History    = lazy(() => import('./pages/History/History'))
const Settings   = lazy(() => import('./pages/Settings/Settings'))
const Wallets    = lazy(() => import('./pages/Wallets/Wallets'))

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
      <Routes>
        <Route path="/login" element={<Lazy><AuthPage /></Lazy>} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/history"  element={<Lazy><History /></Lazy>} />
            <Route path="/wallets"  element={<Lazy><Wallets /></Lazy>} />
            <Route path="/settings" element={<Lazy><Settings /></Lazy>} />
          </Route>
          <Route path="/add" element={
            <Lazy>
              <div className="flex flex-col h-dvh max-w-md mx-auto bg-app">
                <AddExpense />
              </div>
            </Lazy>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
