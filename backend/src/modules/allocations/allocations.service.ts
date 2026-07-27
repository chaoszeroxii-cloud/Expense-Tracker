import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In, DataSource, EntityManager } from 'typeorm'
import { Allocation } from './allocation.entity'
import { AllocationMovement } from './allocation-movement.entity'
import { AllocationPlan } from './allocation-plan.entity'
import { Category } from '../categories/category.entity'
import { User } from '../users/user.entity'
import { CreateAllocationDto, UpdateAllocationDto } from './allocation.dto'
import { round2 } from '../../common/money.util'
import { localToday, safeTimezone } from '../../common/local-date.util'
import { normalizeMdiIconId } from '../../common/icon.util'

@Injectable()
export class AllocationsService {
  constructor(
    @InjectRepository(Allocation)
    private readonly repo: Repository<Allocation>,

    @InjectRepository(AllocationMovement)
    private readonly movementRepo: Repository<AllocationMovement>,

    @InjectRepository(AllocationPlan)
    private readonly planRepo: Repository<AllocationPlan>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

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
      icon: normalizeMdiIconId(dto.icon, 'wallet'),
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
    if (dto.icon  !== undefined) allocation.icon  = normalizeMdiIconId(dto.icon, 'wallet')
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

    return this.dataSource.transaction(async (em: EntityManager) => {
      const userRepo  = em.getRepository(User)
      const allocRepo = em.getRepository(Allocation)

      // Lock the user row so concurrent allocations for the same user serialize
      // — prevents two requests both passing the capacity check and over-funding.
      const user = await userRepo.createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.id = :userId', { userId })
        .getOne()
      if (!user) throw new NotFoundException('User not found')

      const target = await allocRepo.findOne({ where: { id: allocationId, userId } })
      if (!target) throw new NotFoundException(`Allocation ${allocationId} not found`)

      const allAllocations = await allocRepo.find({ where: { userId } })
      const totalAllocated = allAllocations.reduce((s: number, a: Allocation) => s + Number(a.balance), 0)
      const unallocated = round2(Number(user.totalBalance) - totalAllocated)

      if (amount > unallocated) {
        // Negative unallocated = wallets hold more than the real balance.
        // The user must return funds from a wallet before allocating more.
        const message = unallocated < 0
          ? `Over-allocated by ฿${Math.abs(unallocated).toFixed(2)}. Return funds from a wallet before allocating more.`
          : `Insufficient unallocated balance. Available: ฿${unallocated.toFixed(2)}`
        throw new BadRequestException(message)
      }

      // Credit the wallet — no totalBalance change needed
      await this.credit(allocationId, userId, amount, em)
      await em.save(AllocationMovement, em.create(AllocationMovement, { userId, allocationId, amount, type: 'fund' }))

      return { unallocatedBalance: round2(unallocated - amount) }
    })
  }

  // ── Transfer between wallets ──────────────────────────────────
  async transferBetweenAllocations(sourceId: string, targetId: string, userId: string, amount: number): Promise<void> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive')
    if (sourceId === targetId) throw new BadRequestException('Cannot transfer to the same wallet')

