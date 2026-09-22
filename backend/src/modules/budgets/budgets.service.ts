import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Budget } from './budget.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { UpsertBudgetDto, BatchBudgetDto } from './dto/budget.dto'
import { safeTimezone, monthRangePredicate, monthSpanPredicate, shiftMonth } from '../../common/local-date.util'
import { lockLedger } from '../../common/ledger-lock.util'
import { round2 } from '../../common/money.util'
import { SpendingPlanService } from './spending-plan.service'

export interface SpendingPlanView {
  month: string
  state: 'explicit' | 'inherited' | 'empty'
  sourceMonth: string | null
  totalAmount: number | null
  /**
   * Every expense in the month, not only the categories that happen to have a budget.
   * The Plan screen used to sum actuals across budgeted rows alone, so it reported a
   * different "spent" figure from Home for the same month with no explanation.
   */
  totalActual: number
  categoryTargets: {
    categoryId: string
    categoryName: string
    categoryIcon: string | null
    categoryColor: string | null
    amount: number
    actual: number
  }[]
  targetedTotal: number
  /** Part of the monthly total not pinned to any category. */
  flexibleAmount: number | null
}

export interface BudgetSuggestion {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  /** What this category was budgeted last month, if anything. */
  previousAmount: number | null
  /** Mean monthly spend over the last three complete months. */
  averageActual: number
  /** What to prefill: last month's figure when there is one, otherwise the average. */
  suggested: number
}

