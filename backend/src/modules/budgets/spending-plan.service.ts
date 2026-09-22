import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm'
import { MonthlySpendingPlan } from './monthly-spending-plan.entity'
import { User } from '../users/user.entity'
import { localToday, safeTimezone } from '../../common/local-date.util'
import { lockLedger } from '../../common/ledger-lock.util'

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

    const previous = await this.plans.findOne({
      where: { userId, month: LessThanOrEqual(month) },
      order: { month: 'DESC' },
    })
    if (previous) {
      return {
        month,
        state: previous.totalAmount === null ? 'empty' : previous.month === month ? 'explicit' : 'inherited',
        sourceMonth: previous.month === month ? null : previous.month,
        totalAmount: previous.totalAmount === null ? null : Number(previous.totalAmount),
      }
    }

    // Dual-read window: accounts whose plan still lives on the legacy user column, and
    // only for the month they are actually in — the column carries no month of its own,
    // so projecting it backwards would invent history.
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone', 'monthlySpendingLimit'] })
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
  async setTotal(userId: string, month: string, totalAmount: number | null, manager?: EntityManager): Promise<EffectivePlan> {
    this.assertMonth(month)

    if (totalAmount !== null && (!Number.isFinite(totalAmount) || !(totalAmount > 0))) {
      throw new BadRequestException('Monthly total must be greater than 0')
    }
    const write = async (em: EntityManager) => {
      const user = await lockLedger(em, userId)
      // A null row is an explicit stop: deleting it would resurrect a previous plan.
      await em.getRepository(MonthlySpendingPlan).upsert(
        { userId, month, totalAmount },
        { conflictPaths: ['userId', 'month'], skipUpdateIfNoValuesChanged: false },
      )
      if (month === localToday(safeTimezone(user.timezone)).slice(0, 7)) {
        await em.update(User, userId, { monthlySpendingLimit: totalAmount })
      }
    }
    if (manager) await write(manager)
    else await this.plans.manager.transaction(write)
    return { month, state: totalAmount === null ? 'empty' : 'explicit', sourceMonth: null, totalAmount }
  }
}
