import { create } from 'zustand'

interface AuthUser {
  id: string
  email: string
  name: string
  currency: string
  role: string
  onboardingCompleted: boolean
  hasPassword: boolean
  expectedMonthlyIncome: number | null
  // ── Spending plan ──
  // `null` means no plan set — distinct from a limit of 0.
  trackingMode: 'plan' | 'track_only'
  monthlySpendingLimit: number | null
  timezone: string
  // ── Work-time lens (moved off localStorage so it survives a device change) ──
  workHoursPerDay: number
  workDaysPerMonth: number
  showWorkTime: boolean
  // Reveals envelope wallets, loans, investments and tax.
  advancedMode: boolean
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

const TOKEN_KEY = 'flo_token'
const USER_KEY  = 'flo_user'

// Hydrate from localStorage on load
const storedToken = localStorage.getItem(TOKEN_KEY)
const storedUser  = localStorage.getItem(USER_KEY)

export const useAuthStore = create<AuthState>((set, get) => ({
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,

  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ token, user })
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
  },

  isAuthenticated: () => Boolean(get().token),
}))
