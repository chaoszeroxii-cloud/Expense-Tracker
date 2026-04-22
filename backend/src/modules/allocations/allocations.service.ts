import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In, DataSource, EntityManager } from 'typeorm'
import { Allocation } from './allocation.entity'
import { Category } from '../categories/category.entity'
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
      relations: ['categories'],
      order: { name: 'ASC' },
    })
  }

  async findOne(id: string, userId: string): Promise<Allocation> {
    const a = await this.repo.findOne({ where: { id, userId }, relations: ['categories'] })
    if (!a) throw new NotFoundException(`Allocation ${id} not found`)
    return a
  }

  async create(dto: CreateAllocationDto, userId: string): Promise<Allocation> {
    const categories = await this.resolveCategories(dto.categoryIds ?? [], userId)
    const allocation = this.repo.create({
      name: dto.name,
      icon: dto.icon,
      color: dto.color,
      userId,
      categories,
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
    return this.repo.save(allocation)
  }

  async remove(id: string, userId: string): Promise<void> {
    const allocation = await this.findOne(id, userId)
    await this.repo.remove(allocation)
  }

  // ── Balance mutations (called from ExpensesService) ───────────

  /**
   * Add `amount` to a specific allocation (income flow).
   * Runs inside an existing EntityManager transaction if provided.
   */
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

  /**
   * Subtract `amount` from the allocation linked to `categoryId` (expense flow).
   * Returns the allocation that was debited (or null if no allocation is linked).
   */
  async debitByCategory(categoryId: string, userId: string, amount: number, em?: EntityManager) {
    const repo = em ? em.getRepository(Allocation) : this.repo

    // Find allocation that has this category linked
    const allocation = await repo
      .createQueryBuilder('a')
      .innerJoin('a.categories', 'c', 'c.id = :categoryId', { categoryId })
      .where('a.user_id = :userId', { userId })
      .getOne()

    if (!allocation) return null   // no allocation bound — silently skip

    await repo
      .createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => `balance - ${amount}` })
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

  // ── Helper ────────────────────────────────────────────────────
  private async resolveCategories(ids: string[], userId: string): Promise<Category[]> {
    if (!ids.length) return []
    return this.categoryRepo.find({ where: { id: In(ids), userId } })
  }
}
