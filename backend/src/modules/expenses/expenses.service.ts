import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource, EntityManager } from 'typeorm'
import { Expense } from './expense.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { AllocationsService } from '../allocations/allocations.service'
import { BillPayment } from '../planning/planning.entity'
import { lockLedger } from '../../common/ledger-lock.util'
import { CreateExpenseDto, UpdateExpenseDto, QueryExpenseDto } from './dto/expense.dto'
import {
  safeTimezone, localToday, monthRangePredicate, yearRangePredicate, monthSpanPredicate,
} from '../../common/local-date.util'

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly repo: Repository<Expense>,
    private readonly allocations: AllocationsService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Queries ───────────────────────────────────────────────────
  /**
   * Month/year filtering follows the user's own calendar and stays index-friendly.
   *
   * `TO_CHAR(e.occurred_at, 'YYYY-MM') = :month` formatted in the *server's* zone, so
   * History filed everything a Bangkok user recorded between 00:00 and 07:00 under the
   * previous day — while the home screen, which did use `AT TIME ZONE`, showed it under
   * today. Same data, two answers, depending on the screen. Wrapping the column also
   * stopped `idx_expenses_user_occurred` from being usable for the range.
   */
  async findAll(userId: string, query: QueryExpenseDto, em = this.dataSource.manager): Promise<Expense[]> {
    const user = await em.getRepository(User)
      .findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    const tz = safeTimezone(user?.timezone)

    const qb = em.getRepository(Expense)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoinAndSelect('e.allocation', 'allocation')
      .where('e.user_id = :userId', { userId })
      // Entity property names, not column names.
      //
      // `take`/`skip` alongside `leftJoinAndSelect` makes TypeORM paginate over a
      // distinct-id subquery, and to build it, it resolves every ORDER BY term through
      // the entity metadata. A raw column name (`e.occurred_at`) has no property to
      // resolve to, and it fails with `Cannot read properties of undefined (reading
      // 'databaseName')` — a 500 on every list request. Without pagination the raw name
      // passed straight through, which is why it worked before.
      .orderBy('e.occurredAt', 'DESC')
      // A stable tiebreaker. Two entries stamped the same second came back in whatever
      // order the plan happened to produce, so the list reshuffled between refreshes.
      .addOrderBy('e.createdAt', 'DESC')
      .addOrderBy('e.id', 'DESC')
      // Unbounded before this. A long-running account made History fetch and serialise
      // every row it had ever written, in one response.
      .take(query.limit ?? 500)
      .skip(query.offset ?? 0)

    if (query.type)       qb.andWhere('e.type = :type', { type: query.type })
    if (query.categoryId) qb.andWhere('e.category_id = :categoryId', { categoryId: query.categoryId })

    if (query.from && query.to) {
      // Inclusive month range, e.g. 2026-01 → 2026-06
      const [lo, hi] = query.from <= query.to
        ? [query.from, query.to]
        : [query.to, query.from]
      qb.andWhere(monthSpanPredicate('e.occurred_at', ':lo', ':hi', ':tz')).setParameters({ lo, hi, tz })
    } else if (query.month) {
      qb.andWhere(monthRangePredicate('e.occurred_at', ':month', ':tz')).setParameters({ month: query.month, tz })
    } else if (query.year) {
      qb.andWhere(yearRangePredicate('e.occurred_at', ':year', ':tz')).setParameters({ year: query.year, tz })
    }
    return qb.getMany()
  }

  /** One database snapshot, complete or explicitly rejected; never a partial backup. */
  async exportAll(userId: string, query: QueryExpenseDto): Promise<Expense[]> {
    return this.dataSource.transaction('REPEATABLE READ', async em => {
      const rows = await this.findAll(userId, { ...query, limit: 50001, offset: 0 }, em)
      if (rows.length > 50000) throw new BadRequestException('Export exceeds 50,000 entries. Choose a shorter date range.')
      return rows
    })
  }

  async findOne(id: string, userId: string): Promise<Expense> {
    const e = await this.repo.findOne({
      where: { id, userId },
      relations: ['category', 'allocation'],
    })
    if (!e) throw new NotFoundException(`Expense ${id} not found`)
    return e
  }

  /**
   * Load an expense for mutation, inside the caller's transaction, holding a row lock.
   *
   * `update` and `remove` used to call `findOne` above, which goes through `this.repo` —
   * a different EntityManager from the transaction wrapping them. So the read happened
   * outside the transaction and took no lock: two concurrent DELETEs both saw the row,
   * both credited the amount back to `totalBalance`, and the balance ended up one whole
   * transaction too high. That is reachable in normal use, because the offline queue
   * retries whenever a response goes missing.
   *
   * `lock` cannot be combined with eager relations in TypeORM, so the relation ids are
   * read from the columns and any needed relation is loaded separately.
   */
  private async findOneForUpdate(em: EntityManager, id: string, userId: string): Promise<Expense> {
    const e = await em.getRepository(Expense)
      .createQueryBuilder('e')
      .setLock('pessimistic_write')
      .where('e.id = :id AND e.user_id = :userId', { id, userId })
      .getOne()
    if (!e) throw new NotFoundException(`Expense ${id} not found`)
    return e
  }

  /** Reject a categoryId that isn't one of the caller's own categories. */
  private async assertCategoryOwned(em: EntityManager, categoryId: string, userId: string): Promise<Category> {
    const category = await em.findOne(Category, { where: { id: categoryId, userId } })
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`)
    return category
  }

  // ── Create ────────────────────────────────────────────────────
  // NEW FLOW:
  //   income  → user.total_balance += amount
  //             + allocation.balance += amount (if category is linked to an income wallet)
  //   expense → user.total_balance -= amount
  //             + allocation.balance -= amount (if category is linked to a wallet)
  async create(dto: CreateExpenseDto, userId: string): Promise<Expense> {
    // A replay of a create whose response never made it back to the client must not
    // produce a second transaction — and must not move the balance a second time either.
    // Checked before the transaction so the common path (no key) costs nothing.
    if (dto.clientKey) {
      const existing = await this.repo.findOne({
        where: { userId, clientKey: dto.clientKey },
        relations: ['category', 'allocation'],
      })
      if (existing) return existing
    }

    return this.dataSource.transaction(em => this.createInTransaction(dto, userId, em))
  }

  /** Shared ledger writer for bill payments and REST captures. Caller owns the transaction. */
  async createInTransaction(dto: CreateExpenseDto, userId: string, em: EntityManager): Promise<Expense> {
    await lockLedger(em, userId)
    if (dto.clientKey) {
      const existing = await em.findOne(Expense, { where: { userId, clientKey: dto.clientKey }, loadEagerRelations: false })
      if (existing) return existing
    }
    const category = await this.assertCategoryOwned(em, dto.categoryId, userId)

    // An income recorded against an expense category (or the reverse) still moved
    // `totalBalance`, but no envelope could match it and every chart filed it under a
    // category of the opposite kind. Nothing rejected it, so the only symptom was
    // numbers that did not add up.
    if (category.type !== dto.type) {
      throw new BadRequestException(
        `Category "${category.name}" is an ${category.type} category — it cannot be used for an ${dto.type}`,
      )
    }

    // `allocationId` is never taken from the DTO. The envelope is resolved from the
    // category link, and accepting a client-supplied one would let a request move a
    // wallet that the category is not linked to — silently, since the two would then
    // disagree on every later edit. The DTO field is kept only so old clients that
    // still send it do not trip `forbidNonWhitelisted`.
    const { allocationId: _ignoredAllocationId, ...rest } = dto

    const allocationId = await this.applyEffect(
      em, userId, dto.type, dto.amount, dto.categoryId,
    )

    const expense = em.create(Expense, { ...rest, userId, allocationId })
    return em.save(Expense, expense)
  }

  /**
   * `create`, with the duplicate-key race handled outside the transaction.
   *
   * Two replays of the same offline capture can both pass the pre-check and reach the
   * INSERT; one loses to the partial unique index on `(user_id, client_key)`. Letting the
   * violation propagate rolls the loser's transaction back — which is exactly right, its
   * balance changes must not stick — but the caller still asked a question that has a
   * correct answer: the row the winner wrote. Resolving it here rather than inside the
   * transaction means the rollback has already happened before we read.
   *
   * The client must not see an error for this. The offline queue treats any response-
   * bearing rejection as "the server refused it" and eventually discards the entry, so a
   * 409 here would delete a transaction the user did record.
   */
  async createIdempotent(dto: CreateExpenseDto, userId: string): Promise<Expense> {
    try {
      return await this.create(dto, userId)
    } catch (err: any) {
      if (err?.code === '23505' && dto.clientKey) {
        const winner = await this.repo.findOne({
          where: { userId, clientKey: dto.clientKey },
          relations: ['category', 'allocation'],
        })
        if (winner) return winner
      }
      throw err
    }
  }

  // ── Update ────────────────────────────────────────────────────
  async update(id: string, dto: UpdateExpenseDto, userId: string): Promise<Expense> {
    return this.dataSource.transaction(async (em: EntityManager) => {
      const user = await lockLedger(em, userId)
      const expense = await this.findOneForUpdate(em, id, userId)

      // Validate the pair the row will *end up* with, not just what the patch mentions.
      // Changing only `type`, or only `categoryId`, can produce a mismatch neither field
      // looks wrong on its own — an income filed under an expense category, which no
      // envelope can match and every chart misfiles.
      const finalCategoryId = dto.categoryId ?? expense.categoryId
      const finalType = dto.type ?? expense.type
      if (finalCategoryId) {
        const category = await this.assertCategoryOwned(em, finalCategoryId, userId)
        if (category.type !== finalType) {
          throw new BadRequestException(
            `Category "${category.name}" is an ${category.type} category — it cannot be used for an ${finalType}`,
          )
        }
      }

      if (dto.type !== undefined || dto.occurredAt !== undefined) {
        const payment = await em.findOne(BillPayment, { where: { expenseId: id, userId } })
        if (payment && (finalType !== 'expense' || localToday(safeTimezone(user.timezone),
          new Date(dto.occurredAt ?? expense.occurredAt)).slice(0, 7) !==
          localToday(safeTimezone(user.timezone), new Date(expense.occurredAt)).slice(0, 7))) {
          throw new BadRequestException('A bill payment must remain an expense in its payment month')
        }
      }

      const oldAmount = Number(expense.amount)
      const newAmount = dto.amount ?? oldAmount
      const routingChanged = finalType !== expense.type || finalCategoryId !== expense.categoryId
      if (routingChanged) {
        await this.reverseEffect(em, userId, expense.type, oldAmount, expense.allocationId)
        expense.allocationId = await this.applyEffect(em, userId, finalType, newAmount, finalCategoryId)
      } else if (newAmount !== oldAmount) {
        // Amount edits keep the original wallet, even after a category is relinked.
        // Applying only the delta also avoids transient overdrafts during a reversal.
        const delta = Math.round((newAmount - oldAmount) * 100) / 100
        const balanceDelta = expense.type === 'income' ? delta : -delta
        await em.increment(User, { id: userId }, 'totalBalance', balanceDelta)
        if (expense.allocationId) await this.allocations.credit(expense.allocationId, userId, balanceDelta, em)
      }

      // Metadata-only edits never touch balances or resolve today's wallet links.
      const { allocationId: _ignoredAllocationId, ...patch } = dto
      Object.assign(expense, patch)
      return em.save(Expense, expense)
    })
  }

  // ── Delete ────────────────────────────────────────────────────
  async remove(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      await lockLedger(em, userId)
      const expense = await this.findOneForUpdate(em, id, userId)
      await this.reverseEffect(
        em, userId, expense.type, Number(expense.amount), expense.allocationId,
      )
      await em.delete(Expense, { id: expense.id, userId })
    })
  }

  // ── Balance effects ───────────────────────────────────────────

  /**
   * Undo what a stored transaction did to the balances.
   *
   * Only `expenses.allocation_id` is consulted — the wallet that was actually moved when
   * the row was written. The previous version fell back to "look up whichever wallet this
   * category is linked to *now*" whenever `allocation_id` was null, which quietly invented
   * money in two ways:
   *
   *   - Record an expense under an unlinked category, later link that category to a
   *     wallet, then edit or delete the expense → the fallback credited a wallet that had
   *     never been debited.
   *   - Delete the wallet an expense was tied to. The FK is ON DELETE SET NULL, so
   *     `allocation_id` became null and the same fallback fired against a different wallet.
   *
   * A null `allocation_id` means "no envelope was moved", and the correct reversal for
   * that is to move no envelope. It also matches how `AccountService.recomputeBalances`
   * rebuilds these figures, so the live path and the repair path finally agree.
   */
  private async reverseEffect(
    em: EntityManager,
    userId: string,
    type: string,
    amount: number,
    allocationId: string | null | undefined,
  ): Promise<void> {
    if (type === 'income') {
      await em.decrement(User, { id: userId }, 'totalBalance', amount)
      if (allocationId) await this.allocations.reverseCredit(allocationId, userId, amount, em)
    } else {
      await em.increment(User, { id: userId }, 'totalBalance', amount)
      if (allocationId) await this.allocations.credit(allocationId, userId, amount, em)
    }
  }

  /** Apply a transaction's effect and return the wallet it actually moved, if any. */
  private async applyEffect(
    em: EntityManager,
    userId: string,
    type: string,
    amount: number,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (type === 'income') {
      await em.increment(User, { id: userId }, 'totalBalance', amount)
      if (!categoryId) return null
      const credited = await this.allocations.creditByIncomeCategory(categoryId, userId, amount, em)
      return credited?.id ?? null
    }
    await em.decrement(User, { id: userId }, 'totalBalance', amount)
    if (!categoryId) return null
    const debited = await this.allocations.debitByCategory(categoryId, userId, amount, em)
    return debited?.id ?? null
  }
}
