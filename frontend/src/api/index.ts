import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/auth.store'
import type {
  PeriodSummary, CategoryBreakdown, MonthlyTrend,
  Expense, Category, CreateExpensePayload, BalanceSummary,
  BudgetItem, Loan, LoanSummary, Investment, InvestmentTransaction,
  TaxDeduction, TaxCalculationResult, TaxDeductionType,
  EmergencyFundSummary, AdminUser, AdminStats, AiRecommendation,
  AllocationPlanPreview, DailyBrief, UpdatePreferencesPayload,
  CompleteOnboardingPayload, Coverage, WeeklyReview, BudgetSuggestion,
  SpendingPlanView,
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
  // `lang` decides which language the starter categories are seeded in — they are
  // user data from then on, so it cannot be corrected by switching the UI later.
  register: (payload: { email: string; name: string; password: string; lang?: 'th' | 'en' }) =>
    http.post('/auth/register', payload).then(r => r.data),

  login: (payload: { email: string; password: string }) =>
    http.post('/auth/login', payload).then(r => r.data),

  me: () => http.get('/auth/me').then(r => r.data),

  updateProfile: (payload: { name: string; expectedMonthlyIncome?: number }) =>
    http.patch('/auth/profile', payload).then(r => r.data),

  updatePreferences: (payload: UpdatePreferencesPayload) =>
    http.patch('/auth/preferences', payload).then(r => r.data),

  getOnboardingWallets: () =>
    http.get('/auth/onboarding/wallets').then(r => r.data),

  // Sets the spending plan only. Envelope wallets are no longer created here —
  // see createStarterWallets, which is an explicit opt-in from advanced mode.
  completeOnboarding: (payload: CompleteOnboardingPayload) =>
    http.post('/auth/onboarding', payload).then(r => r.data),

  createStarterWallets: (wallets: string[], lang: 'th' | 'en' = 'th') =>
    http.post('/auth/starter-wallets', { wallets, lang }).then(r => r.data),

  googleVerify: (token: string, email?: string, lang?: 'th' | 'en') =>
    http.post('/auth/google/verify', { token, ...(email ? { email } : {}), ...(lang ? { lang } : {}) }).then(r => r.data),

  facebookVerify: (accessToken: string, email?: string, lang?: 'th' | 'en') =>
    http.post('/auth/facebook/verify', { accessToken, ...(email ? { email } : {}), ...(lang ? { lang } : {}) }).then(r => r.data),
  changePassword: (payload: { currentPassword?: string; newPassword: string }) =>
    http.patch('/auth/change-password', payload).then(r => r.data),

  forgotPassword: (email: string) =>
    http.post('/auth/forgot-password', { email }).then(r => r.data),

  resetPassword: (token: string, password: string) =>
    http.post('/auth/reset-password', { token, password }).then(r => r.data),
}

// ── Analytics ────────────────────────────────────────────────
export const analyticsApi = {
  // Everything the home screen needs above the fold, in one request.
  getDailyBrief: () =>
    http.get<DailyBrief>('/analytics/daily-brief').then(r => r.data),

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

  getRecommendations: () =>
    http.get<AiRecommendation[]>('/analytics/recommendations').then(r => r.data),

  // Deterministic SQL, no model call — fast, free and explainable.
  getWeeklyReview: () =>
    http.get<WeeklyReview>('/analytics/weekly-review').then(r => r.data),
}

// ── Check-ins ────────────────────────────────────────────────
export const checkInsApi = {
  /** Declares a day as no-spend. Idempotent; only today or yesterday are accepted. */
  markNoSpend: (date: string) =>
    http.put<Coverage>(`/check-ins/${date}`).then(r => r.data),

  undo: (date: string) =>
    http.delete<Coverage>(`/check-ins/${date}`).then(r => r.data),
}

// ── Expenses ─────────────────────────────────────────────────
export const expensesApi = {
  list: (params?: { month?: string; from?: string; to?: string; type?: string; categoryId?: string }) =>
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

  // GET — this month's targets, inherited from the last month that had them,
  // alongside what has already been funded.
  previewPlan: () =>
    http.get<AllocationPlanPreview>('/allocations/plans/preview').then(r => r.data),

  /**
   * PUT — record intent only.
   *
   * Moves no money and is never blocked by an empty pool, which is the whole point:
   * the previous flow could only persist a plan as a side effect of a successful
   * transfer, so anyone sitting at ฿0 unallocated could never save one.
   */
  saveTargets: (month: string, items: { allocationId: string; targetAmount: number }[]) =>
    http.put<{ saved: number }>('/allocations/plans', { month, items }).then(r => r.data),

  // POST — move real money. Leaves the saved targets untouched.
  applyPlan: (amounts: { allocationId: string; amount: number }[]) =>
    http.post('/allocations/plans/apply', { amounts }).then(r => r.data),
}

