import { useState, useEffect, useCallback, useRef, type SetStateAction } from 'react'
import { analyticsApi, expensesApi, categoriesApi, allocationsApi, budgetsApi, loansApi, planningApi } from '../api'
import { apiErrorMessage } from '../utils/apiError'
import { useAuthStore } from '../store/auth.store'
import type {
  PeriodSummary, CategoryBreakdown, MonthlyTrend,
  Category, Expense, Allocation, AllocationSummary, BalanceSummary,
  BudgetItem, LoanSummary, EmergencyFundSummary, AiRecommendation,
  AllocationPlanPreview, DailyBrief, DailySummary, WeeklyReview, BudgetSuggestion,
} from '../types'

// Current month helper — returns "YYYY-MM" from the *local* calendar.
// (A UTC-derived month reports the previous one before 07:00 in Asia/Bangkok.)
export { currentMonthLocal as currentMonth } from '../utils/localDate'

// ── Generic fetcher hook ───────────────────────────────────────
/**
 * Two things this has to get right beyond fetching.
 *
 * **Only the newest request may write state.** Flicking through months fires a request
 * per month, and they do not come back in order — a slow January arriving after a fast
 * February overwrote February's data with January's, on a screen still labelled February.
 * Each run takes a sequence number and a later one invalidates every earlier one.
 *
 * **The error has to be the server's.** This used to surface `e.message`, which for an
 * Axios rejection is "Request failed with status code 400" — so a perfectly clear message
 * from the API ("Category X is an income category…") was replaced with a status code the
 * user can do nothing with. `apiErrorMessage` already existed for this and was only
 * being used on the write paths.
 */
export function useFetch<T>(fetchFn: () => Promise<T>, deps: unknown[] = []) {
  const userId = useAuthStore(s => s.user?.id)
  const timezone = useAuthStore(s => s.user?.timezone)
  // Scope retained data to this exact query/account. A new month must never show
  // the preceding month's figures, even for the render before the effect runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useCallback(fetchFn, [userId, timezone, ...deps])
  const [state, setState] = useState<{
    query: typeof query; data: T | null; fetching: boolean; error: string | null
  }>({ query, data: null, fetching: true, error: null })
  const current = state.query === query ? state : null

  const runIdRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetch = useCallback(async () => {
    const runId = ++runIdRef.current
    setState(previous => ({ query, data: previous.query === query ? previous.data : null, fetching: true, error: null }))
    try {
      const result = await query()
      if (runId !== runIdRef.current || !mountedRef.current) return
      setState({ query, data: result, fetching: false, error: null })
    } catch (e: unknown) {
      if (runId !== runIdRef.current || !mountedRef.current) return
      setState(previous => ({ ...previous, fetching: false, error: apiErrorMessage(e, 'Something went wrong') }))
    }
  }, [query])

  useEffect(() => { fetch() }, [fetch])

  // `setData` lets a caller apply a server response it already has in hand — marking a
  // no-spend day returns the new coverage — instead of refetching the whole payload.
  const setData = useCallback((value: SetStateAction<T | null>) => {
    setState(previous => previous.query !== query ? previous : {
      ...previous,
      data: typeof value === 'function' ? (value as (data: T | null) => T | null)(previous.data) : value,
    })
  }, [query])
  return {
    data: current?.data ?? null,
    loading: !current || (current.fetching && current.data === null),
    refreshing: !!current?.fetching && current.data !== null,
    error: current?.error ?? null,
    refetch: fetch,
    setData,
  }
}

// ── Domain hooks ──────────────────────────────────────────────
export const usePlanning = () => useFetch(planningApi.overview)

/**
 * The home screen's single above-the-fold request.
 *
 * Replaces the seven hooks Dashboard used to mount (plus three from the wallet widget
 * and one plan preview) before it could display anything.
 */
export function useDailyBrief() {
  return useFetch<DailyBrief>(() => analyticsApi.getDailyBrief())
}

/** Deterministic weekly summary — SQL only, no model call. */
export function useWeeklyReview() {
  return useFetch<WeeklyReview>(() => analyticsApi.getWeeklyReview())
}

export function useBudgetSuggestions(month: string) {
  return useFetch<BudgetSuggestion[]>(() => budgetsApi.getSuggestions(month), [month])
}

export function useSummary(month: string) {
  return useFetch<PeriodSummary>(() => analyticsApi.getSummary(month), [month])
}

/** Per-day totals inside one month. Sparse — see DailySummary. */
export function useDailyBreakdown(month: string) {
  return useFetch<DailySummary[]>(() => analyticsApi.getDaily(month), [month])
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

export function useAllocationPlanPreview() {
  return useFetch<AllocationPlanPreview>(() => allocationsApi.previewPlan())
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

export function useRecommendations() {
  return useFetch<AiRecommendation[]>(() => analyticsApi.getRecommendations())
}

/**
 * On-demand variant of {@link useRecommendations}.
 *
 * The recommendations endpoint runs four aggregate queries and then calls an external LLM
 * with a 20s timeout. Firing that on Home mount charged every app open for an analysis
 * nobody had asked to see — and shipped a summary of the user's finances to a third party
 * without an explicit action. Nothing is requested until `run()` is called.
 */
export function useRecommendationsOnDemand() {
  const [data, setData]       = useState<AiRecommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await analyticsApi.getRecommendations())
    } catch (e: unknown) {
      setError(apiErrorMessage(e, 'Something went wrong'))
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, run, hasRun: data !== null || error !== null }
}
