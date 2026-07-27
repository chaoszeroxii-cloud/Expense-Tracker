import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Budget } from './budget.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { UpsertBudgetDto, BatchBudgetDto } from './dto/budget.dto'
import { safeTimezone } from '../../common/local-date.util'
import { round2 } from '../../common/money.util'

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
  ) {}

  /** The zone month boundaries are measured in for this user. */
  private async timezoneFor(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    return safeTimezone(user?.timezone)
  }

  async upsert(userId: string, dto: UpsertBudgetDto): Promise<Budget> {
    const existing = await this.repo.findOne({
      where: { userId, categoryId: dto.categoryId, month: dto.month },
    })
    if (existing) {
      existing.amount = dto.amount
      return this.repo.save(existing)
    }
    return this.repo.save(this.repo.create({ userId, ...dto }))
  }

  async findByMonth(userId: string, month: string): Promise<Budget[]> {
    return this.repo.find({ where: { userId, month } })
  }

  async remove(userId: string, id: string): Promise<void> {
    const budget = await this.repo.findOne({ where: { id, userId } })
    if (!budget) throw new NotFoundException('Budget not found')
    await this.repo.remove(budget)
  }

  async getBudgetWithActual(userId: string, month: string) {
    const tz = await this.timezoneFor(userId)
    const budgets = await this.repo.find({ where: { userId, month }, relations: ['category'] })

    // Month boundaries follow the user's calendar. This was pinned to UTC, which files a
    // late-evening purchase on the 31st under the following month for anyone east of
    // Greenwich — and then reports the budget as under-spent.
    const rows = await this.repo.manager.query(
      `SELECT e.category_id, SUM(e.amount) AS actual
         FROM expenses e
        WHERE e.user_id = $1
          AND e.type = 'expense'
          AND TO_CHAR(e.occurred_at AT TIME ZONE $3, 'YYYY-MM') = $2
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
    const tz = await this.timezoneFor(userId)
    const prev = previousMonth(month)

    const [categories, prevBudgets, averages] = await Promise.all([
      this.categories.find({ where: { userId, type: 'expense' } }),
      this.repo.find({ where: { userId, month: prev } }),
      this.repo.manager.query(
        `SELECT e.category_id,
                SUM(e.amount) / GREATEST(COUNT(DISTINCT TO_CHAR(e.occurred_at AT TIME ZONE $2, 'YYYY-MM')), 1) AS avg_month
           FROM expenses e
          WHERE e.user_id = $1
            AND e.type = 'expense'
            AND e.category_id IS NOT NULL
            AND e.occurred_at >= NOW() - INTERVAL '3 months'
          GROUP BY e.category_id`,
        [userId, tz],
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
    const prev = previousMonth(month)
    const source = await this.repo.find({ where: { userId, month: prev } })
    if (source.length === 0) {
      throw new BadRequestException(`No budgets found for ${prev}`)
    }

    const existing = await this.repo.find({ where: { userId, month } })
    const taken = new Set(existing.map((b) => b.categoryId))

    const toCreate = source
      .filter((b) => !taken.has(b.categoryId))
      .map((b) => this.repo.create({
        userId,
        categoryId: b.categoryId,
        amount: b.amount,
        month,
      }))

    if (toCreate.length > 0) await this.repo.save(toCreate)
    return { copied: toCreate.length, skipped: source.length - toCreate.length }
  }

  /** Saves a whole month in one request, so the UI is not N round trips of one field. */
  async saveBatch(userId: string, dto: BatchBudgetDto): Promise<{ saved: number; removed: number }> {
    const categoryIds = dto.items.map((i) => i.categoryId)

    // Every category must belong to the caller, or a crafted request could attach a
    // budget to someone else's category.
    if (categoryIds.length > 0) {
      const owned = await this.categories.count({ where: { id: In(categoryIds), userId } })
      if (owned !== new Set(categoryIds).size) {
        throw new NotFoundException('One or more categories were not found')
      }
    }

    const existing = await this.repo.find({ where: { userId, month: dto.month } })
    const byCategory = new Map(existing.map((b) => [b.categoryId, b]))

    // An amount of 0 means "no budget for this category" rather than "budget of zero",
    // which the CHECK constraint would reject anyway.
    const keep = dto.items.filter((i) => i.amount > 0)
    const drop = dto.items.filter((i) => i.amount <= 0).map((i) => i.categoryId)

    const rows = keep.map((item) => {
      const found = byCategory.get(item.categoryId)
      if (found) {
        found.amount = item.amount
        return found
      }
      return this.repo.create({ userId, categoryId: item.categoryId, amount: item.amount, month: dto.month })
    })

    if (rows.length > 0) await this.repo.save(rows)

    let removed = 0
    if (drop.length > 0) {
      const result = await this.repo.delete({ userId, month: dto.month, categoryId: In(drop) })
      removed = result.affected ?? 0
    }

    return { saved: rows.length, removed }
  }
}
