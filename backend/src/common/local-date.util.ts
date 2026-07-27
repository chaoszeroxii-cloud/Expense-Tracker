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
