/**
 * Calendar arithmetic in a user's own timezone.
 *
 * "Today" and "this month" are user-facing concepts, so they must follow the user's
 * clock. Deriving them from UTC reports yesterday until 07:00 in Asia/Bangkok, and the
 * previous month on the 1st.
 */

/** An IANA zone Intl cannot resolve throws; fall back rather than fail the request. */
export function safeTimezone(tz: string | null | undefined): string {
  const candidate = tz || 'Asia/Bangkok'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate })
    return candidate
  } catch {
    return 'Asia/Bangkok'
  }
}

/** `YYYY-MM-DD` for "now" in the given zone. `en-CA` formats as ISO. */
export function localToday(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

/**
 * Shift a `YYYY-MM-DD` by whole days.
 *
 * Uses UTC internally so the arithmetic cannot be knocked sideways by the *server's*
 * timezone or by a daylight-saving transition — the input is already a plain calendar
 * date with no zone attached.
 */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Days in the calendar month containing `date`. */
export function daysInMonthOf(date: string): number {
  const [y, m] = date.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** `YYYY-MM`. Anything else is rejected rather than reaching a query. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * A month filter that respects the user's calendar *and* can use an index.
 *
 * Both properties were missing. `TO_CHAR(occurred_at, 'YYYY-MM') = $1` formats in the
 * *server's* zone, so for a UTC container every transaction a Bangkok user records
 * between 00:00 and 07:00 was filed under the previous day — and the last seven hours of
 * every month leaked into the month before. Home used `AT TIME ZONE` and got it right;
 * History, the charts and the chat tools did not, so the same month showed two different
 * totals depending on which screen you asked.
 *
 * Wrapping the column in a function also made the predicate non-sargable:
 * `idx_expenses_user_occurred` could narrow to the user but then had to compute TO_CHAR
 * for every one of their rows. A half-open range against the bare column uses the index.
 *
 * Placeholders are passed in so this serves both raw `$n` queries and TypeORM's `:name`.
 *
 * @param column      qualified column, e.g. `e.occurred_at`
 * @param monthParam  placeholder holding `YYYY-MM`, e.g. `$2` or `:month`
 * @param tzParam     placeholder holding the IANA zone, e.g. `$3` or `:tz`
 */
export function monthRangePredicate(column: string, monthParam: string, tzParam: string): string {
  const start = `((${monthParam} || '-01')::date)`
  return (
    `${column} >= (${start}::timestamp AT TIME ZONE ${tzParam})` +
    ` AND ${column} < ((${start} + INTERVAL '1 month')::timestamp AT TIME ZONE ${tzParam})`
  )
}

/** Same, for a whole calendar year given as `YYYY`. */
export function yearRangePredicate(column: string, yearParam: string, tzParam: string): string {
  const start = `((${yearParam} || '-01-01')::date)`
  return (
    `${column} >= (${start}::timestamp AT TIME ZONE ${tzParam})` +
    ` AND ${column} < ((${start} + INTERVAL '1 year')::timestamp AT TIME ZONE ${tzParam})`
  )
}

/** Inclusive `YYYY-MM`..`YYYY-MM` range, in the user's zone. */
export function monthSpanPredicate(
  column: string, fromParam: string, toParam: string, tzParam: string,
): string {
  const from = `((${fromParam} || '-01')::date)`
  const to   = `((${toParam} || '-01')::date)`
  return (
    `${column} >= (${from}::timestamp AT TIME ZONE ${tzParam})` +
    ` AND ${column} < ((${to} + INTERVAL '1 month')::timestamp AT TIME ZONE ${tzParam})`
  )
}

/** The local calendar day of a timestamptz column, for GROUP BY / comparison. */
export function localDayExpr(column: string, tzParam: string): string {
  return `(${column} AT TIME ZONE ${tzParam})::date`
}

/** `YYYY-MM` for "now" in the given zone. */
export function localMonth(tz: string, at: Date = new Date()): string {
  return localToday(tz, at).slice(0, 7)
}

/** Shift a `YYYY-MM` by whole months. */
export function shiftMonth(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
