import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { Expense } from './expense.entity'
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

  async findAll(userId: string, query: QueryExpenseDto): Promise<Expense[]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoinAndSelect('e.allocation', 'allocation')
      .where('e.user_id = :userId', { userId })
      .orderBy('e.occurred_at', 'DESC')

    if (query.type)       qb.andWhere('e.type = :type', { type: query.type })
    if (query.categoryId) qb.andWhere('e.category_id = :categoryId', { categoryId: query.categoryId })
    if (query.month) {
      qb.andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month: query.month })
    } else if (query.year) {
      qb.andWhere("TO_CHAR(e.occurred_at, 'YYYY') = :year", { year: query.year })
    }
    return qb.getMany()
  }

  async findOne(id: string, userId: string): Promise<Expense> {
    const e = await this.repo.findOne({ where: { id, userId }, relations: ['category', 'allocation'] })
    if (!e) throw new NotFoundException(`Expense ${id} not found`)
    return e
  }

  async create(dto: CreateExpenseDto, userId: string): Promise<Expense> {
    return this.dataSource.transaction(async (em) => {
      let resolvedAllocationId: string | undefined

      if (dto.type === 'income' && dto.allocationId) {
        await this.allocations.credit(dto.allocationId, userId, dto.amount, em)
        resolvedAllocationId = dto.allocationId
      } else if (dto.type === 'expense' && dto.categoryId) {
        const debited = await this.allocations.debitByCategory(dto.categoryId, userId, dto.amount, em)
        resolvedAllocationId = debited?.id
      }

      const expense = em.create(Expense, { ...dto, userId, allocationId: resolvedAllocationId })
      return em.save(Expense, expense)
    })
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string): Promise<Expense> {
    return this.dataSource.transaction(async (em) => {
      const expense = await this.findOne(id, userId)
      const oldAmount = Number(expense.amount)
      const oldType = expense.type
      const oldCategoryId = expense.categoryId
      const oldAllocationId = expense.allocationId

      // Reverse old effect
      if (oldType === 'income' && oldAllocationId) {
        await this.allocations.reverseCredit(oldAllocationId, userId, oldAmount, em)
      } else if (oldType === 'expense' && oldCategoryId) {
        await this.allocations.reverseDebitByCategory(oldCategoryId, userId, oldAmount, em)
      }

      Object.assign(expense, dto)
      const newAmount = Number(expense.amount)
      const newType = expense.type
      const newCategoryId = expense.categoryId
      let newAllocationId: string | undefined

      // Apply new effect
      if (newType === 'income') {
        const targetId = dto.allocationId ?? oldAllocationId
        if (targetId) {
          await this.allocations.credit(targetId, userId, newAmount, em)
          newAllocationId = targetId
        }
      } else if (newType === 'expense' && newCategoryId) {
        const debited = await this.allocations.debitByCategory(newCategoryId, userId, newAmount, em)
        newAllocationId = debited?.id
      }

      expense.allocationId = newAllocationId
      return em.save(Expense, expense)
    })
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const expense = await this.findOne(id, userId)
      if (expense.type === 'income' && expense.allocationId) {
        await this.allocations.reverseCredit(expense.allocationId, userId, Number(expense.amount), em)
      } else if (expense.type === 'expense' && expense.categoryId) {
        await this.allocations.reverseDebitByCategory(expense.categoryId, userId, Number(expense.amount), em)
      }
      await em.remove(Expense, expense)
    })
  }
}
