/**
 * Local-calendar date helpers.
 *
 * `new Date().toISOString()` is UTC. For a user in Asia/Bangkok (UTC+7) that means
 * between 00:00 and 06:59 local time the app reports *yesterday* — and on the 1st of
 * a month, the *previous month*. Every "today" and "this month" in the app must come
 * from the local clock instead.
 *
 * Never use `toISOString().slice(0, 10)` or `.slice(0, 7)` for user-facing dates.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as `YYYY-MM-DD`. */
export function todayLocal(): string {
  return toDateInput(new Date())
}

/** Local calendar month as `YYYY-MM`. */
export function currentMonthLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** A `Date` → `YYYY-MM-DD` using local calendar fields. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Shift a `YYYY-MM` string by whole months. */
export function monthOffset(base: string, offset: number): string {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** `YYYY-MM` of a stored timestamp, in the viewer's local calendar. */
export function monthOfTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** A stored timestamp → `YYYY-MM-DD` for a `<input type="date">`, in local time. */
export function timestampToDateInput(iso: string): string {
  return toDateInput(new Date(iso))
}

/**
 * A `YYYY-MM-DD` from a date input → an ISO timestamp to persist.
 *
 * Anchored at **local noon**, not local midnight. The backend still groups months with
 * `TO_CHAR(occurred_at, 'YYYY-MM')` in the database session's timezone (usually UTC), so a
 * midnight anchor would land on the previous UTC day for any positive offset and silently
 * file the 1st of the month under the month before. Noon keeps the UTC calendar day equal
 * to the local one for every real-world offset in ±11h, which covers Asia/Bangkok (+7).
 *
 * Per-user timezone handling on the backend supersedes this; until then, noon is the
 * anchor that cannot drift across a date boundary.
 */
export function dateInputToTimestamp(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}

/**
 * Shift a `YYYY-MM-DD` by whole days.
 *
 * Uses UTC internally so the arithmetic cannot be shifted by the local zone or a
 * daylight-saving transition — the input is a plain calendar date with no zone attached.
 */
export function shiftDateLocal(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}
