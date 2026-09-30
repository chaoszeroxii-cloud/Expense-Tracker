import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { User } from '../users/user.entity'
import {
  daysInMonthOf,
  localToday,
  safeTimezone,
  shiftDate,
  shiftMonth,
} from '../../common/local-date.util'
import { dailyAllowance } from './daily-allowance'
import { round2 } from '../../common/money.util'
import { lockLedger } from '../../common/ledger-lock.util'
import { PayCycleDto, ReminderPreferenceDto, SnoozeBillDto } from './planning-extras.dto'

export function payCycleBounds(today: string, payDay: number) {
  const onMonth = (month: string) =>
    `${month}-${String(Math.min(payDay, daysInMonthOf(month + '-01'))).padStart(2, '0')}`
  const month = today.slice(0, 7)
  const start = today >= onMonth(month) ? onMonth(month) : onMonth(shiftMonth(month, -1))
  const nextPayday = onMonth(shiftMonth(start.slice(0, 7), 1))
  return {
    start,
    end: shiftDate(nextPayday, -1),
    nextPayday,
    daysRemaining: Math.round((Date.parse(nextPayday) - Date.parse(today)) / 86400000),
  }
}

@Injectable()
export class PlanningExtrasService {
  constructor(private readonly db: DataSource) {}
  private async calendar(userId: string) {
    const user = await this.db.getRepository(User).findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const timezone = safeTimezone(user.timezone)
    return { user, timezone, today: localToday(timezone) }
  }
  /** Read-only schedule, preferring frozen obligations; projecting a future bill never freezes it. */
  async schedule(userId: string, through: string, timezone: string) {
    const rows = await this.db.query(
      `WITH projected AS (
      SELECT b.id AS bill_id,b.user_id,to_char(m,'YYYY-MM') AS month,b.name,b.amount,b.category_id,b.due_day,false AS waived
      FROM recurring_bills b CROSS JOIN LATERAL generate_series((b.start_month||'-01')::date,
        ($2::date),interval '1 month') m WHERE b.user_id=$1 AND b.active
    ), obligations AS (
      SELECT o.bill_id,o.user_id,o.month,o.name,o.amount,o.category_id,o.due_day,o.waived
        FROM bill_occurrences o WHERE o.user_id=$1
      UNION ALL SELECT p.* FROM projected p WHERE NOT EXISTS
        (SELECT 1 FROM bill_occurrences o WHERE o.bill_id=p.bill_id AND o.month=p.month)
    ) SELECT o.bill_id AS id,o.month,o.name,o.amount,o.category_id AS "categoryId",
      ((o.month||'-01')::date + (LEAST(o.due_day,EXTRACT(day FROM ((o.month||'-01')::date+interval '1 month' - interval '1 day'))::int)-1))::text AS "dueDate",
      p.expense_id AS "expenseId",(e.occurred_at AT TIME ZONE $3)::date::text AS "paidDate",e.amount AS "paidAmount"
      FROM obligations o LEFT JOIN bill_payments p ON p.bill_id=o.bill_id AND p.month=o.month
      LEFT JOIN expenses e ON e.id=p.expense_id
      WHERE NOT o.waived AND o.month <= to_char($2::date,'YYYY-MM') ORDER BY o.month,o.due_day,o.bill_id`,
      [userId, through, timezone],
    )
    return rows
      .map((r) => ({
        ...r,
        amount: Number(r.amount),
        paidAmount: r.paidAmount === null ? null : Number(r.paidAmount),
      }))
      .filter((r) => r.dueDate <= through)
  }
  async cycle(userId: string) {
    const { timezone, today } = await this.calendar(userId)
    const [stored] = await this.db.query(
      `SELECT enabled,pay_day AS "payDay",budget FROM pay_cycle_plans WHERE user_id=$1`,
      [userId],
    )
    if (!stored) return { enabled: false, payDay: 25, budget: null, period: null }
    if (!stored.enabled)
      return { enabled: false, payDay: stored.payDay, budget: Number(stored.budget), period: null }
    const bounds = payCycleBounds(today, stored.payDay)
    const [totals, bills] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(sum(amount),0) AS spent,
        COALESCE(sum(amount) FILTER(WHERE (occurred_at AT TIME ZONE $4)::date=$5::date),0) AS today
        FROM expenses WHERE user_id=$1 AND type='expense'
        AND occurred_at >= ($2::date::timestamp AT TIME ZONE $4)
        AND occurred_at < (($3::date+1)::timestamp AT TIME ZONE $4)`,
        [userId, bounds.start, bounds.end, timezone, today],
      ),
      this.schedule(userId, bounds.end, timezone),
    ])
    const spent = Number(totals[0].spent),
      spentToday = Number(totals[0].today)
    const unpaid = bills.filter((b) => !b.expenseId)
    const unpaidBills = round2(unpaid.reduce((s, b) => s + b.amount, 0))
    const nextBill = unpaid[0]
    // All linked bill payments today are ordinary-spend exclusions, including early payments.
    const [paid] = await this.db.query(
      `SELECT COALESCE(sum(e.amount),0) AS total FROM bill_payments p
      JOIN expenses e ON e.id=p.expense_id WHERE p.user_id=$1
      AND e.occurred_at >= ($2::date::timestamp AT TIME ZONE $3)
      AND e.occurred_at < (($2::date+1)::timestamp AT TIME ZONE $3)`,
      [userId, today, timezone],
    )
    return {
      enabled: stored.enabled,
      payDay: stored.payDay,
      budget: Number(stored.budget),
      period: {
        ...bounds,
        spent,
        unpaidBills,
        unpaidBillCount: unpaid.length,
        nextBill: nextBill
          ? { name: nextBill.name, amount: nextBill.amount, dueDate: nextBill.dueDate }
          : null,
        safeToday: dailyAllowance(
          Number(stored.budget),
          spent,
          spentToday,
          unpaidBills,
          Number(paid.total),
          bounds.daysRemaining,
        ),
      },
    }
  }
  async saveCycle(userId: string, dto: PayCycleDto) {
    await this.db.transaction(async (em) => {
      await lockLedger(em, userId)
      await em.query(
        `INSERT INTO pay_cycle_plans(user_id,enabled,pay_day,budget) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET enabled=$2,pay_day=$3,budget=$4`,
        [userId, dto.enabled, dto.payDay, dto.budget],
      )
      if (dto.enabled) await em.update(User, userId, { trackingMode: 'plan' })
    })
    return this.cycle(userId)
  }
  async reminderPreferences(userId: string) {
    const [row] = await this.db.query(
      `SELECT enabled,days_before AS "daysBefore" FROM bill_reminder_preferences WHERE user_id=$1`,
      [userId],
    )
    return row ?? { enabled: false, daysBefore: 3 }
  }
  async saveReminderPreferences(userId: string, dto: ReminderPreferenceDto) {
    await this.db.query(
      `INSERT INTO bill_reminder_preferences(user_id,enabled,days_before) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET enabled=$2,days_before=$3`,
      [userId, dto.enabled, dto.daysBefore],
    )
    return dto
  }
  async reminders(userId: string) {
    const { timezone, today, user } = await this.calendar(userId)
    const preferences = await this.reminderPreferences(userId)
    const through = shiftDate(today, preferences.daysBefore)
    const [bills, snoozes] = await Promise.all([
      this.schedule(userId, through, timezone),
      this.db.query(
        `SELECT bill_id,month,snoozed_until::text,last_sent::text FROM bill_reminder_deliveries WHERE user_id=$1`,
        [userId],
      ),
    ])
    return {
      preferences,
      today,
      remindAt: user.remindAt,
      timezone,
      pushEnabled: user.pushEnabled,
      bills: bills
        .filter((b) => !b.expenseId)
        .map((b) => {
          const record = snoozes.find((s) => s.bill_id === b.id && s.month === b.month)
          return {
            ...b,
            snoozedUntil: record?.snoozed_until ?? null,
            lastSent: record?.last_sent ?? null,
          }
        }),
    }
  }
  async snooze(userId: string, id: string, dto: SnoozeBillDto) {
    const { timezone, today } = await this.calendar(userId)
    const date = new Date(dto.until + 'T12:00:00Z')
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.until ||
      dto.until < today ||
      dto.until > shiftDate(today, 30)
    ) {
      throw new BadRequestException('Snooze must be within the next 30 days')
    }
    const bills = await this.schedule(userId, shiftDate(today, 31), timezone)
    if (!bills.some((b) => b.id === id && b.month === dto.month && !b.expenseId))
      throw new NotFoundException('Unpaid bill not found')
    await this.db.query(
      `INSERT INTO bill_reminder_deliveries(user_id,bill_id,month,snoozed_until) VALUES($1,$2,$3,$4::date)
      ON CONFLICT(user_id,bill_id,month) DO UPDATE SET snoozed_until=$4::date`,
      [userId, id, dto.month, dto.until],
    )
    return { ok: true }
  }
}
