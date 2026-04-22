import { create } from 'zustand'

interface AuthUser {
  id: string
  email: string
  name: string
  currency: string
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
