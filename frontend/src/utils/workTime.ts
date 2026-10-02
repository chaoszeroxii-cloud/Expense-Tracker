/**
 * The work-time lens: prices expressed in hours of the user's own labour.
 *
 * This is the "price in life energy" reframe — it makes a cost concrete at the moment
 * of the decision, which is why it belongs inline next to the amount field rather than
 * inside a separate calculator the user has to remember to open.
 */

/** Monthly income → hourly rate. Returns `null` when the inputs cannot produce one. */
export function hourlyRateOf(
  monthlyIncome: number | null | undefined,
  hoursPerDay: number,
  daysPerMonth: number,
): number | null {
  if (!monthlyIncome || monthlyIncome <= 0) return null
  const monthlyHours = hoursPerDay * daysPerMonth
  if (!Number.isFinite(monthlyHours) || monthlyHours <= 0) return null
  return monthlyIncome / monthlyHours
}

export interface WorkTimeParts {
  days: number
  hours: number
  minutes: number
  totalHours: number
}

export function workTimeFor(amount: number, hourlyRate: number, hoursPerDay: number): WorkTimeParts {
  const totalHours = amount / hourlyRate
  const perDay = hoursPerDay > 0 ? hoursPerDay : 8
  const days = Math.floor(totalHours / perDay)
  const remainderHours = totalHours - days * perDay
  const hours = Math.floor(remainderHours)
  const minutes = Math.round((remainderHours - hours) * 60)
  return { days, hours, minutes, totalHours }
}

/**
 * A short, glanceable label — "2 ชม. 15 น." or "1 วัน 3 ชม.".
 *
 * Units come from the caller so this stays out of the i18n store; the badge is rendered
 * in tight space, so at most two units are shown.
 */
export function formatWorkTime(
  amount: number,
  hourlyRate: number,
  hoursPerDay: number,
  units: { day: string; hour: string; minute: string },
): string {
  if (!(amount > 0) || !(hourlyRate > 0)) return ''
  const { days, hours, minutes } = workTimeFor(amount, hourlyRate, hoursPerDay)

  if (days > 0) {
    return hours > 0 ? `${days} ${units.day} ${hours} ${units.hour}` : `${days} ${units.day}`
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} ${units.hour} ${minutes} ${units.minute}` : `${hours} ${units.hour}`
  }
  // Below a minute of work the figure stops being meaningful; floor it at 1.
  return `${Math.max(1, minutes)} ${units.minute}`
}