/** Previous `YYYY-MM`. */
function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Round to a figure a person would actually choose. */
function tidy(amount: number): number {
  if (amount <= 0) return 0
  const step = amount >= 1000 ? 100 : 50
  return Math.max(step, Math.round(amount / step) * step)
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly repo: Repository<Budget>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly spendingPlan: SpendingPlanService,
  ) {}

  /** The zone month boundaries are measured in for this user. */
  private async timezoneFor(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    return safeTimezone(user?.timezone)
  }

  /**
   * The whole Plan screen in one payload: the monthly total (inherited when the month
   * has no explicit one) plus the optional per-category breakdown.
   */
  async getSpendingPlan(userId: string, month: string): Promise<SpendingPlanView> {
    const plan = await this.spendingPlan.resolve(userId, month)
    const tz = await this.timezoneFor(userId)

    const [withActual, totalRow] = await Promise.all([
      this.getBudgetWithActual(userId, month, tz),
      // Counts every expense in the month, matching what Home reports.
      this.repo.manager.query(
        `SELECT COALESCE(SUM(e.amount), 0) AS total
           FROM expenses e
          WHERE e.user_id = $1
            AND e.type = 'expense'
            AND ${monthRangePredicate('e.occurred_at', '$2', '$3')}`,
        [userId, month, tz],
      ),
    ])

    const targetedTotal = round2(withActual.reduce((sum, b) => sum + b.budgeted, 0))

    return {
      month,
      state: plan.state,
      sourceMonth: plan.sourceMonth,
      totalAmount: plan.totalAmount,
      totalActual: round2(parseFloat(totalRow[0]?.total) || 0),
      categoryTargets: withActual.map((b) => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName ?? '',
        categoryIcon: b.categoryIcon ?? null,
        categoryColor: b.categoryColor ?? null,
        amount: b.budgeted,
        actual: b.actual,
      })),
      targetedTotal,
      flexibleAmount: plan.totalAmount === null ? null : round2(plan.totalAmount - targetedTotal),
    }
  }

  async upsert(userId: string, dto: UpsertBudgetDto): Promise<Budget> {
    await this.saveBatch(userId, { month: dto.month, items: [{ categoryId: dto.categoryId, amount: dto.amount }] })
    return this.repo.findOneByOrFail({ userId, categoryId: dto.categoryId, month: dto.month })
  }

  async findByMonth(userId: string, month: string): Promise<Budget[]> {
    return this.repo.find({ where: { userId, month } })
  }

  async remove(userId: string, id: string): Promise<void> {
    const budget = await this.repo.findOne({ where: { id, userId } })
    if (!budget) throw new NotFoundException('Budget not found')
    await this.repo.remove(budget)
  }

  async getBudgetWithActual(userId: string, month: string, timezone?: string) {
    this.spendingPlan.assertMonth(month)
    const tz = timezone ?? await this.timezoneFor(userId)
    const budgets = await this.repo.find({ where: { userId, month }, relations: ['category'] })

    // Month boundaries follow the user's calendar. This was pinned to UTC, which files a
    // late-evening purchase on the 31st under the following month for anyone east of
    // Greenwich — and then reports the budget as under-spent.
    const rows = await this.repo.manager.query(
      `SELECT e.category_id, SUM(e.amount) AS actual
         FROM expenses e
        WHERE e.user_id = $1
          AND e.type = 'expense'
          AND ${monthRangePredicate('e.occurred_at', '$2', '$3')}
        GROUP BY e.category_id`,
      [userId, month, tz],
    )

    const actualMap: Record<string, number> = {}
    for (const row of rows) actualMap[row.category_id] = parseFloat(row.actual)

    return budgets.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category?.name,
      categoryIcon: b.category?.icon,
      categoryColor: b.category?.color,
      month: b.month,
      budgeted: parseFloat(b.amount as any),
      actual: actualMap[b.categoryId] ?? 0,
      remaining: parseFloat(b.amount as any) - (actualMap[b.categoryId] ?? 0),
    }))
  }

  /**
   * What to prefill a new month with.
   *
   * Setting budgets used to mean re-entering every category by hand on the 1st, with no
   * starting point — so the page went cold after the first month and the feature stopped
   * being used. Suggestions come from last month's figures, falling back to what the
   * user actually spends.
   */
  async getSuggestions(userId: string, month: string): Promise<BudgetSuggestion[]> {
    this.spendingPlan.assertMonth(month)
    const tz = await this.timezoneFor(userId)
    const prev = previousMonth(month)

    const [categories, prevBudgets, averages] = await Promise.all([
      this.categories.find({ where: { userId, type: 'expense' } }),
      this.repo.find({ where: { userId, month: prev } }),
      this.repo.manager.query(
        `SELECT e.category_id,
                SUM(e.amount) / 3 AS avg_month
           FROM expenses e
          WHERE e.user_id = $1
            AND e.type = 'expense'
            AND e.category_id IS NOT NULL
            AND ${monthSpanPredicate('e.occurred_at', '$3', '$4', '$2')}
          GROUP BY e.category_id`,
        [userId, tz, shiftMonth(month, -3), prev],
      ),
    ])

    const prevMap = new Map(prevBudgets.map((b) => [b.categoryId, parseFloat(b.amount as any)]))
    const avgMap = new Map<string, number>(
      averages.map((r: { category_id: string; avg_month: string }) => [r.category_id, parseFloat(r.avg_month)]),
    )

    return categories
      .map((c) => {
        const previousAmount = prevMap.get(c.id) ?? null
        const averageActual = round2(avgMap.get(c.id) ?? 0)
        return {
          categoryId: c.id,
          categoryName: c.name,
          categoryIcon: c.icon ?? null,
          categoryColor: c.color ?? null,
          previousAmount,
          averageActual,
          suggested: previousAmount ?? tidy(averageActual),
        }
      })
      // A category with no history and no previous budget has nothing to suggest;
      // offering it as "฿0" would be noise.
      .filter((s) => s.suggested > 0)
      .sort((a, b) => b.suggested - a.suggested)
  }

  /**
   * Copies the previous month's budgets forward.
   *
   * Categories already budgeted for the target month are left untouched — running this
   * twice, or after setting one category by hand, must not overwrite deliberate edits.
   */
  async copyPrevious(userId: string, month: string): Promise<{ copied: number; skipped: number }> {
    this.spendingPlan.assertMonth(month)
    return this.repo.manager.transaction(async em => {
      await lockLedger(em, userId)
      const repo = em.getRepository(Budget)
      const prev = previousMonth(month)
      const source = await repo.find({ where: { userId, month: prev } })
      if (source.length === 0) {
        throw new BadRequestException(`No budgets found for ${prev}`)
      }

      const existing = await repo.find({ where: { userId, month } })
      const taken = new Set(existing.map((b) => b.categoryId))

      const toCreate = source
        .filter((b) => !taken.has(b.categoryId))
        .map((b) => repo.create({
          userId,
          categoryId: b.categoryId,
          amount: b.amount,
          month,
        }))

      if (toCreate.length > 0) await repo.save(toCreate)
      return { copied: toCreate.length, skipped: source.length - toCreate.length }
    })
  }

  /** Saves a whole month in one request, so the UI is not N round trips of one field. */
  async saveBatch(userId: string, dto: BatchBudgetDto): Promise<{ saved: number; removed: number }> {
    this.spendingPlan.assertMonth(dto.month)
    const categoryIds = dto.items.map((i) => i.categoryId)
    if (new Set(categoryIds).size !== categoryIds.length) throw new BadRequestException('Duplicate categories')
    return this.repo.manager.transaction(async em => {
      await lockLedger(em, userId)
      const repo = em.getRepository(Budget)
      if (categoryIds.length > 0) {
        const owned = await em.count(Category, { where: { id: In(categoryIds), userId, type: 'expense' } })
        if (owned !== categoryIds.length) {
          throw new BadRequestException('Choose only your own expense categories')
        }
      }
      const keep = dto.items.filter((i) => i.amount > 0)
      const drop = dto.items.filter((i) => i.amount <= 0).map((i) => i.categoryId)
      if (keep.length > 0) await repo.upsert(keep.map(item => ({ ...item, userId, month: dto.month })), ['userId', 'categoryId', 'month'])
      let removed = 0
      if (drop.length > 0) {
        const result = await repo.delete({ userId, month: dto.month, categoryId: In(drop) })
        removed = result.affected ?? 0
      }
      return { saved: keep.length, removed }
    })
  }
}
