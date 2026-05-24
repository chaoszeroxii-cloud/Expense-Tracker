import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Budget } from './budget.entity'
import { UpsertBudgetDto } from './dto/budget.dto'

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly repo: Repository<Budget>,
  ) {}

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
    const budgets = await this.repo.find({ where: { userId, month }, relations: ['category'] })

    const result = await this.repo.manager.query(
      `SELECT e.category_id, SUM(e.amount) as actual
       FROM expenses e
       WHERE e.user_id = $1
         AND e.type = 'expense'
         AND TO_CHAR(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM') = $2
       GROUP BY e.category_id`,
      [userId, month],
    )

    const actualMap: Record<string, number> = {}
    for (const row of result) {
      actualMap[row.category_id] = parseFloat(row.actual)
    }

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
}
