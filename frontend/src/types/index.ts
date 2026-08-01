export type EntryType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: EntryType
  isDefault: boolean
}

export interface Expense {
  id: string
  categoryId: string
  category: Category
  allocation: Allocation
  amount: number
  type: EntryType
  note?: string
  tags: string[]
  occurredAt: string
  createdAt: string
}

export interface PeriodSummary {
  totalExpense: number
  totalIncome: number
  net: number
  transactionCount: number
  avgPerDay: number
}

export interface CategoryBreakdown {
  categoryId: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  total: number
  count: number
  percentage: number
}

export interface MonthlyTrend {
  month: string
  label: string
  expense: number
  income: number
  net: number
}

/**
 * One day inside a month. The API returns only days that actually have transactions,
 * so a caller plotting a continuous axis has to fill the gaps itself.
 */
export interface DailySummary {
  date: string
  expense: number
  income: number
  net: number
}

export interface CreateExpensePayload {
  categoryId: string
  amount: number
  type: EntryType
  note?: string
  tags?: string[]
  occurredAt: string
  allocationId?: string
}

export interface Allocation {
  id: string
  name: string
  icon: string
  color: string
  balance: number
  categories: Category[]
  incomeCategories: Category[]
}

export interface AllocationSummary {
  allocationId: string
  spentThisMonth: number
  fundedThisMonth: number
}

// Allocation plan types live with the wallet funding template further down.

// ── Balance Summary ───────────────────────────────────────────
// totalBalance      = user.totalBalance  (net of all transactions ever)
// allocatedBalance  = sum of all wallet balances
// unallocatedBalance = totalBalance - allocatedBalance  (free to distribute)
export interface BalanceSummary {
  totalBalance: number
  /** Net of deficits — `positiveWalletBalance − walletDeficit`. */
  allocatedBalance: number
  unallocatedBalance: number
  /** Sum of wallets in credit. Reported separately so a summary cannot claim
   *  "100% allocated" while positive wallets quietly cover negative ones. */
  positiveWalletBalance: number
  /** Sum of the shortfalls, as a positive number. */
  walletDeficit: number
  negativeWalletCount: number
}

// ── Spending plan (month-scoped) ──────────────────────────────
export type PlanSource = 'explicit' | 'inherited' | 'empty'

export interface SpendingPlanView {
  month: string
  state: PlanSource
  /** Which month the figure came from when `state` is `inherited`. */
  sourceMonth: string | null
  totalAmount: number | null
  /** Every expense in the month, so this matches what Home reports. */
  totalActual: number
  categoryTargets: {
    categoryId: string
    categoryName: string
    categoryIcon: string | null
    categoryColor: string | null
    amount: number
    actual: number
  }[]
  targetedTotal: number
  flexibleAmount: number | null
}

// ── Wallet funding template ───────────────────────────────────
// Targets are intent and can always be saved; moving money is a separate action that
// can fail for lack of funds.
export interface AllocationTargetItem {
  allocationId: string
  name: string
  icon: string
  color: string
  balance: number
  targetAmount: number
  fundedThisMonth: number
  remainingToFund: number
  /** @deprecated use `targetAmount` */
  planAmount: number
  /** @deprecated use `remainingToFund` */
  suggested: number
}

export interface AllocationPlanPreview {
  month: string
  state: PlanSource
  sourceMonth: string | null
  unallocatedBalance: number
  items: AllocationTargetItem[]
  totalTarget: number
  totalRemainingToFund: number
}

// ── Budget ────────────────────────────────────────────────────
export interface BudgetItem {
  id: string
  categoryId: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  month: string
  budgeted: number
  actual: number
  remaining: number
}

// ── Loans ─────────────────────────────────────────────────────
export interface LoanPayment {
  id: string
  loanId: string
  amount: number
  paidAt: string
  note?: string
  createdAt: string
}

export interface Loan {
  id: string
  direction: 'lent' | 'borrowed'
  borrower: string
  amount: number
  paidAmount: number
  outstanding: number
  note?: string
  lentAt: string
  dueDate?: string
  status: 'active' | 'settled'
  payments: LoanPayment[]
}

export interface LoanSummary {
  activeLoans: number
  totalOutstanding: number
  totalOwed: number
  loans: Loan[]
}

// ── Investments ───────────────────────────────────────────────
export type InvestmentType = 'mutual_fund' | 'stock_th' | 'stock_us' | 'crypto' | 'gold' | 'other'

export interface InvestmentTransaction {
  id: string
  investmentId: string
  type: 'buy' | 'sell' | 'dividend'
  amount: number
  units?: number
  navPrice?: number
  occurredAt: string
  note?: string
  createdAt: string
}

export interface Investment {
  id: string
  name: string
  symbol?: string
  type: InvestmentType
  note?: string
  totalCost: number
  totalSold: number
  netCost: number
  totalUnits: number
  transactions: InvestmentTransaction[]
  createdAt: string
}

// ── Tax ───────────────────────────────────────────────────────
export interface TaxDeduction {
  id: string
  taxYear: number
  type: string
  name: string
  amount: number
  maxAmount?: number
  note?: string
}

