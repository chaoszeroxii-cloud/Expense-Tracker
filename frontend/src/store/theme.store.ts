import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

const stored = (localStorage.getItem('flo_theme') as Theme) || 'light'
// Apply on load
document.documentElement.classList.toggle('dark', stored === 'dark')

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored,

  toggle: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', next === 'dark')
    localStorage.setItem('flo_theme', next)
    set({ theme: next })
  },

  setTheme: (t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem('flo_theme', t)
    set({ theme: t })
  },
}))