// ── Budgets ───────────────────────────────────────────────────
export const budgetsApi = {
  getWithActual: (month?: string) =>
    http.get<BudgetItem[]>('/budgets', { params: { month } }).then(r => r.data),

  upsert: (payload: { categoryId: string; amount: number; month: string }) =>
    http.post('/budgets', payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/budgets/${id}`).then(r => r.data),

  /**
   * The whole Plan screen for one month: the total (inherited when this month has none
   * of its own) plus the optional per-category breakdown.
   */
  getPlan: (month?: string) =>
    http.get<SpendingPlanView>('/budgets/plan', { params: { month } }).then(r => r.data),

  /** `totalAmount: null` clears the plan for that month. 0 is refused. */
  setPlanTotal: (month: string, totalAmount: number | null) =>
    http.put('/budgets/plan', { month, totalAmount }).then(r => r.data),

  /** What to prefill a new month with: last month's figures, else actual spend. */
  getSuggestions: (month?: string) =>
    http.get<BudgetSuggestion[]>('/budgets/suggestions', { params: { month } }).then(r => r.data),

  copyPrevious: (month: string) =>
    http.post<{ copied: number; skipped: number }>('/budgets/copy-previous', { month }).then(r => r.data),

  /** Saves a whole month at once. An amount of 0 removes that category's budget. */
  saveBatch: (month: string, items: { categoryId: string; amount: number }[]) =>
    http.put<{ saved: number; removed: number }>('/budgets/batch', { month, items }).then(r => r.data),
}

// ── Account (destructive) ─────────────────────────────────────
// Every call here is irreversible. The confirmation phrase is re-checked server-side —
// a guard that only exists in the browser is not a guard.
export const accountApi = {
  resetPreview: (from?: string, to?: string) =>
    http.get<{ count: number; expenseTotal: number; firstMonth: string | null; lastMonth: string | null }>(
      '/account/reset-preview', { params: { from, to } },
    ).then(r => r.data),

  /** Omit the range to clear the whole ledger. Balances are rebuilt from what remains. */
  resetTransactions: (confirm: string, range: { from?: string; to?: string }) =>
    http.post<{ deletedTransactions: number; from: string | null; to: string | null }>(
      '/account/reset-transactions', { confirm, ...range },
    ).then(r => r.data),

  /** Wipes everything the user created; the login survives. `confirm` is their email. */
  factoryReset: (confirm: string, lang: 'th' | 'en' = 'th') =>
    http.post<{ ok: true }>('/account/factory-reset', { confirm, lang }).then(r => r.data),
}

// ── Loans ─────────────────────────────────────────────────────
export const loansApi = {
  findAll: () =>
    http.get<Loan[]>('/loans').then(r => r.data),

  getSummary: () =>
    http.get<LoanSummary>('/loans/summary').then(r => r.data),

  create: (payload: { direction: 'lent' | 'borrowed'; borrower: string; amount: number; note?: string; lentAt: string; dueDate?: string }) =>
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

  removeTransaction: (txId: string) =>
    http.delete(`/investments/transactions/${txId}`).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/investments/${id}`).then(r => r.data),
}

// ── Tax ───────────────────────────────────────────────────────
export const taxApi = {
  getTypes: (lang = 'th') =>
    http.get<TaxDeductionType[]>('/tax/types', { params: { lang } }).then(r => r.data),

  findByYear: (year: number) =>
    http.get<TaxDeduction[]>('/tax/deductions', { params: { year } }).then(r => r.data),

  upsert: (payload: { taxYear: number; type: string; name: string; amount: number; maxAmount?: number; note?: string }) =>
    http.post<TaxDeduction>('/tax/deductions', payload).then(r => r.data),

  remove: (id: string) =>
    http.delete(`/tax/deductions/${id}`).then(r => r.data),

  calculate: (income: number, year: number, lang = 'th') =>
    http.get<TaxCalculationResult>('/tax/calculate', { params: { income, year, lang } }).then(r => r.data),
}

// ── Chat ─────────────────────────────────────────────────────
const chatBase = () =>
  import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'

export const chatApi = {
  sendMessage: (message: string, context?: Record<string, any>) =>
    http.post<{ message: string }>('/chat', { message, context }).then(r => r.data),

  sendMessageStream: (
    message: string,
    context?: Record<string, any>,
    imageBase64?: string,
    mimeType?: string,
    imageThumbnail?: string,
  ): Promise<Response> => {
    const token = useAuthStore.getState().token
    return fetch(`${chatBase()}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, context, imageBase64, mimeType, imageThumbnail }),
    })
  },

  getHistory: () =>
    http.get('/chat/history').then(r => r.data),

  clearHistory: () =>
    http.delete('/chat/history').then(r => r.data),

  getTavilyStatus: () =>
    http.get('/chat/tavily-status').then(r => r.data),
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

  getAiUsage: () =>
    http.get('/admin/ai-usage').then(r => r.data),
}
