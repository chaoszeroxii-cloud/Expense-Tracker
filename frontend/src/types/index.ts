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
  receivedThisMonth: number
}

// ── Balance Summary ───────────────────────────────────────────
// totalBalance      = user.totalBalance  (net of all transactions ever)
// allocatedBalance  = sum of all wallet balances
// unallocatedBalance = totalBalance - allocatedBalance  (free to distribute)
export interface BalanceSummary {
  totalBalance: number
  allocatedBalance: number
  unallocatedBalance: number
}