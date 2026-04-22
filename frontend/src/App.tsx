import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import PrivateRoute from './components/layout/PrivateRoute'
import AuthPage from './pages/Auth/AuthPage'
import Dashboard from './pages/Dashboard/Dashboard'
import AddExpense from './pages/AddExpense/AddExpense'
import History from './pages/History/History'
import Settings from './pages/Settings/Settings'
import Wallets from './pages/Wallets/Wallets'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/history"  element={<History />} />
            <Route path="/wallets"  element={<Wallets />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/add" element={
            <div className="flex flex-col h-dvh max-w-md mx-auto bg-app">
              <AddExpense />
            </div>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
