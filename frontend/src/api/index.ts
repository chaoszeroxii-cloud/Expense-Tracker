import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/auth.store'
import type {
  PeriodSummary, CategoryBreakdown, MonthlyTrend,
  Expense, Category, CreateExpensePayload, BalanceSummary,
  BudgetItem, Loan, LoanSummary, Investment, InvestmentTransaction,
  TaxDeduction, TaxCalculationResult, TaxDeductionType,
  EmergencyFundSummary, AdminUser, AdminStats,
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

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  register: (payload: { email: string; name: string; password: string }) =>
    http.post('/auth/register', payload).then(r => r.data),

  login: (payload: { email: string; password: string }) =>
    http.post('/auth/login', payload).then(r => r.data),

  me: () => http.get('/auth/me').then(r => r.data),

  updateProfile: (payload: { name: string }) =>
    http.patch('/auth/profile', payload).then(r => r.data),

  getOnboardingWallets: () =>
    http.get('/auth/onboarding/wallets').then(r => r.data),

  completeOnboarding: (wallets: string[]) =>
    http.post('/auth/onboarding', { wallets }).then(r => r.data),
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
  // GET /api/analytics/balance — totalBalance, allocatedBalance, unallocatedBalance
  getBalanceSummary: () =>
    http.get<BalanceSummary>('/analytics/balance').then(r => r.data),

  getEmergencyFund: (months = 6) =>
    http.get<EmergencyFundSummary>('/analytics/emergency-fund', { params: { months } }).then(r => r.data),
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

  create: (payload: { name: string; icon?: string; color?: string; categoryIds?: string[]; incomeCategoryIds?: string[] }) =>
    http.post('/allocations', payload).then(r => r.data),

  update: (id: string, payload: { name?: string; icon?: string; color?: string; categoryIds?: string[]; incomeCategoryIds?: string[] }) =>
    http.patch(`/allocations/${id}`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/allocations/${id}`).then(r => r.data),

  getSummary: () =>
    http.get('/analytics/allocations').then(r => r.data),
  // POST /api/allocations/:id/move — move amount from unallocated into a wallet
  moveToAllocation: (id: string, amount: number) =>
    http.post(`/allocations/${id}/move`, { amount }).then(r => r.data),

  // POST /api/allocations/:id/transfer — move funds from one wallet to another
  transfer: (id: string, targetAllocationId: string, amount: number) =>
    http.post(`/allocations/${id}/transfer`, { targetAllocationId, amount }).then(r => r.data),

  // POST /api/allocations/:id/unallocate — return wallet funds to unallocated pool
  unallocate: (id: string, amount: number) =>
    http.post(`/allocations/${id}/unallocate`, { amount }).then(r => r.data),
}

// ── Budgets ───────────────────────────────────────────────────
export const budgetsApi = {
  getWithActual: (month?: string) =>
    http.get<BudgetItem[]>('/budgets', { params: { month } }).then(r => r.data),

  upsert: (payload: { categoryId: string; amount: number; month: string }) =>
    http.post('/budgets', payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/budgets/${id}`).then(r => r.data),
}

// ── Loans ─────────────────────────────────────────────────────
export const loansApi = {
  findAll: () =>
    http.get<Loan[]>('/loans').then(r => r.data),

  getSummary: () =>
    http.get<LoanSummary>('/loans/summary').then(r => r.data),

  create: (payload: { borrower: string; amount: number; note?: string; lentAt: string; dueDate?: string }) =>
    http.post<Loan>('/loans', payload).then(r => r.data),

  addPayment: (id: string, payload: { amount: number; paidAt: string; note?: string }) =>
    http.post<Loan>(`/loans/${id}/payments`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/loans/${id}`).then(r => r.data),
}

// ── Investments ───────────────────────────────────────────────
export const investmentsApi = {
  findAll: () =>
    http.get<Investment[]>('/investments').then(r => r.data),

  create: (payload: { name: string; symbol?: string; type: string; note?: string }) =>
    http.post<Investment>('/investments', payload).then(r => r.data),

  addTransaction: (id: string, payload: {
    type: string; amount: number; units?: number; navPrice?: number; occurredAt: string; note?: string
  }) =>
    http.post<InvestmentTransaction>(`/investments/${id}/transactions`, payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/investments/${id}`).then(r => r.data),
}

// ── Tax ───────────────────────────────────────────────────────
export const taxApi = {
  getTypes: () =>
    http.get<TaxDeductionType[]>('/tax/types').then(r => r.data),

  findByYear: (year: number) =>
    http.get<TaxDeduction[]>('/tax/deductions', { params: { year } }).then(r => r.data),

  upsert: (payload: { taxYear: number; type: string; name: string; amount: number; maxAmount?: number; note?: string }) =>
    http.post<TaxDeduction>('/tax/deductions', payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/tax/deductions/${id}`).then(r => r.data),

  calculate: (income: number, year: number) =>
    http.get<TaxCalculationResult>('/tax/calculate', { params: { income, year } }).then(r => r.data),
}

// ── Admin ─────────────────────────────────────────────────────
export const adminApi = {
  getStats: () =>
    http.get<AdminStats>('/admin/stats').then(r => r.data),

  getUsers: () =>
    http.get<AdminUser[]>('/admin/users').then(r => r.data),

  getUser: (id: string) =>
    http.get<AdminUser>(`/admin/users/${id}`).then(r => r.data),

  setRole: (id: string, role: 'user' | 'admin') =>
    http.patch(`/admin/users/${id}/role`, { role }).then(r => r.data),

  deleteUser: (id: string) =>
    http.delete(`/admin/users/${id}`).then(r => r.data),
}
