import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { MonthlySpendingPlan } from './monthly-spending-plan.entity'
import { User } from '../users/user.entity'
import { localToday, safeTimezone } from '../../common/local-date.util'

export type PlanState = 'explicit' | 'inherited' | 'empty'

export interface EffectivePlan {
  month: string
  state: PlanState
  /** Which month the figure came from when `state` is `inherited`. */
  sourceMonth: string | null
  /** `null` when no plan exists — never 0, which would mean "spend nothing". */
  totalAmount: number | null
}

/**
 * Resolves "what is the spending total for this month".
 *
 * A new month inherits the most recent explicit plan automatically rather than starting
 * blank. Re-entering the same number every 1st is the chore that made the old budget
 * screen go cold after one month, and a home screen that loses its daily figure on the
 * 1st is worse than one that carries a slightly stale number the user can adjust.
 *
 * Inheritance only ever looks *backwards*. Scrolling to a month before the user had any
 * plan shows nothing, rather than projecting today's figure onto their history.
 */
@Injectable()
export class SpendingPlanService {
  constructor(
    @InjectRepository(MonthlySpendingPlan)
    private readonly plans: Repository<MonthlySpendingPlan>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  static readonly MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

  assertMonth(month: string): string {
    if (!SpendingPlanService.MONTH_PATTERN.test(month)) {
      throw new BadRequestException('month must be YYYY-MM')
    }
    return month
  }

  /** The user's current calendar month, in their own timezone. */
  async currentMonth(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    return localToday(safeTimezone(user?.timezone)).slice(0, 7)
  }

  async resolve(userId: string, month: string): Promise<EffectivePlan> {
    this.assertMonth(month)

    const explicit = await this.plans.findOne({ where: { userId, month } })
    if (explicit) {
      return { month, state: 'explicit', sourceMonth: null, totalAmount: Number(explicit.totalAmount) }
    }

    const previous = await this.plans.findOne({
      where: { userId, month: LessThan(month) },
      order: { month: 'DESC' },
    })
    if (previous) {
      return {
        month,
        state: 'inherited',
        sourceMonth: previous.month,
        totalAmount: Number(previous.totalAmount),
      }
    }

    // Dual-read window: accounts whose plan still lives on the legacy user column, and
    // only for the month they are actually in — the column carries no month of its own,
    // so projecting it backwards would invent history.
    const user = await this.users.findOne({ where: { id: userId } })
    const legacy = user?.monthlySpendingLimit == null ? null : Number(user.monthlySpendingLimit)
    if (legacy && legacy > 0) {
      const current = localToday(safeTimezone(user?.timezone)).slice(0, 7)
      if (month === current) {
        return { month, state: 'explicit', sourceMonth: null, totalAmount: legacy }
      }
    }

    return { month, state: 'empty', sourceMonth: null, totalAmount: null }
  }

  /**
   * Writes the total for a month.
   *
   * `null` clears the plan for that month — which is not the same as setting 0, and the
   * table forbids 0 for exactly that reason.
   */
  async setTotal(userId: string, month: string, totalAmount: number | null): Promise<EffectivePlan> {
    this.assertMonth(month)

    if (totalAmount === null) {
      await this.plans.delete({ userId, month })
    } else {
      if (!(totalAmount > 0)) throw new BadRequestException('Monthly total must be greater than 0')
      const existing = await this.plans.findOne({ where: { userId, month } })
      if (existing) {
        existing.totalAmount = totalAmount
        await this.plans.save(existing)
      } else {
        await this.plans.save(this.plans.create({ userId, month, totalAmount }))
      }
    }

    // Keep the legacy column in step while other readers migrate. Only the current month
    // may write it, since the column cannot represent any other.
    const current = await this.currentMonth(userId)
    if (month === current) {
      await this.users.update(userId, { monthlySpendingLimit: totalAmount })
    }

    return this.resolve(userId, month)
  }
}
