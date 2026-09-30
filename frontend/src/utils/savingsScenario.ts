/** Calendar-month contributions starting this month; zero returns and no ledger mutations. */
export function savingsScenario(
  today: string,
  target: number,
  saved: number,
  monthly: number,
  extra: number,
) {
  if (
    ![target, saved, monthly, extra].every(Number.isFinite) ||
    target <= 0 ||
    saved < 0 ||
    monthly < 0 ||
    extra < 0 ||
    monthly + extra <= 0
  )
    return null
  const remaining = Math.max(0, Math.round((target - saved) * 100))
  const contribution = Math.round((monthly + extra) * 100)
  if (contribution <= 0) return null
  const months = Math.ceil(remaining / contribution)
  if (months > 1200) return null
  const [year, month] = today.split('-').map(Number)
  const end = new Date(Date.UTC(year, month + Math.max(1, months) - 1, 0))
  return { months, targetDate: months ? end.toISOString().slice(0, 10) : today }
}