export interface TaxCalculationResult {
  annualIncome: number
  employmentDeduction: number
  totalDeductions: number
  netIncome: number
  tax: number
  effectiveRate: number
  deductions: TaxDeduction[]
  optimizations: {
    type: string
    name: string
    maxAmount: number
    estimatedTaxSaving: number
    description: string
  }[]
}

export interface TaxDeductionType {
  type: string
  name: string
  max: number
  description: string
}

// ── Emergency Fund ────────────────────────────────────────────
export interface EmergencyFundSummary {
  avgMonthlyExpense: number
  targetMonths: number
  suggestedTarget: number
  currentAmount: number
  progress: number
  remaining: number
  walletId: string | null
  walletName: string | null
}

// ── Daily Brief ───────────────────────────────────────────────
// The single payload behind the home screen. Replaces the eleven requests the
// dashboard used to fire before it could render anything.
//
// `monthlyLimit` and `safeToday` are `null` when no plan is set — never 0, which
// would read as "you may not spend anything today".
export type PlanStatus = 'no_plan' | 'on_track' | 'close' | 'over'
export type TrackingMode = 'plan' | 'track_only'

export interface DailyBriefTransaction {
  id: string
  amount: number
  type: EntryType
  note: string | null
  occurredAt: string
  categoryId: string | null
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
}

// ── Seven-day coverage ────────────────────────────────────────
// Deliberately not a streak. A day with no spending is good behaviour, so a mechanic
// that resets to zero for it would punish the outcome the app exists to encourage.
// Missing a day costs one square out of seven; the count never resets.
export interface CoverageDay {
  date: string
  covered: boolean
  source: 'transaction' | 'no_spend' | null
  isToday: boolean
}

export interface Coverage {
  /** Oldest first, seven entries ending today. */
  days: CoverageDay[]
  covered: number
  total: number
  canMarkToday: boolean
  /** One day of grace — forgetting yesterday should not be unrecoverable. */
  canMarkYesterday: boolean
}

// ── Weekly review ─────────────────────────────────────────────
export type WeeklyAction =
  | { kind: 'reduce_category'; categoryName: string; amount: number }
  | { kind: 'spending_down'; amount: number }
  | { kind: 'over_plan'; amount: number }
  | { kind: 'set_plan' }
  | { kind: 'need_more_data' }
  | null

export interface WeeklyReview {
  timezone: string
  from: string
  to: string
  thisWeek: number
  lastWeek: number
  /** Negative means spending came down. */
  delta: number
  deltaPct: number | null
  topCategory: { name: string; icon: string | null; color: string | null; total: number; share: number } | null
  biggestDay: { date: string; total: number } | null
  dailyAverage: number
  /** Exactly one suggestion — a review ending in five is one nobody acts on. */
  action: WeeklyAction
}

// ── Budget rollover ───────────────────────────────────────────
export interface BudgetSuggestion {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  previousAmount: number | null
  averageActual: number
  suggested: number
}

export interface DailyBrief {
  date: string
  timezone: string
  mode: TrackingMode
  spentToday: number
  monthSpent: number
  monthlyLimit: number | null
  /** A *planned* allowance, never a real cash balance. Label it as such in the UI. */
  safeToday: number | null
  daysRemaining: number
  planStatus: PlanStatus
  transactionsToday: number
  recentCategoryIds: string[]
  recentTransactions: DailyBriefTransaction[]
  hourlyRate: number | null
  showWorkTime: boolean
  /** Folded into this payload so Home stays a single request. */
  coverage: Coverage
}

// ── Preferences ───────────────────────────────────────────────
export interface UpdatePreferencesPayload {
  trackingMode?: TrackingMode
  /** `null` clears the plan; omit the key to leave it untouched. */
  monthlySpendingLimit?: number | null
  timezone?: string
  workHoursPerDay?: number
  workDaysPerMonth?: number
  showWorkTime?: boolean
  advancedMode?: boolean
  expectedMonthlyIncome?: number
  /** `HH:MM` in the user's own timezone. */
  remindAt?: string
}

export interface CompleteOnboardingPayload {
  trackingMode: TrackingMode
  monthlySpendingLimit?: number
  timezone?: string
  lang?: 'th' | 'en'
}

// ── AI Recommendations ────────────────────────────────────────
export interface AiRecommendation {
  type: 'warning' | 'tip' | 'good'
  title: string
  body: string
}

// ── Chat ──────────────────────────────────────────────────────
export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  imageAnalysis?: { thumbnail?: string; [key: string]: any } | null
}

// ── Admin ─────────────────────────────────────────────────────
export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  onboardingCompleted: boolean
  currency: string
  totalBalance: number
  transactionCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminStats {
  totalUsers: number
  adminUsers: number
  newThisMonth: number
}

export interface AiUsageUser {
  userId: string
  email: string
  name: string
  callCount: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCostUsd: number
  totalCostThb: number
}

export interface AiUsageStats {
  users: AiUsageUser[]
  totalCostUsd: number
  totalCostThb: number
}