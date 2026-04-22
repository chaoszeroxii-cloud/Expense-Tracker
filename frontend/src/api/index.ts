import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/auth.store'
import type {
  PeriodSummary, CategoryBreakdown, MonthlyTrend,
  Expense, Category, CreateExpensePayload,
} from '../types'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
})

// ── Request interceptor: attach JWT Bearer token ────────────
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: auto-logout on 401 ───────────────
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  register: (payload: { email: string; name: string; password: string }) =>
    http.post('/auth/register', payload).then(r => r.data),

  login: (payload: { email: string; password: string }) =>
    http.post('/auth/login', payload).then(r => r.data),

  me: () => http.get('/auth/me').then(r => r.data),

  updateProfile: (payload: { name: string }) =>
    http.patch('/auth/profile', payload).then(r => r.data),
}

// ── Analytics ────────────────────────────────────────────────
export const analyticsApi = {
  getSummary: (month?: string, year?: string) =>
    http.get<PeriodSummary>('/analytics/summary', { params: { month, year } }).then(r => r.data),

  getCategories: (month?: string, type: 'expense' | 'income' = 'expense') =>
    http.get<CategoryBreakdown[]>('/analytics/categories', { params: { month, type } }).then(r => r.data),

  getMonthlyTrend: () =>
    http.get<MonthlyTrend[]>('/analytics/monthly-trend').then(r => r.data),

  getDaily: (month: string) =>
    http.get('/analytics/daily', { params: { month } }).then(r => r.data),
}

// ── Expenses ─────────────────────────────────────────────────
export const expensesApi = {
  list: (params?: { month?: string; type?: string; categoryId?: string }) =>
    http.get<Expense[]>('/expenses', { params }).then(r => r.data),

  create: (payload: CreateExpensePayload) =>
    http.post<Expense>('/expenses', payload).then(r => r.data),

  update: (id: string, payload: Partial<CreateExpensePayload>) =>
    http.patch<Expense>(`/expenses/${id}`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/expenses/${id}`).then(r => r.data),
}

// ── Categories ───────────────────────────────────────────────
export const categoriesApi = {
  list: () =>
    http.get<Category[]>('/categories').then(r => r.data),

  create: (payload: Pick<Category, 'name' | 'icon' | 'color' | 'type'>) =>
    http.post<Category>('/categories', payload).then(r => r.data),

  update: (id: string, payload: Partial<Pick<Category, 'name' | 'icon' | 'color'>>) =>
    http.patch<Category>(`/categories/${id}`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/categories/${id}`).then(r => r.data),
}

// ── Allocations ───────────────────────────────────────────────
export const allocationsApi = {
  list: () =>
    http.get('/allocations').then(r => r.data),

  create: (payload: { name: string; icon?: string; color?: string; categoryIds?: string[] }) =>
    http.post('/allocations', payload).then(r => r.data),

  update: (id: string, payload: { name?: string; icon?: string; color?: string; categoryIds?: string[] }) =>
    http.patch(`/allocations/${id}`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/allocations/${id}`).then(r => r.data),

  getSummary: () =>
    http.get('/analytics/allocations').then(r => r.data),
}
