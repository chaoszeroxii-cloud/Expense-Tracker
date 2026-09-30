import type { Expense } from './index'
export interface PinnedEntry {
  id: string
  name: string
  amount: number
  categoryId: string
  type: 'income' | 'expense'
  note: string
}
export interface CaptureRow {
  clientKey: string
  categoryId: string
  amount: number
  type: 'income' | 'expense'
  note: string
  date: string
  allowDuplicate?: boolean
}
export interface BatchPreview {
  committed: boolean
  rows: { clientKey: string; duplicate: boolean; alreadySaved: boolean; expenseId: string | null }[]
}
export interface ExpensePage {
  items: Expense[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
export interface PayCycle {
  enabled: boolean
  payDay: number
  budget: number | null
  period: null | {
    start: string
    end: string
    nextPayday: string
    spent: number
    unpaidBills: number
    unpaidBillCount: number
    nextBill: { name: string; amount: number; dueDate: string } | null
    safeToday: number
    daysRemaining: number
  }
}
export interface BillReminders {
  preferences: { enabled: boolean; daysBefore: number }
  today: string
  bills: {
    id: string
    month: string
    name: string
    amount: number
    dueDate: string
    snoozedUntil: string | null
  }[]
}
