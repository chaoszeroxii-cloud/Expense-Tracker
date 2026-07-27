import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, EntityManager } from 'typeorm'
import { Expense } from './expense.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { AllocationsService } from '../allocations/allocations.service'
import { CreateExpenseDto, UpdateExpenseDto, QueryExpenseDto } from './dto/expense.dto'

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly repo: Repository<Expense>,
    private readonly allocations: AllocationsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Queries ───────────────────────────────────────────────────
  async findAll(userId: string, query: QueryExpenseDto): Promise<Expense[]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoinAndSelect('e.allocation', 'allocation')
      .where('e.user_id = :userId', { userId })
      .orderBy('e.occurred_at', 'DESC')

    if (query.type)       qb.andWhere('e.type = :type', { type: query.type })
    if (query.categoryId) qb.andWhere('e.category_id = :categoryId', { categoryId: query.categoryId })
    if (query.from && query.to) {
      // Inclusive month range, e.g. 2026-01 → 2026-06
      const [lo, hi] = query.from <= query.to
        ? [query.from, query.to]
        : [query.to, query.from]
      qb.andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') BETWEEN :lo AND :hi", { lo, hi })
    } else if (query.month) {
      qb.andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month: query.month })
    } else if (query.year) {
      qb.andWhere("TO_CHAR(e.occurred_at, 'YYYY') = :year", { year: query.year })
    }
    return qb.getMany()
  }

  async findOne(id: string, userId: string): Promise<Expense> {
    const e = await this.repo.findOne({
      where: { id, userId },
      relations: ['category', 'allocation'],
    })
    if (!e) throw new NotFoundException(`Expense ${id} not found`)
    return e
  }

  /** Reject a categoryId that isn't one of the caller's own categories. */
  private async assertCategoryOwned(em: EntityManager, categoryId: string, userId: string): Promise<void> {
    const category = await em.findOne(Category, { where: { id: categoryId, userId } })
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`)
  }

  // ── Create ────────────────────────────────────────────────────
  // NEW FLOW:
  //   income  → user.total_balance += amount
  //             + allocation.balance += amount (if category is linked to an income wallet)
  //   expense → user.total_balance -= amount
  //             + allocation.balance -= amount (if category is linked to a wallet)
  async create(dto: CreateExpenseDto, userId: string): Promise<Expense> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      await this.assertCategoryOwned(em, dto.categoryId, userId)
      let resolvedAllocationId: string | undefined

      if (dto.type === 'income') {
        // Park income in user's total balance
        await em.increment(User, { id: userId }, 'totalBalance', dto.amount)
        // Credit the wallet linked to this income category (if any)
        if (dto.categoryId) {
          const credited = await this.allocations.creditByIncomeCategory(
            dto.categoryId, userId, dto.amount, em,
          )
          resolvedAllocationId = credited?.id
        }
      } else {
        // Debit total balance
        await em.decrement(User, { id: userId }, 'totalBalance', dto.amount)
        // Debit the wallet linked to this expense category (if any)
        if (dto.categoryId) {
          const debited = await this.allocations.debitByCategory(
            dto.categoryId, userId, dto.amount, em,
          )
          resolvedAllocationId = debited?.id
        }
      }

      const expense = em.create(Expense, {
        ...dto,
        userId,
        allocationId: resolvedAllocationId,
      })
      return em.save(Expense, expense)
    })
  }

  // ── Update ────────────────────────────────────────────────────
  async update(id: string, dto: UpdateExpenseDto, userId: string): Promise<Expense> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      if (dto.categoryId) await this.assertCategoryOwned(em, dto.categoryId, userId)
      const expense = await this.findOne(id, userId)
      const oldAmount      = Number(expense.amount)
      const oldType        = expense.type
      const oldAllocationId = expense.allocationId
      const oldCategoryId  = expense.categoryId

      // ── Reverse old effect ──────────────────────────────────
      if (oldType === 'income') {
        await em.decrement(User, { id: userId }, 'totalBalance', oldAmount)
        // Reverse wallet credit (both old-style explicit and new income-category-based)
        if (oldAllocationId) {
          await this.allocations.reverseCredit(oldAllocationId, userId, oldAmount, em)
        } else if (oldCategoryId) {
          await this.allocations.reverseCreditByIncomeCategory(oldCategoryId, userId, oldAmount, em)
        }
      } else {
        await em.increment(User, { id: userId }, 'totalBalance', oldAmount)
        if (oldAllocationId) {
          // Direct allocation reversal (faster than category lookup)
          await this.allocations.credit(oldAllocationId, userId, oldAmount, em)
        } else if (oldCategoryId) {
          await this.allocations.reverseDebitByCategory(oldCategoryId, userId, oldAmount, em)
        }
      }

      // Mutate expense with new values
      Object.assign(expense, dto)
      const newAmount     = Number(expense.amount)
      const newType       = expense.type
      const newCategoryId = expense.categoryId
      let newAllocationId: string | undefined

      // ── Apply new effect ────────────────────────────────────
      if (newType === 'income') {
        await em.increment(User, { id: userId }, 'totalBalance', newAmount)
        // Credit the wallet linked to this income category (if any)
        if (newCategoryId) {
          const credited = await this.allocations.creditByIncomeCategory(
            newCategoryId, userId, newAmount, em,
          )
          newAllocationId = credited?.id
        }
      } else {
        await em.decrement(User, { id: userId }, 'totalBalance', newAmount)
        if (newCategoryId) {
          const debited = await this.allocations.debitByCategory(
            newCategoryId, userId, newAmount, em,
          )
          newAllocationId = debited?.id
        }
      }

      expense.allocationId = newAllocationId
      return em.save(Expense, expense)
    })
  }

  // ── Delete ────────────────────────────────────────────────────
  async remove(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      const expense = await this.findOne(id, userId)
      const amount  = Number(expense.amount)

      if (expense.type === 'income') {
        // Reverse: pull back from total balance
        await em.decrement(User, { id: userId }, 'totalBalance', amount)
        // Reverse wallet credit (both old-style explicit and new income-category-based)
        if (expense.allocationId) {
          await this.allocations.reverseCredit(expense.allocationId, userId, amount, em)
        } else if (expense.categoryId) {
          await this.allocations.reverseCreditByIncomeCategory(expense.categoryId, userId, amount, em)
        }
      } else {
        // Reverse: return to total balance
        await em.increment(User, { id: userId }, 'totalBalance', amount)
        // Return to linked wallet
        if (expense.allocationId) {
          await this.allocations.credit(expense.allocationId, userId, amount, em)
        } else if (expense.categoryId) {
          await this.allocations.reverseDebitByCategory(expense.categoryId, userId, amount, em)
        }
      }

      await em.remove(Expense, expense)
    })
  }
}
