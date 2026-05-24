import { useState, useEffect, useCallback } from 'react'
import { analyticsApi, expensesApi, categoriesApi, allocationsApi, budgetsApi, loansApi } from '../api'
import type {
  PeriodSummary, CategoryBreakdown, MonthlyTrend,
  Category, Expense, Allocation, AllocationSummary, BalanceSummary,
  BudgetItem, LoanSummary, EmergencyFundSummary,
} from '../types'

// Current month helper — returns "YYYY-MM"
export const currentMonth = () => new Date().toISOString().slice(0, 7)

// ── Generic fetcher hook ───────────────────────────────────────
function useFetch<T>(fetchFn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData]       = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchFn())
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ── Domain hooks ──────────────────────────────────────────────
export function useSummary(month: string) {
  return useFetch<PeriodSummary>(() => analyticsApi.getSummary(month), [month])
}

export function useCategoryBreakdown(month: string, type: 'expense' | 'income' = 'expense') {
  return useFetch<CategoryBreakdown[]>(
    () => analyticsApi.getCategories(month, type), [month, type],
  )
}

export function useMonthlyTrend() {
  return useFetch<MonthlyTrend[]>(() => analyticsApi.getMonthlyTrend())
}

export function useCategories() {
  return useFetch<Category[]>(() => categoriesApi.list())
}

export function useExpenses(month: string) {
  return useFetch<Expense[]>(() => expensesApi.list({ month }), [month])
}

export function useAllocations() {
  return useFetch<Allocation[]>(() => allocationsApi.list())
}

export function useAllocationSummary() {
  return useFetch(() => allocationsApi.getSummary())
}

// ── Balance summary: total / allocated / unallocated ─────────
export function useBalanceSummary() {
  return useFetch<BalanceSummary>(() => analyticsApi.getBalanceSummary())
}

export function useBudgetSummary(month: string) {
  return useFetch<BudgetItem[]>(() => budgetsApi.getWithActual(month), [month])
}

export function useLoanSummary() {
  return useFetch<LoanSummary>(() => loansApi.getSummary())
}

export function useEmergencyFund(months = 6) {
  return useFetch<EmergencyFundSummary>(() => analyticsApi.getEmergencyFund(months), [months])
}