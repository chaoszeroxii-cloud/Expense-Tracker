import { round2 } from '../../common/money.util'

/** Bills are included in the monthly limit. Paying a reserved bill must not consume today's allowance twice. */
export function dailyAllowance(
  limit: number,
  monthSpent: number,
  spentToday: number,
  unpaidBills: number,
  billsPaidToday: number,
  daysRemaining: number,
): number {
  const everydayToday = Math.max(0, spentToday - billsPaidToday)
  const availableBeforeEverydayToday =
    limit - monthSpent - unpaidBills + everydayToday
  return round2(
    Math.max(
      0,
      Math.max(0, availableBeforeEverydayToday) / Math.max(1, daysRemaining) -
        everydayToday,
    ),
  )
}