    await this.dataSource.transaction(async (em: EntityManager) => {
      const allocRepo = em.getRepository(Allocation)

      // Atomic guarded debit: only succeeds if the wallet is owned and has funds.
      const debit = await allocRepo.createQueryBuilder()
        .update(Allocation)
        .set({ balance: () => 'balance - :delta' })
        .where('id = :id AND user_id = :userId AND balance >= :delta', { id: sourceId, userId })
        .setParameter('delta', amount)
        .execute()

      if (debit.affected === 0) {
        const src = await allocRepo.findOne({ where: { id: sourceId, userId } })
        if (!src) throw new NotFoundException(`Allocation ${sourceId} not found`)
        throw new BadRequestException(`Insufficient balance. Available: ฿${Number(src.balance).toFixed(2)}`)
      }

      // Credit throws (→ rollback) if the target is missing or not owned.
      await this.credit(targetId, userId, amount, em)
      await em.save(AllocationMovement, [
        em.create(AllocationMovement, { userId, allocationId: sourceId, amount, type: 'transfer_out' }),
        em.create(AllocationMovement, { userId, allocationId: targetId, amount, type: 'transfer_in' }),
      ])
    })
  }

  // ── Return wallet funds to unallocated pool ───────────────────
  async unallocateFromAllocation(allocationId: string, userId: string, amount: number): Promise<void> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive')

    await this.dataSource.transaction(async (em: EntityManager) => {
      const allocRepo = em.getRepository(Allocation)

      const debit = await allocRepo.createQueryBuilder()
        .update(Allocation)
        .set({ balance: () => 'balance - :delta' })
        .where('id = :id AND user_id = :userId AND balance >= :delta', { id: allocationId, userId })
        .setParameter('delta', amount)
        .execute()

      if (debit.affected === 0) {
        const a = await allocRepo.findOne({ where: { id: allocationId, userId } })
        if (!a) throw new NotFoundException(`Allocation ${allocationId} not found`)
        throw new BadRequestException(`Insufficient balance. Available: ฿${Number(a.balance).toFixed(2)}`)
      }

      await em.save(AllocationMovement, em.create(AllocationMovement, { userId, allocationId, amount, type: 'unallocate' }))
    })
  }

  // ── Balance mutations (called from ExpensesService) ───────────

  /** Add `amount` to a specific allocation (income flow). */
  async credit(allocationId: string, userId: string, amount: number, em?: EntityManager) {
    const repo = em ? em.getRepository(Allocation) : this.repo
    const result = await repo
      .createQueryBuilder()
      .update(Allocation)
      .set({ balance: () => 'balance + :delta' })
      .where('id = :id AND user_id = :userId', { id: allocationId, userId })
      .setParameter('delta', amount)
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
      .set({ balance: () => 'balance - :delta' })
      .where('id = :id', { id: allocation.id })
      .setParameter('delta', amount)
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
      .set({ balance: () => 'balance + :delta' })
      .where('id = :id', { id: allocation.id })
      .setParameter('delta', amount)
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

  // ── Apply Last Month's Plan ────────────────────────────────────
  // See docs/adr/0001-allocation-plan-explicit-not-derived.md for why this
  // is a stored value rather than derived purely from AllocationMovement.
  /** The user's own calendar month. A UTC month is wrong for 7 hours a day here. */
  private async currentMonthFor(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    return localToday(safeTimezone(user?.timezone)).slice(0, 7)
  }

  async previewApplyPlan(userId: string) {
    const currentMonth = await this.currentMonthFor(userId)

    // This month's own targets win; otherwise carry the most recent earlier month
    // forward so a new month starts with the split the user already decided on.
    const explicitRows = await this.planRepo.find({ where: { userId, month: currentMonth } })

    let sourceMonth: string | null = null
    let planRows = explicitRows
    let state: 'explicit' | 'inherited' | 'empty' = explicitRows.length > 0 ? 'explicit' : 'empty'

    if (explicitRows.length === 0) {
      const lastPlanRow = await this.planRepo
        .createQueryBuilder('p')
        .select('p.month', 'month')
        .where('p.user_id = :userId', { userId })
        .andWhere('p.month < :currentMonth', { currentMonth })
        .orderBy('p.month', 'DESC')
        .limit(1)
        .getRawOne()

      sourceMonth = lastPlanRow?.month ?? null
      if (sourceMonth) {
        planRows = await this.planRepo.find({ where: { userId, month: sourceMonth } })
        state = 'inherited'
      }
    }

    const [allocations, fundedMap, unallocatedBalance] = await Promise.all([
      this.repo.find({ where: { userId }, order: { name: 'ASC' } }),
      this.getFundedThisMonthMap(userId, currentMonth),
      this.getUnallocated(userId),
    ])

    const planMap = new Map(planRows.map((p) => [p.allocationId, Number(p.amount)]))

    const items = allocations.map((a) => {
      const targetAmount    = planMap.get(a.id) ?? 0
      const fundedThisMonth = fundedMap.get(a.id) ?? 0
      return {
        allocationId: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        balance: Number(a.balance),
        targetAmount,
        fundedThisMonth,
        /** What topping this wallet up to its target would still cost. */
        remainingToFund: round2(Math.max(0, targetAmount - fundedThisMonth)),
        // Retained for the previous client contract during the rollout.
        planAmount: targetAmount,
        suggested: round2(Math.max(0, targetAmount - fundedThisMonth)),
      }
    })

    return {
      month: currentMonth,
      state,
      sourceMonth,
      unallocatedBalance,
      items,
      totalTarget: round2(items.reduce((s, i) => s + i.targetAmount, 0)),
      totalRemainingToFund: round2(items.reduce((s, i) => s + i.remainingToFund, 0)),
    }
  }

  async applyPlan(userId: string, amounts: { allocationId: string; amount: number }[]) {
    const currentMonth = await this.currentMonthFor(userId)

    return this.dataSource.transaction(async (em: EntityManager) => {
      const allocRepo = em.getRepository(Allocation)
      const userRepo  = em.getRepository(User)

      // Lock the user row so this can't race with moveToAllocation / another apply.
      const user = await userRepo.createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.id = :userId', { userId })
        .getOne()
      if (!user) throw new NotFoundException('User not found')

      const allocations = await allocRepo.find({ where: { userId } })
      const ownedIds = new Set(allocations.map((a) => a.id))
      for (const { allocationId } of amounts) {
        if (!ownedIds.has(allocationId)) throw new NotFoundException(`Allocation ${allocationId} not found`)
      }

      const totalAllocated = allocations.reduce((s: number, a: Allocation) => s + Number(a.balance), 0)
      const unallocated   = round2(Number(user.totalBalance) - totalAllocated)
      const sumRequested  = round2(amounts.reduce((s, a) => s + a.amount, 0))

      // Only gate on capacity when something is actually being requested —
      // an all-zero submission (e.g. re-syncing the plan) never needs unallocated room.
      if (sumRequested > 0 && sumRequested > unallocated) {
        const message = unallocated < 0
          ? `Over-allocated by ฿${Math.abs(unallocated).toFixed(2)}. Return funds from a wallet before applying the plan.`
          : `Insufficient unallocated balance. Available: ฿${unallocated.toFixed(2)}, needed: ฿${sumRequested.toFixed(2)}`
        throw new BadRequestException(message)
      }

      for (const { allocationId, amount } of amounts) {
        if (amount <= 0) continue
        await this.credit(allocationId, userId, amount, em)
        await em.save(AllocationMovement, em.create(AllocationMovement, { userId, allocationId, amount, type: 'fund' }))
      }

      // Targets are NOT touched here.
      //
      // This used to overwrite AllocationPlan.amount with the month's net funded figure,
      // which is `fund + transfer_in − unallocate − transfer_out`. So topping a wallet up
      // mid-month, pulling money back, or transferring between wallets all silently
      // rewrote next month's template — precisely what ADR 0001 introduced a stored plan
      // to prevent. Intent is written only by saveTargets(), never as a side effect of
      // moving money.
      return { unallocatedBalance: round2(unallocated - sumRequested) }
    })
  }

  /**
   * Records how much each wallet is *meant* to hold from this month's funding.
   *
   * Deliberately moves no money and checks no capacity: a plan is a statement of intent,
   * and the user has to be able to write one down before the money exists. The old flow
   * could only persist a plan as a by-product of a successful transfer, so anyone whose
   * unallocated pool sat at ฿0 could open the planner, type figures, and never enable the
   * confirm button — the plan they were promised would "be remembered next month" could
   * not be saved at all.
   */
  async saveTargets(
    userId: string,
    month: string,
    items: { allocationId: string; targetAmount: number }[],
  ) {
    const owned = await this.repo.find({ where: { userId } })
    const ownedIds = new Set(owned.map((a) => a.id))
    for (const { allocationId } of items) {
      if (!ownedIds.has(allocationId)) throw new NotFoundException(`Allocation ${allocationId} not found`)
    }
    if (new Set(items.map((i) => i.allocationId)).size !== items.length) {
      throw new BadRequestException('Duplicate allocation in request')
    }

    return this.dataSource.transaction(async (em: EntityManager) => {
      // A full snapshot: wallets left out of the payload have their target for this
      // month removed, so dropping one does not resurrect it from an older row.
      await em.delete(AllocationPlan, { userId, month })

      const rows = items
        .filter((i) => i.targetAmount > 0)
        .map((i) => em.create(AllocationPlan, {
          userId,
          allocationId: i.allocationId,
          month,
          amount: i.targetAmount,
        }))

      if (rows.length > 0) await em.save(AllocationPlan, rows)
      return { saved: rows.length }
    })
  }

  // ── Helper ────────────────────────────────────────────────────
  private async resolveCategories(ids: string[], userId: string): Promise<Category[]> {
    if (!ids.length) return []
    return this.categoryRepo.find({ where: { id: In(ids), userId } })
  }

  private async getUnallocated(userId: string, em?: EntityManager): Promise<number> {
    const userRepo  = em ? em.getRepository(User) : this.dataSource.getRepository(User)
    const allocRepo = em ? em.getRepository(Allocation) : this.repo

    const [user, allocations] = await Promise.all([
      userRepo.findOne({ where: { id: userId } }),
      allocRepo.find({ where: { userId } }),
    ])
    if (!user) throw new NotFoundException('User not found')

    const totalAllocated = allocations.reduce((s: number, a: Allocation) => s + Number(a.balance), 0)
    return round2(Number(user.totalBalance) - totalAllocated)
  }

  private async getFundedThisMonthMap(
    userId: string, month: string, em?: EntityManager, allocationIds?: string[],
  ): Promise<Map<string, number>> {
    const userRepo = em ? em.getRepository(User) : this.userRepo
    const user = await userRepo.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    const tz = safeTimezone(user?.timezone)

    const repo = em ? em.getRepository(AllocationMovement) : this.movementRepo
    const qb = repo
      .createQueryBuilder('m')
      .select([
        'm.allocation_id AS "allocationId"',
        `SUM(CASE WHEN m.type IN ('fund', 'transfer_in') THEN m.amount WHEN m.type IN ('unallocate', 'transfer_out') THEN -m.amount ELSE 0 END) AS "funded"`,
      ])
      .where('m.user_id = :userId', { userId })
      // Grouped in the user's own timezone, matching every other month boundary in the
      // app. A UTC month files a late-evening movement on the 31st under the next one.
      .andWhere("TO_CHAR(m.created_at AT TIME ZONE :tz, 'YYYY-MM') = :month", { month, tz })
      .groupBy('m.allocation_id')

    if (allocationIds?.length) {
      qb.andWhere('m.allocation_id IN (:...allocationIds)', { allocationIds })
    }

    const rows = await qb.getRawMany()
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.allocationId, parseFloat(r.funded) || 0)
    return map
  }
}
