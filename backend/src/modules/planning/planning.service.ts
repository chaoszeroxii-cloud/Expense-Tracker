import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { RecurringBill, BillPayment, SavingsGoal } from './planning.entity'
import { BillDto, GoalDto, PayBillDto } from './planning.dto'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { Expense } from '../expenses/expense.entity'
import { ExpensesService } from '../expenses/expenses.service'
import {
  localToday,
  safeTimezone,
  daysInMonthOf,
} from '../../common/local-date.util'
import { lockLedger } from '../../common/ledger-lock.util'
import { round2 } from '../../common/money.util'

@Injectable()
export class PlanningService {
  constructor(
    private readonly db: DataSource,
    private readonly expenses: ExpensesService,
  ) {}

  private async calendar(userId: string) {
    const user = await this.db
      .getRepository(User)
      .findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    if (!user) throw new NotFoundException('User not found')
    const timezone = safeTimezone(user.timezone)
    const today = localToday(timezone)
    return { timezone, today, month: today.slice(0, 7) }
  }

  /** Freeze each cycle before any template change. Caller holds the user's ledger lock. */
  private async materialize(em: EntityManager, userId: string, month: string) {
    await em.query(`INSERT INTO bill_occurrences (bill_id,user_id,month,name,amount,category_id,due_day)
      SELECT b.id,b.user_id,to_char(m,'YYYY-MM'),b.name,b.amount,b.category_id,b.due_day
      FROM recurring_bills b
      CROSS JOIN LATERAL generate_series((b.start_month||'-01')::date,
        ($2||'-01')::date, interval '1 month') m
      WHERE b.user_id=$1 AND b.active
      ON CONFLICT DO NOTHING`, [userId, month])
  }

  async billsForMonth(userId: string, month: string, today: string, timezone: string) {
    await this.db.transaction(async em => {
      await lockLedger(em, userId)
      await this.materialize(em, userId, month)
    })
    const rows = await this.db.query(`
      SELECT b.id, o.month, o.name, o.amount, o.category_id AS "categoryId", o.due_day AS "dueDay", b.active,
        c.name AS "categoryName", p.expense_id AS "expenseId", e.amount AS "paidAmount",
        (e.occurred_at AT TIME ZONE $3)::date::text AS "paidDate"
      FROM bill_occurrences o JOIN recurring_bills b ON b.id=o.bill_id
      LEFT JOIN categories c ON c.id=o.category_id
      LEFT JOIN bill_payments p ON p.bill_id=o.bill_id AND p.month=o.month
      LEFT JOIN expenses e ON e.id=p.expense_id
      WHERE o.user_id=$1 AND o.month <= $2 AND NOT o.waived
        AND (o.month=$2 OR p.id IS NULL OR
          (e.occurred_at AT TIME ZONE $3)::date >= ($2||'-01')::date)
      ORDER BY o.month, o.due_day, b.created_at, b.id`, [userId, month, timezone])
    const bills = rows.map((row) => {
      const dueDate = `${row.month}-${String(Math.min(row.dueDay, daysInMonthOf(`${row.month}-01`))).padStart(2, '0')}`
      return {
        ...row,
        amount: Number(row.amount),
        paidAmount: row.paidAmount === null ? null : Number(row.paidAmount),
        dueDate,
        status: row.expenseId
          ? 'paid'
          : dueDate < today
            ? 'overdue'
            : dueDate === today
              ? 'due_today'
              : 'upcoming',
      }
    })
    return {
      bills,
      unpaidBills: round2(
        bills
          .filter((b) => !b.expenseId)
          .reduce((s, b) => s + b.amount, 0),
      ),
      billsPaidToday: round2(
        bills
          .filter((b) => b.paidDate === today)
          .reduce((s, b) => s + b.paidAmount, 0),
      ),
    }
  }

  async overview(userId: string) {
    const { timezone, today, month } = await this.calendar(userId)
    const [billState, goals] = await Promise.all([
      this.billsForMonth(userId, month, today, timezone),
      this.db
        .getRepository(SavingsGoal)
        .find({
          where: { userId },
          order: { targetDate: 'ASC', createdAt: 'ASC' },
        }),
    ])
    const [year, mon] = month.split('-').map(Number)
    return {
      month,
      today,
      ...billState,
      goals: goals.map((g) => {
        const remaining = round2(
          Math.max(0, Number(g.targetAmount) - Number(g.savedAmount)),
        )
        const [targetYear, targetMonth] = g.targetDate.split('-').map(Number)
        const months = Math.max(
          1,
          (targetYear - year) * 12 + targetMonth - mon + 1,
        )
        return {
          ...g,
          targetAmount: Number(g.targetAmount),
          savedAmount: Number(g.savedAmount),
          remaining,
          monthlyNeeded: Math.ceil((remaining * 100) / months) / 100,
          status:
            remaining === 0
              ? 'complete'
              : g.targetDate < today
                ? 'overdue'
                : 'saving',
        }
      }),
    }
  }

  private async assertExpenseCategory(
    em: EntityManager,
    userId: string,
    id: string,
  ) {
    const category = await em.findOne(Category, {
      where: { id, userId, type: 'expense' },
    })
    if (!category)
      throw new BadRequestException('Choose one of your expense categories')
  }

