import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In, DataSource, EntityManager } from 'typeorm'
import { Allocation } from './allocation.entity'
import { Category } from '../categories/category.entity'
import { User } from '../users/user.entity'
import { CreateAllocationDto, UpdateAllocationDto } from './allocation.dto'

@Injectable()
export class AllocationsService {
  constructor(
    @InjectRepository(Allocation)
    private readonly repo: Repository<Allocation>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    private readonly dataSource: DataSource,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────
  findAll(userId: string): Promise<Allocation[]> {
    return this.repo.find({
      where: { userId },
      relations: ['categories', 'incomeCategories'],
      order: { name: 'ASC' },
    })
  }

  async findOne(id: string, userId: string): Promise<Allocation> {
    const a = await this.repo.findOne({ where: { id, userId }, relations: ['categories', 'incomeCategories'] })
    if (!a) throw new NotFoundException(`Allocation ${id} not found`)
    return a
  }

  async create(dto: CreateAllocationDto, userId: string): Promise<Allocation> {
    const categories = await this.resolveCategories(dto.categoryIds ?? [], userId)
    const incomeCategories = await this.resolveCategories(dto.incomeCategoryIds ?? [], userId)
    const allocation = this.repo.create({
      name: dto.name,
      icon: dto.icon,
      color: dto.color,
      userId,
      categories,
      incomeCategories,
    })
    return this.repo.save(allocation)
  }

  async update(id: string, dto: UpdateAllocationDto, userId: string): Promise<Allocation> {
    const allocation = await this.findOne(id, userId)
    if (dto.name  !== undefined) allocation.name  = dto.name
    if (dto.icon  !== undefined) allocation.icon  = dto.icon
    if (dto.color !== undefined) allocation.color = dto.color
    if (dto.categoryIds !== undefined) {
      allocation.categories = await this.resolveCategories(dto.categoryIds, userId)
    }
    if (dto.incomeCategoryIds !== undefined) {
      allocation.incomeCategories = await this.resolveCategories(dto.incomeCategoryIds, userId)
    }
    return this.repo.save(allocation)
  }

  async remove(id: string, userId: string): Promise<void> {
    const allocation = await this.findOne(id, userId)
    await this.repo.remove(allocation)
  }

  // ── Move unallocated funds into a wallet ──────────────────────
  // Unallocated = user.totalBalance - SUM(all allocation.balance)
  // Moving only increments the allocation; totalBalance stays the same
  // so unallocated shrinks automatically.
  async moveToAllocation(allocationId: string, userId: string, amount: number): Promise<{ unallocatedBalance: number }> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive')

    const userRepo = this.dataSource.getRepository(User)
    const [user, allAllocations] = await Promise.all([
      userRepo.findOne({ where: { id: userId } }),
      this.repo.find({ where: { userId } }),
    ])

    if (!user) throw new NotFoundException('User not found')

    const totalAllocated = allAllocations.reduce((s: number, a: Allocation) => s + Number(a.balance), 0)
    const unallocated = Number(user.totalBalance) - totalAllocated

    if (amount > unallocated) {
      throw new BadRequestException(
        `Insufficient unallocated balance. Available: ฿${unallocated.toFixed(2)}`,
      )
    }

    // Credit the wallet — no totalBalance change needed
    await this.credit(allocationId, userId, amount)

    const newUnallocated = unallocated - amount
    return { unallocatedBalance: newUnallocated }
  }

  // ── Transfer between wallets ──────────────────────────────────
  async transferBetweenAllocations(sourceId: string, targetId: string, userId: string, amount: number): Promise<void> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive')
    if (sourceId === targetId) throw new BadRequestException('Cannot transfer to the same wallet')

    const source = await this.findOne(sourceId, userId)
    if (Number(source.balance) < amount) {
      throw new BadRequestException(`Insufficient balance. Available: ฿${Number(source.balance).toFixed(2)}`)
    }

    await this.repo.createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance - ${amount}` })
      .where('id = :id AND user_id = :userId', { id: sourceId, userId })
      .execute()

    await this.credit(targetId, userId, amount)
  }

  // ── Return wallet funds to unallocated pool ───────────────────
  async unallocateFromAllocation(allocationId: string, userId: string, amount: number): Promise<void> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive')

    const allocation = await this.findOne(allocationId, userId)
    if (Number(allocation.balance) < amount) {
      throw new BadRequestException(`Insufficient balance. Available: ฿${Number(allocation.balance).toFixed(2)}`)
    }

    await this.repo.createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance - ${amount}` })
      .where('id = :id AND user_id = :userId', { id: allocationId, userId })
      .execute()
  }

  // ── Balance mutations (called from ExpensesService) ───────────

  /** Add `amount` to a specific allocation (income flow). */
  async credit(allocationId: string, userId: string, amount: number, em?: EntityManager) {
    const repo = em ? em.getRepository(Allocation) : this.repo
    const result = await repo
      .createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance + ${amount}` })
      .where('id = :id AND user_id = :userId', { id: allocationId, userId })
      .execute()
    if (result.affected === 0) throw new NotFoundException(`Allocation ${allocationId} not found`)
  }

  /** Subtract `amount` from the allocation linked to `categoryId` (expense flow). */
  async debitByCategory(categoryId: string, userId: string, amount: number, em?: EntityManager) {
    const repo = em ? em.getRepository(Allocation) : this.repo

    // Find allocation that has this category linked
    const allocation = await repo
      .createQueryBuilder('a')
      .innerJoin('a.categories', 'c', 'c.id = :categoryId', { categoryId })
      .where('a.user_id = :userId', { userId })
      .getOne()

    if (!allocation) return null

    await repo
      .createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance - ${amount}` })
      .where('id = :id', { id: allocation.id })
      .execute()

    return allocation
  }

  /** Add `amount` to the allocation linked to `incomeCategoryId` (income flow). */
  async creditByIncomeCategory(categoryId: string, userId: string, amount: number, em?: EntityManager) {
    const repo = em ? em.getRepository(Allocation) : this.repo

    // Find allocation that has this income category linked
    const allocation = await repo
      .createQueryBuilder('a')
      .innerJoin('a.incomeCategories', 'c', 'c.id = :categoryId', { categoryId })
      .where('a.user_id = :userId', { userId })
      .getOne()

    if (!allocation) return null

    await repo
      .createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance + ${amount}` })
      .where('id = :id', { id: allocation.id })
      .execute()

    return allocation
  }

  /**
   * Reverse a previously applied balance change (used on expense update/delete).
   */
  async reverseCredit(allocationId: string, userId: string, amount: number, em?: EntityManager) {
    return this.credit(allocationId, userId, -amount, em)
  }

  async reverseDebitByCategory(categoryId: string, userId: string, amount: number, em?: EntityManager) {
    return this.debitByCategory(categoryId, userId, -amount, em)
  }

  async reverseCreditByIncomeCategory(categoryId: string, userId: string, amount: number, em?: EntityManager) {
    return this.creditByIncomeCategory(categoryId, userId, -amount, em)
  }

  // ── Helper ────────────────────────────────────────────────────
  private async resolveCategories(ids: string[], userId: string): Promise<Category[]> {
    if (!ids.length) return []
    return this.categoryRepo.find({ where: { id: In(ids), userId } })
  }
}
