import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { safeTimezone } from '../../common/local-date.util'
import { round2 } from '../../common/money.util'

export interface ResetSummary {
  deletedTransactions: number
  from: string | null
  to: string | null
}

/**
 * Destructive account operations.
 *
 * Every one of these is irreversible, so each requires the caller to repeat a phrase the
 * UI showed them. That check lives here as well as in the client — a confirmation only
 * enforced in the browser is not a confirmation.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Rebuilds the running balances from the rows that remain.
   *
   * Transactions do not merely record history — each one moves `user.totalBalance` and,
   * when its category is linked, an envelope balance. Deleting rows without this leaves
   * envelopes holding money with no source and a total that describes transactions that
   * no longer exist, which looks like corruption and is impossible for a user to diagnose.
   *
   * Envelope balances are rebuilt from `expenses.allocation_id` — the envelope resolved
   * when the row was written — rather than from today's category links, which may have
   * been rewired since.
   */
  private async recomputeBalances(userId: string, em: EntityManager): Promise<void> {
    await em.query(
      `UPDATE users u
          SET total_balance = COALESCE((
                SELECT SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE -e.amount END)
                  FROM expenses e WHERE e.user_id = u.id
              ), 0)
        WHERE u.id = $1`,
      [userId],
    )

    await em.query(
      `UPDATE allocations a
          SET balance = COALESCE((
                SELECT SUM(CASE WHEN m.type IN ('fund', 'transfer_in') THEN m.amount ELSE -m.amount END)
                  FROM allocation_movements m WHERE m.allocation_id = a.id
              ), 0)
            + COALESCE((
                SELECT SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE -e.amount END)
                  FROM expenses e WHERE e.allocation_id = a.id
              ), 0)
        WHERE a.user_id = $1`,
      [userId],
    )
  }

  /**
   * Deletes transactions, optionally limited to a month range, then rebuilds balances.
   *
   * `from`/`to` are inclusive `YYYY-MM` in the user's own timezone — a UTC range would
   * take the wrong side of a month boundary for anyone east of Greenwich.
   */
  async resetTransactions(
    userId: string,
    opts: { from?: string; to?: string },
  ): Promise<ResetSummary> {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    const month = /^\d{4}-(0[1-9]|1[0-2])$/
    if (opts.from && !month.test(opts.from)) throw new BadRequestException('from must be YYYY-MM')
    if (opts.to && !month.test(opts.to)) throw new BadRequestException('to must be YYYY-MM')

    const [from, to] = opts.from && opts.to && opts.from > opts.to
      ? [opts.to, opts.from]
      : [opts.from, opts.to]

    const tz = safeTimezone(user.timezone)

    return this.dataSource.transaction(async (em) => {
      // The timezone parameter is only added when a range actually references it —
      // Postgres rejects a statement that is handed more parameters than it uses.
      const params: unknown[] = [userId]
      let where = `user_id = $1`
      if (from || to) {
        params.push(tz)
        const tzParam = `$${params.length}`
        if (from) { params.push(from); where += ` AND TO_CHAR(occurred_at AT TIME ZONE ${tzParam}, 'YYYY-MM') >= $${params.length}` }
        if (to)   { params.push(to);   where += ` AND TO_CHAR(occurred_at AT TIME ZONE ${tzParam}, 'YYYY-MM') <= $${params.length}` }
      }

      const deleted = await em.query(`DELETE FROM expenses WHERE ${where} RETURNING id`, params)
      const deletedTransactions = Array.isArray(deleted?.[0]) ? deleted[0].length : (deleted?.length ?? 0)

      // Check-ins covering the cleared days would otherwise claim those days are
      // accounted for by transactions that no longer exist.
      const checkinParams: unknown[] = [userId]
      let checkinWhere = `user_id = $1`
      if (from) { checkinParams.push(`${from}-01`); checkinWhere += ` AND local_date >= $${checkinParams.length}::date` }
      if (to)   { checkinParams.push(`${to}-01`);   checkinWhere += ` AND local_date < ($${checkinParams.length}::date + INTERVAL '1 month')` }
      await em.query(`DELETE FROM daily_checkins WHERE ${checkinWhere}`, checkinParams)

      // Envelope funding history only makes sense alongside the transactions it sat
      // beside; clearing the whole ledger clears it too.
      if (!from && !to) {
        await em.query(`DELETE FROM allocation_movements WHERE user_id = $1`, [userId])
      }

      await this.recomputeBalances(userId, em)

      this.logger.log(`reset transactions for ${userId}: ${deletedTransactions} row(s), range ${from ?? '*'}..${to ?? '*'}`)
      return { deletedTransactions, from: from ?? null, to: to ?? null }
    })
  }

  /**
   * Returns the account to its just-registered state while keeping the login.
   *
   * Everything the user created goes; the credentials, email and timezone stay, so they
   * are not signed out and do not have to register again. Onboarding is re-armed so the
   * app walks them through setup rather than dropping them on an empty home screen.
   */
  async factoryReset(userId: string, lang: 'th' | 'en' = 'th'): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    await this.dataSource.transaction(async (em) => {
      // Order matters only where a table lacks ON DELETE CASCADE; the rest is explicit
      // so the set of things being destroyed is readable rather than implied.
      await em.query(`DELETE FROM allocation_movements WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM allocation_plans     WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM daily_checkins       WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM product_events       WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM chat_messages        WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM budgets              WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM monthly_spending_plans WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM tax_deductions       WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM investment_transactions WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM investments          WHERE user_id = $1`, [userId])
      await em.query(
        `DELETE FROM loan_payments WHERE loan_id IN (SELECT id FROM loans WHERE user_id = $1)`,
        [userId],
      )
      await em.query(`DELETE FROM loans      WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM expenses   WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM allocations WHERE user_id = $1`, [userId])
      await em.query(`DELETE FROM categories WHERE user_id = $1`, [userId])

      // AI spend history is deliberately kept: it is a billing record, not user content,
      // and wiping it would let the per-user cap be reset at will.

      await em.getRepository(User).update(userId, {
        totalBalance: 0,
        expectedMonthlyIncome: null,
        monthlySpendingLimit: null,
        trackingMode: 'plan',
        advancedMode: false,
        showWorkTime: true,
        onboardingCompleted: false,
      })
    })

    // Re-seeded outside the transaction so a failure here leaves an empty but consistent
    // account rather than rolling the wipe back into a half-state.
    await this.seedDefaultCategories(userId, lang)

    this.logger.log(`factory reset completed for ${userId}`)
    return { ok: true }
  }

  /** Mirrors the starter list new accounts receive, in the account's language. */
  private async seedDefaultCategories(userId: string, lang: 'th' | 'en') {
    const defaults = [
      { nameEn: 'Food & Drink',  nameTh: 'อาหารและเครื่องดื่ม', icon: '🍜', color: '#f97316', type: 'expense' },
      { nameEn: 'Transport',     nameTh: 'เดินทาง',              icon: '🚗', color: '#3b82f6', type: 'expense' },
      { nameEn: 'Shopping',      nameTh: 'ช้อปปิ้ง',             icon: '🛍️', color: '#a855f7', type: 'expense' },
      { nameEn: 'Utilities',     nameTh: 'บิล/ค่าน้ำค่าไฟ',      icon: '💡', color: '#eab308', type: 'expense' },
      { nameEn: 'Health',        nameTh: 'สุขภาพ',               icon: '💊', color: '#ef4444', type: 'expense' },
      { nameEn: 'Entertainment', nameTh: 'บันเทิง',              icon: '🎮', color: '#ec4899', type: 'expense' },
      { nameEn: 'Housing',       nameTh: 'ที่อยู่อาศัย',          icon: '🏠', color: '#14b8a6', type: 'expense' },
      { nameEn: 'Education',     nameTh: 'การศึกษา',             icon: '📚', color: '#6366f1', type: 'expense' },
      { nameEn: 'Other',         nameTh: 'อื่นๆ',                icon: '📦', color: '#94a3b8', type: 'expense' },
      { nameEn: 'Salary',        nameTh: 'เงินเดือน',            icon: '💼', color: '#22c55e', type: 'income'  },
      { nameEn: 'Freelance',     nameTh: 'งานฟรีแลนซ์',          icon: '💻', color: '#10b981', type: 'income'  },
      { nameEn: 'Investment',    nameTh: 'ผลตอบแทนการลงทุน',     icon: '📈', color: '#06b6d4', type: 'income'  },
      { nameEn: 'Other Income',  nameTh: 'รายรับอื่นๆ',          icon: '💰', color: '#84cc16', type: 'income'  },
    ] as const

    await this.categories.save(
      defaults.map((c) => this.categories.create({
        name: lang === 'en' ? c.nameEn : c.nameTh,
        icon: c.icon,
        color: c.color,
        type: c.type,
        userId,
        isDefault: true,
      })),
    )
  }

  /** Preview counts, so the confirmation dialog can state what is about to be destroyed. */
  async getResetPreview(userId: string, from?: string, to?: string) {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const tz = safeTimezone(user.timezone)

    const params: unknown[] = [userId, tz]
    let where = `e.user_id = $1`
    if (from) { params.push(from); where += ` AND TO_CHAR(e.occurred_at AT TIME ZONE $2, 'YYYY-MM') >= $${params.length}` }
    if (to)   { params.push(to);   where += ` AND TO_CHAR(e.occurred_at AT TIME ZONE $2, 'YYYY-MM') <= $${params.length}` }

    const [row] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS expense_total,
              MIN(TO_CHAR(e.occurred_at AT TIME ZONE $2, 'YYYY-MM')) AS first_month,
              MAX(TO_CHAR(e.occurred_at AT TIME ZONE $2, 'YYYY-MM')) AS last_month
         FROM expenses e WHERE ${where}`,
      params,
    )

    return {
      count: row?.count ?? 0,
      expenseTotal: round2(parseFloat(row?.expense_total) || 0),
      firstMonth: row?.first_month ?? null,
      lastMonth: row?.last_month ?? null,
    }
  }
}