  async saveBill(userId: string, dto: BillDto, id?: string) {
    return this.db.transaction(async (em) => {
      const user = await lockLedger(em, userId)
      const month = localToday(safeTimezone(user.timezone)).slice(0, 7)
      await this.materialize(em, userId, month)
      await this.assertExpenseCategory(em, userId, dto.categoryId)
      let bill = id
        ? await em.findOne(RecurringBill, {
            where: { id, userId, active: true },
          })
        : null
      if (id && !bill) throw new NotFoundException('Bill not found')
      if (
        !id &&
        (await em.count(RecurringBill, { where: { userId, active: true } })) >=
          100
      ) {
        throw new BadRequestException('At most 100 active bills')
      }
      bill ??= em.create(RecurringBill, {
        userId,
        startMonth: localToday(safeTimezone(user.timezone)).slice(0, 7),
      })
      Object.assign(bill, dto)
      const saved = await em.save(RecurringBill, bill)
      await this.materialize(em, userId, month)
      // Editing the recurring plan changes this unpaid cycle and future cycles only.
      await em.query(`UPDATE bill_occurrences o SET name=$3,amount=$4,category_id=$5,due_day=$6
        WHERE bill_id=$1 AND month=$2 AND NOT waived AND NOT EXISTS
          (SELECT 1 FROM bill_payments p WHERE p.bill_id=o.bill_id AND p.month=o.month)`,
        [saved.id, month, dto.name, dto.amount, dto.categoryId, dto.dueDay])
      return saved
    })
  }

  async archiveBill(userId: string, id: string) {
    return this.db.transaction(async (em) => {
      const user = await lockLedger(em, userId)
      await this.materialize(em, userId, localToday(safeTimezone(user.timezone)).slice(0, 7))
      const result = await em.update(
        RecurringBill,
        { id, userId, active: true },
        { active: false },
      )
      if (!result.affected) throw new NotFoundException('Bill not found')
      return { ok: true }
    })
  }

  /** A payment and its ledger entry commit together; retries return the same payment. */
  async payBill(userId: string, id: string, dto: PayBillDto) {
    return this.db.transaction(async (em) => {
      const user = await lockLedger(em, userId)
      const tz = safeTimezone(user.timezone)
      const now = new Date()
      const currentMonth = localToday(tz, now).slice(0, 7)
      const month = dto.month ?? currentMonth
      if (month > currentMonth) throw new BadRequestException('Cannot pay a future cycle')
      await this.materialize(em, userId, currentMonth)
      const [bill] = await em.query(`SELECT name,amount,category_id AS "categoryId",waived
        FROM bill_occurrences WHERE bill_id=$1 AND user_id=$2 AND month=$3`, [id,userId,month])
      if (!bill || bill.waived) throw new NotFoundException('Bill cycle not found')
      const existing = await em.findOne(BillPayment, {
        where: { billId: id, month, userId },
      })
      if (existing) return existing
      let expense: Expense
      if (dto.expenseId) {
        expense = await em.findOne(Expense, {
          where: { id: dto.expenseId, userId },
          loadEagerRelations: false,
        })
        if (
          !expense ||
          expense.type !== 'expense' ||
          localToday(tz, new Date(expense.occurredAt)).slice(0, 7) !== currentMonth
        ) {
          throw new BadRequestException('Choose an expense recorded this month')
        }
        if (
          await em.exists(BillPayment, { where: { expenseId: expense.id } })
        ) {
          throw new BadRequestException(
            'This expense is already linked to a bill',
          )
        }
      } else {
        if (!bill.categoryId)
          throw new BadRequestException('Choose a category for this bill first')
        expense = await this.expenses.createInTransaction(
          {
            type: 'expense',
            amount: Number(bill.amount),
            categoryId: bill.categoryId,
            note: bill.name,
            occurredAt: now.toISOString(),
          },
          userId,
          em,
        )
      }
      return em.save(
        BillPayment,
        em.create(BillPayment, {
          userId,
          billId: id,
          month,
          expenseId: expense.id,
        }),
      )
    })
  }

  async changeOccurrence(userId: string, id: string, month: string, dto?: BillDto) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Invalid bill month')
    return this.db.transaction(async em => {
      const user = await lockLedger(em, userId)
      const current = localToday(safeTimezone(user.timezone)).slice(0, 7)
      if (month > current) throw new BadRequestException('Cannot edit a future cycle')
      await this.materialize(em, userId, current)
      if (await em.exists(BillPayment, { where: { billId: id, month, userId } })) {
        throw new BadRequestException('Edit or delete the recorded payment in History first')
      }
      if (dto) await this.assertExpenseCategory(em, userId, dto.categoryId)
      const rows = dto
        ? await em.query(`UPDATE bill_occurrences SET name=$4,amount=$5,category_id=$6,due_day=$7
            WHERE bill_id=$1 AND month=$2 AND user_id=$3 AND NOT waived RETURNING bill_id`,
            [id,month,userId,dto.name,dto.amount,dto.categoryId,dto.dueDay])
        : await em.query(`UPDATE bill_occurrences SET waived=true
            WHERE bill_id=$1 AND month=$2 AND user_id=$3 AND NOT waived RETURNING bill_id`, [id,month,userId])
      if (!rows[1]) throw new NotFoundException('Bill cycle not found')
      return { ok: true }
    })
  }

  async saveGoal(userId: string, dto: GoalDto, id?: string) {
    return this.db.transaction(async (em) => {
      await lockLedger(em, userId)
      let goal = id
        ? await em.findOne(SavingsGoal, { where: { id, userId } })
        : null
      if (id && !goal) throw new NotFoundException('Goal not found')
      if (!id && (await em.count(SavingsGoal, { where: { userId } })) >= 100)
        throw new BadRequestException('At most 100 goals')
      goal ??= em.create(SavingsGoal, { userId })
      Object.assign(goal, dto)
      return em.save(SavingsGoal, goal)
    })
  }

  async removeGoal(userId: string, id: string) {
    return this.db.transaction(async (em) => {
      await lockLedger(em, userId)
      const result = await em.delete(SavingsGoal, { id, userId })
      if (!result.affected) throw new NotFoundException('Goal not found')
      return { ok: true }
    })
  }
}
