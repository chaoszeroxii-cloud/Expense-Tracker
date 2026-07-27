import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import axios from 'axios';
import { Expense } from '../expenses/expense.entity';
import { AllocationMovement } from '../allocations/allocation-movement.entity';
import { Allocation } from '../allocations/allocation.entity';
import { User } from '../users/user.entity';
import { round2 } from '../../common/money.util';
import { safeTimezone, localToday, shiftDate } from '../../common/local-date.util';
import { CheckinsService, Coverage } from '../checkins/checkins.service';
import { SpendingPlanService } from '../budgets/spending-plan.service';

export interface AiRecommendation {
  type: 'warning' | 'tip' | 'good';
  title: string;
  body: string;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  label: string;
  expense: number;
  income: number;
  net: number;
}

export interface DailySummary {
  date: string;
  expense: number;
  income: number;
  net: number;
}

export interface PeriodSummary {
  totalExpense: number;
  totalIncome: number;
  net: number;
  transactionCount: number;
  avgPerDay: number;
}

export interface BalanceSummary {
  totalBalance: number;
  /** Net of any deficits — `positiveWalletBalance − walletDeficit`. */
  allocatedBalance: number;
  unallocatedBalance: number;
  /** Sum of wallets in credit. */
  positiveWalletBalance: number;
  /** Sum of the shortfalls, as a positive number. */
  walletDeficit: number;
  negativeWalletCount: number;
}

export interface DailyBriefTransaction {
  id: string;
  amount: number;
  type: 'expense' | 'income';
  note: string | null;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface WeeklyReview {
  timezone: string
  /** Inclusive `YYYY-MM-DD` bounds of the seven days ending today. */
  from: string
  to: string
  thisWeek: number
  lastWeek: number
  /** `thisWeek - lastWeek`; negative means spending came down. */
  delta: number
  deltaPct: number | null
  topCategory: { name: string; icon: string | null; color: string | null; total: number; share: number } | null
  biggestDay: { date: string; total: number } | null
  dailyAverage: number
  /** One deterministic suggestion, or null when the data does not support one. */
  action:
    | { kind: 'reduce_category'; categoryName: string; amount: number }
    | { kind: 'spending_down'; amount: number }
    | { kind: 'over_plan'; amount: number }
    | { kind: 'set_plan' }
    | { kind: 'need_more_data' }
    | null
}

export interface DailyBrief {
  date: string;
  timezone: string;
  mode: 'plan' | 'track_only';
  spentToday: number;
  monthSpent: number;
  /** `null` when no plan is set — never 0, which would read as "spend nothing". */
  monthlyLimit: number | null;
  /** `null` when no plan is set. Always a *planned* allowance, never real cash. */
  safeToday: number | null;
  daysRemaining: number;
  planStatus: 'no_plan' | 'on_track' | 'close' | 'over';
  transactionsToday: number;
  recentCategoryIds: string[];
  recentTransactions: DailyBriefTransaction[];
  /** Hourly rate for the work-time lens; `null` until the user supplies an income. */
  hourlyRate: number | null;
  showWorkTime: boolean;
  /** Seven-day check-in coverage. Folded in here so Home stays a single request. */
  coverage: Coverage;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Expense)
    private readonly repo: Repository<Expense>,
    @InjectRepository(AllocationMovement)
    private readonly movementRepo: Repository<AllocationMovement>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly checkins: CheckinsService,
    private readonly spendingPlan: SpendingPlanService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── 0. Daily brief — the single request behind the home screen ───────────
  //
  // Home used to mount eleven requests (seven of its own, three from the wallet
  // widget, one plan preview) before it could show anything. This replaces the
  // above-the-fold portion with one round trip: two aggregate queries plus a
  // short recent-activity list.
  //
  // Everything is computed in the user's own timezone. A UTC "today" reports
  // yesterday's spending until 07:00 in Asia/Bangkok.
  async getDailyBrief(userId: string): Promise<DailyBrief> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const tz = safeTimezone(user.timezone);
    const today = localToday(tz);                 // YYYY-MM-DD
    const month = today.slice(0, 7);              // YYYY-MM
    const [y, m, d] = today.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysRemaining = daysInMonth - d + 1;    // includes today

    // `occurred_at AT TIME ZONE $tz` turns the stored timestamptz into the
    // user's wall clock, so day and month boundaries land where they expect.
    const totals = await this.repo
      .createQueryBuilder('e')
      .select([
        `COALESCE(SUM(CASE WHEN e.type = 'expense' AND (e.occurred_at AT TIME ZONE :tz)::date = :today::date THEN e.amount ELSE 0 END), 0) AS "spentToday"`,
        `COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS "monthSpent"`,
        `COALESCE(SUM(CASE WHEN e.type = 'expense' AND (e.occurred_at AT TIME ZONE :tz)::date < :today::date THEN e.amount ELSE 0 END), 0) AS "spentBeforeToday"`,
        `COUNT(*) FILTER (WHERE (e.occurred_at AT TIME ZONE :tz)::date = :today::date) AS "transactionsToday"`,
      ])
      .where('e.user_id = :userId', { userId })
      .andWhere(`TO_CHAR(e.occurred_at AT TIME ZONE :tz, 'YYYY-MM') = :month`)
      .setParameters({ userId, tz, today, month })
      .getRawOne();

    const spentToday       = round2(parseFloat(totals.spentToday) || 0);
    const monthSpent       = round2(parseFloat(totals.monthSpent) || 0);
    const spentBeforeToday = round2(parseFloat(totals.spentBeforeToday) || 0);
    const transactionsToday = parseInt(totals.transactionsToday) || 0;

    // ── Safe to spend, strictly from the user's own plan ────────────────────
    // Deliberately NOT derived from `totalBalance`: that column starts at zero
    // and only reflects transactions recorded in this app, so a new user goes
    // negative on their first coffee. Calling that "safe to spend" would be a
    // number the user cannot act on.
    //
    // Resolved per month, and inherited from the last month the user set one, so the
    // daily figure keeps working on the 1st instead of vanishing until they re-enter it.
    const effectivePlan = await this.spendingPlan.resolve(userId, month);
    const limitRaw = effectivePlan.totalAmount;
    const hasPlan  = user.trackingMode === 'plan' && limitRaw !== null && limitRaw > 0;

    let safeToday: number | null = null;
    let planStatus: DailyBrief['planStatus'] = 'no_plan';

    if (hasPlan) {
      const remainingBeforeToday = limitRaw! - spentBeforeToday;
      const baseToday = Math.max(0, remainingBeforeToday / daysRemaining);
      safeToday = round2(Math.max(0, baseToday - spentToday));

      if (monthSpent > limitRaw!)      planStatus = 'over';
      else if (safeToday === 0)        planStatus = 'close';
      else if (monthSpent > limitRaw! * 0.8) planStatus = 'close';
      else                             planStatus = 'on_track';
    }

    // ── Categories to offer first in Quick Add ──────────────────────────────
    // Weighted by how often they were used recently rather than pure recency, so
    // a one-off purchase does not displace a daily habit.
    const recentCats = await this.repo
      .createQueryBuilder('e')
      .select(['e.category_id AS "categoryId"'])
      .where('e.user_id = :userId', { userId })
      .andWhere(`e.type = 'expense'`)
      .andWhere('e.category_id IS NOT NULL')
      .andWhere(`e.occurred_at >= NOW() - INTERVAL '60 days'`)
      .groupBy('e.category_id')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('MAX(e.occurred_at)', 'DESC')
      .limit(4)
      .setParameters({ userId })
      .getRawMany();

    const [recent, coverage] = await Promise.all([
      this.repo.find({
        where: { userId },
        relations: ['category'],
        order: { occurredAt: 'DESC', createdAt: 'DESC' },
        take: 3,
      }),
      this.checkins.getCoverage(userId, tz),
    ]);

    // ── Work-time lens ──────────────────────────────────────────────────────
    const income = user.expectedMonthlyIncome === null ? null : Number(user.expectedMonthlyIncome);
    const workHours = Number(user.workHoursPerDay) * Number(user.workDaysPerMonth);
    const hourlyRate = income && income > 0 && workHours > 0 ? round2(income / workHours) : null;

    return {
      date: today,
      timezone: tz,
      mode: user.trackingMode,
      spentToday,
      monthSpent,
      monthlyLimit: hasPlan ? round2(limitRaw!) : null,
      safeToday,
      daysRemaining,
      planStatus,
      transactionsToday,
      recentCategoryIds: recentCats.map((r) => r.categoryId),
      recentTransactions: recent.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        type: e.type as 'expense' | 'income',
        note: e.note ?? null,
        occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : String(e.occurredAt),
        categoryId: e.categoryId ?? null,
        categoryName: e.category?.name ?? null,
        categoryIcon: e.category?.icon ?? null,
        categoryColor: e.category?.color ?? null,
      })),
      hourlyRate,
      showWorkTime: user.showWorkTime,
      coverage,
    };
  }

  // ─── 0b. Weekly review — deterministic, no model involved ─────────────────
  //
  // Plain SQL rather than an LLM: the figures are exact, it costs nothing, it cannot
  // time out, and every line it produces traces back to a query. An LLM would add
  // latency and a bill for arithmetic Postgres already does correctly.
  async getWeeklyReview(userId: string): Promise<WeeklyReview> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const tz = safeTimezone(user.timezone);
    const to = localToday(tz);
    const from = shiftDate(to, -6);
    const prevTo = shiftDate(from, -1);
    const prevFrom = shiftDate(prevTo, -6);

    const day = `(e.occurred_at AT TIME ZONE :tz)::date`;
    const base = () => this.repo
      .createQueryBuilder('e')
      .where('e.user_id = :userId')
      .andWhere(`e.type = 'expense'`)
      .setParameters({ userId, tz, from, to, prevFrom, prevTo });

    const [totals, categories, days] = await Promise.all([
      base()
        .select([
          `COALESCE(SUM(CASE WHEN ${day} BETWEEN :from::date AND :to::date THEN e.amount ELSE 0 END), 0) AS "thisWeek"`,
          `COALESCE(SUM(CASE WHEN ${day} BETWEEN :prevFrom::date AND :prevTo::date THEN e.amount ELSE 0 END), 0) AS "lastWeek"`,
        ])
        .andWhere(`${day} BETWEEN :prevFrom::date AND :to::date`)
        .getRawOne(),

      base()
        .select(['c.name AS name', 'c.icon AS icon', 'c.color AS color', 'SUM(e.amount) AS total'])
        .leftJoin('e.category', 'c')
        .andWhere(`${day} BETWEEN :from::date AND :to::date`)
        .groupBy('c.name, c.icon, c.color')
        .orderBy('total', 'DESC')
        .limit(1)
        .getRawMany(),

      base()
        .select([`${day}::text AS date`, 'SUM(e.amount) AS total'])
        .andWhere(`${day} BETWEEN :from::date AND :to::date`)
        .groupBy(day)
        .orderBy('total', 'DESC')
        .limit(1)
        .getRawMany(),
    ]);

    const thisWeek = round2(parseFloat(totals?.thisWeek) || 0);
    const lastWeek = round2(parseFloat(totals?.lastWeek) || 0);
    const delta = round2(thisWeek - lastWeek);

    const top = categories[0]
      ? {
          name: categories[0].name ?? 'Uncategorized',
          icon: categories[0].icon ?? null,
          color: categories[0].color ?? null,
          total: round2(parseFloat(categories[0].total)),
          share: thisWeek > 0 ? Math.round((parseFloat(categories[0].total) / thisWeek) * 100) : 0,
        }
      : null;

    return {
      timezone: tz,
      from,
      to,
      thisWeek,
      lastWeek,
      delta,
      deltaPct: lastWeek > 0 ? Math.round((delta / lastWeek) * 100) : null,
      topCategory: top,
      biggestDay: days[0]
        ? { date: days[0].date, total: round2(parseFloat(days[0].total)) }
        : null,
      dailyAverage: round2(thisWeek / 7),
      action: this.weeklyAction({ user, thisWeek, lastWeek, delta, top }),
    };
  }

  /**
   * Exactly one suggestion, chosen by fixed rules in priority order.
   *
   * One action rather than a list: a review ending in five things to consider is a
   * review nobody acts on.
   */
  private weeklyAction(input: {
    user: User;
    thisWeek: number;
    lastWeek: number;
    delta: number;
    top: WeeklyReview['topCategory'];
  }): WeeklyReview['action'] {
    const { user, thisWeek, lastWeek, delta, top } = input;

    // Nothing worth saying without a week of history to compare against.
    if (thisWeek === 0 && lastWeek === 0) return { kind: 'need_more_data' };

    const limit = user.monthlySpendingLimit === null ? null : Number(user.monthlySpendingLimit);
    if (user.trackingMode === 'plan' && (limit === null || limit <= 0)) return { kind: 'set_plan' };

    // Running ahead of the pace the monthly limit allows for a week.
    if (limit && limit > 0) {
      const weeklyAllowance = (limit / 30) * 7;
      if (thisWeek > weeklyAllowance * 1.1) {
        return { kind: 'over_plan', amount: round2(thisWeek - weeklyAllowance) };
      }
    }

    // Spending fell — say so. Progress that goes unremarked stops feeling like progress.
    if (lastWeek > 0 && delta < 0) return { kind: 'spending_down', amount: round2(Math.abs(delta)) };

    // Otherwise name the single category carrying the week, when one dominates.
    if (top && top.share >= 35) {
      return { kind: 'reduce_category', categoryName: top.name, amount: top.total };
    }

    return null;
  }

  // ─── 1. Summary for a given period ────────────────────────────────────────
  async getPeriodSummary(userId: string, month?: string, year?: string): Promise<PeriodSummary> {
    const qb = this.repo
      .createQueryBuilder('e')
      .select([
        "SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END) AS \"totalExpense\"",
        "SUM(CASE WHEN e.type = 'income'  THEN e.amount ELSE 0 END) AS \"totalIncome\"",
        'COUNT(*) AS "transactionCount"',
      ])
      .where('e.user_id = :userId', { userId });

    const { dateFilter, params } = this.buildDateFilter(month, year);
    if (dateFilter) qb.andWhere(dateFilter, params);

    const row = await qb.getRawOne();
    const totalExpense = parseFloat(row.totalExpense) || 0;
    const totalIncome  = parseFloat(row.totalIncome)  || 0;
    const days = this.getDaysInPeriod(month, year);

    return {
      totalExpense,
      totalIncome,
      net: totalIncome - totalExpense,
      transactionCount: parseInt(row.transactionCount) || 0,
      avgPerDay: days > 0 ? Math.round(totalExpense / days) : 0,
    };
  }

  // ─── 2. Category breakdown (pie/donut chart) ───────────────────────────────
  async getCategoryBreakdown(
    userId: string,
    month?: string,
    year?: string,
    type: 'expense' | 'income' = 'expense',
  ): Promise<CategoryBreakdown[]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .select([
        'e.category_id AS "categoryId"',
        'c.name AS "categoryName"',
        'c.icon AS "categoryIcon"',
        'c.color AS "categoryColor"',
        'SUM(e.amount) AS total',
        'COUNT(*) AS count',
      ])
      .leftJoin('e.category', 'c')
      .where('e.user_id = :userId', { userId })
      .andWhere('e.type = :type', { type })
      .groupBy('e.category_id, c.name, c.icon, c.color')
      .orderBy('total', 'DESC');

    const { dateFilter, params } = this.buildDateFilter(month, year);
    if (dateFilter) qb.andWhere(dateFilter, params);

    const rows = await qb.getRawMany();
    const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName || 'Uncategorized',
      categoryIcon: r.categoryIcon || '📦',
      categoryColor: r.categoryColor || '#94a3b8',
      total: parseFloat(r.total),
      count: parseInt(r.count),
      percentage: grandTotal > 0 ? Math.round((parseFloat(r.total) / grandTotal) * 100) : 0,
    }));
  }

  // ─── 3. Monthly trend — last 12 months (line/bar chart) ───────────────────
  async getMonthlyTrend(userId: string): Promise<MonthlyTrend[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select([
        "TO_CHAR(e.occurred_at, 'YYYY-MM') AS month",
        "SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END) AS expense",
        "SUM(CASE WHEN e.type = 'income'  THEN e.amount ELSE 0 END) AS income",
      ])
      .where('e.user_id = :userId', { userId })
      .andWhere("e.occurred_at >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(e.occurred_at, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const [year, mon] = r.month.split('-');
      const label = new Date(+year, +mon - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const expense = parseFloat(r.expense) || 0;
      const income  = parseFloat(r.income)  || 0;
      return { month: r.month, label, expense, income, net: income - expense };
    });
  }

  // ─── 4. Daily breakdown within a month (heatmap / bar chart) ──────────────
  async getDailyBreakdown(userId: string, month: string): Promise<DailySummary[]> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select([
        "TO_CHAR(e.occurred_at, 'YYYY-MM-DD') AS date",
        "SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END) AS expense",
        "SUM(CASE WHEN e.type = 'income'  THEN e.amount ELSE 0 END) AS income",
      ])
      .where('e.user_id = :userId', { userId })
      .andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month })
      .groupBy("TO_CHAR(e.occurred_at, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      date: r.date,
      expense: parseFloat(r.expense) || 0,
      income: parseFloat(r.income) || 0,
      net: (parseFloat(r.income) || 0) - (parseFloat(r.expense) || 0),
    }));
  }

  // ─── 5. Top spending days in a month ──────────────────────────────────────
  async getTopSpendingDays(userId: string, month: string, limit = 5) {
    return this.repo
      .createQueryBuilder('e')
      .select([
        "TO_CHAR(e.occurred_at, 'YYYY-MM-DD') AS date",
        'SUM(e.amount) AS total',
        'COUNT(*) AS count',
      ])
      .where('e.user_id = :userId', { userId })
      .andWhere("e.type = 'expense'")
      .andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month })
      .groupBy("TO_CHAR(e.occurred_at, 'YYYY-MM-DD')")
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany();
  }

  // ─── 6. Allocation monthly summary (per wallet) ───────────────────────────
  async getAllocationSummary(userId: string) {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [txRows, movRows] = await Promise.all([
      // Spending: direct allocation_id OR via category→allocation_categories join
      this.repo
        .createQueryBuilder('e')
        .select([
          'COALESCE(e.allocation_id, ac.allocation_id) AS "allocationId"',
          'SUM(CASE WHEN e.type = \'expense\' THEN e.amount ELSE 0 END) AS "spentThisMonth"',
        ])
        .leftJoin('allocation_categories', 'ac', 'ac.category_id = e.category_id')
        .where('e.user_id = :userId', { userId })
        .andWhere('(e.allocation_id IS NOT NULL OR ac.allocation_id IS NOT NULL)')
        .andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month })
        .groupBy('COALESCE(e.allocation_id, ac.allocation_id)')
        .getRawMany(),
      // Net inflows: fund + transfer_in minus unallocate/transfer_out reversals
      this.movementRepo
        .createQueryBuilder('m')
        .select([
          'm.allocation_id AS "allocationId"',
          `SUM(CASE WHEN m.type IN ('fund', 'transfer_in') THEN m.amount WHEN m.type IN ('unallocate', 'transfer_out') THEN -m.amount ELSE 0 END) AS "fundedThisMonth"`,
        ])
        .where('m.user_id = :userId', { userId })
        .andWhere('m.type IN (:...types)', { types: ['fund', 'transfer_in', 'unallocate', 'transfer_out'] })
        .andWhere("TO_CHAR(m.created_at, 'YYYY-MM') = :month", { month })
        .groupBy('m.allocation_id')
        .getRawMany(),
    ])

    const allIds = [...new Set([...txRows.map(r => r.allocationId), ...movRows.map(r => r.allocationId)])]

    return allIds.map(allocationId => {
      const tx  = txRows.find(r => r.allocationId === allocationId)
      const mov = movRows.find(r => r.allocationId === allocationId)
      return {
        allocationId,
        spentThisMonth:  parseFloat(tx?.spentThisMonth)   || 0,
        fundedThisMonth: parseFloat(mov?.fundedThisMonth) || 0,
      }
    })
  }

  // ─── 7. Global balance summary ─────────────────────────────────────────────
  // totalBalance    = user.totalBalance  (all income - all expenses, ever)
  // allocatedBalance = SUM of all wallet balances
  // unallocatedBalance = totalBalance - allocatedBalance  (available to distribute)
  async getBalanceSummary(userId: string): Promise<BalanceSummary> {
    const userRepo       = this.dataSource.getRepository(User)
    const allocationRepo = this.dataSource.getRepository(Allocation)

    const [user, allocations] = await Promise.all([
      userRepo.findOne({ where: { id: userId } }),
      allocationRepo.find({ where: { userId } }),
    ])

    const totalBalance = round2(Number(user?.totalBalance ?? 0))

    // Netting positive and negative wallets into one figure is what let the summary
    // claim "100% allocated, ฿0 waiting" on a screen that also showed two wallets in
    // deficit: the positive wallets were quietly covering them. Report both sides.
    let positiveWalletBalance = 0
    let walletDeficit = 0
    let negativeWalletCount = 0
    for (const a of allocations) {
      const balance = Number(a.balance)
      if (balance > 0) positiveWalletBalance += balance
      else if (balance < 0) { walletDeficit += -balance; negativeWalletCount++ }
    }

    positiveWalletBalance = round2(positiveWalletBalance)
    walletDeficit = round2(walletDeficit)
    const allocatedBalance = round2(positiveWalletBalance - walletDeficit)

    return {
      totalBalance,
      // Net of deficits — kept under the original name for existing clients.
      allocatedBalance,
      unallocatedBalance: round2(totalBalance - allocatedBalance),
      positiveWalletBalance,
      walletDeficit,
      negativeWalletCount,
    }
  }

  // ─── 8. Emergency Fund summary ────────────────────────────────────────────
  async getEmergencyFundSummary(userId: string, targetMonths = 6) {
    const allocationRepo = this.dataSource.getRepository(Allocation)

    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    const avgRow = await this.repo
      .createQueryBuilder('e')
      .select("SUM(e.amount) / 3.0 AS avg_monthly")
      .where('e.user_id = :userId', { userId })
      .andWhere("e.type = 'expense'")
      .andWhere('e.occurred_at >= :since', { since: threeMonthsAgo })
      .getRawOne()

    const avgMonthlyExpense = parseFloat(avgRow?.avg_monthly) || 0
    const suggestedTarget = avgMonthlyExpense * targetMonths

    // Find allocation tagged as emergency fund (name contains "สำรอง" or "emergency")
    const allocations = await allocationRepo.find({ where: { userId } })
    const efWallet = allocations.find(
      (a) =>
        a.name.toLowerCase().includes('สำรอง') ||
        a.name.toLowerCase().includes('emergency') ||
        a.name.toLowerCase().includes('ฉุกเฉิน'),
    )

    const currentAmount = efWallet ? Number(efWallet.balance) : 0

    return {
      avgMonthlyExpense,
      targetMonths,
      suggestedTarget,
      currentAmount,
      progress: suggestedTarget > 0 ? Math.min(100, (currentAmount / suggestedTarget) * 100) : 0,
      remaining: Math.max(0, suggestedTarget - currentAmount),
      walletId: efWallet?.id ?? null,
      walletName: efWallet?.name ?? null,
    }
  }

  // ─── 9. AI Recommendations ────────────────────────────────────────────────
  async getRecommendations(userId: string): Promise<AiRecommendation[]> {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevMonth = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

    const [summary, prevSummary, categories, trend] = await Promise.all([
      this.getPeriodSummary(userId, month),
      this.getPeriodSummary(userId, prevMonth),
      this.getCategoryBreakdown(userId, month, undefined, 'expense'),
      this.getMonthlyTrend(userId),
    ])

    const topCats = categories.slice(0, 5).map(c =>
      `${c.categoryIcon} ${c.categoryName}: ฿${c.total.toLocaleString()} (${c.percentage}%)`
    ).join(', ')

    const trendSummary = trend.slice(-3).map(t =>
      `${t.label}: รายจ่าย ฿${t.expense.toLocaleString()} รายรับ ฿${t.income.toLocaleString()}`
    ).join(' | ')

    const expenseChange = prevSummary.totalExpense > 0
      ? Math.round(((summary.totalExpense - prevSummary.totalExpense) / prevSummary.totalExpense) * 100)
      : 0

    const prompt = `คุณเป็นที่ปรึกษาการเงินส่วนตัว วิเคราะห์ข้อมูลนี้และให้คำแนะนำ 3 ข้อ

ข้อมูลเดือนนี้:
- รายจ่าย: ฿${summary.totalExpense.toLocaleString()} (${expenseChange > 0 ? '+' : ''}${expenseChange}% จากเดือนที่แล้ว)
- รายรับ: ฿${summary.totalIncome.toLocaleString()}
- คงเหลือสุทธิ: ฿${summary.net.toLocaleString()}
- จำนวนรายการ: ${summary.transactionCount}
- หมวดใช้จ่ายหลัก: ${topCats || 'ไม่มีข้อมูล'}
- แนวโน้ม 3 เดือนล่าสุด: ${trendSummary || 'ไม่มีข้อมูล'}

ตอบเป็น JSON เท่านั้น รูปแบบ:
{"recommendations":[{"type":"warning|tip|good","title":"หัวข้อสั้น","body":"คำแนะนำ 1-2 ประโยค"}]}`

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return this.fallbackRecommendations(summary, prevSummary, categories)

    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'deepseek/deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800,
          temperature: 0.5,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://moneyflow.app',
            'X-Title': 'MoneyFlow',
          },
          timeout: 20000,
        },
      )

      const content: string = res.data.choices[0]?.message?.content ?? ''
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) return this.fallbackRecommendations(summary, prevSummary, categories)
      const parsed = JSON.parse(match[0])
      return (parsed.recommendations ?? []).slice(0, 3) as AiRecommendation[]
    } catch {
      return this.fallbackRecommendations(summary, prevSummary, categories)
    }
  }

  private fallbackRecommendations(
    summary: PeriodSummary,
    prevSummary: PeriodSummary,
    categories: CategoryBreakdown[],
  ): AiRecommendation[] {
    const recs: AiRecommendation[] = []
    const expChange = prevSummary.totalExpense > 0
      ? Math.round(((summary.totalExpense - prevSummary.totalExpense) / prevSummary.totalExpense) * 100)
      : 0

    if (expChange > 20) {
      recs.push({ type: 'warning', title: 'รายจ่ายเพิ่มสูง', body: `รายจ่ายเดือนนี้เพิ่มขึ้น ${expChange}% จากเดือนที่แล้ว ลองตรวจสอบหมวดที่ใช้จ่ายมากผิดปกติ` })
    } else if (expChange < -10) {
      recs.push({ type: 'good', title: 'ควบคุมค่าใช้จ่ายได้ดี', body: `รายจ่ายลดลง ${Math.abs(expChange)}% เทียบกับเดือนที่แล้ว ทำได้ดีมาก!` })
    }

    if (summary.totalIncome > 0) {
      const savingsRate = Math.round(((summary.totalIncome - summary.totalExpense) / summary.totalIncome) * 100)
      if (savingsRate < 10) {
        recs.push({ type: 'warning', title: 'อัตราการออมต่ำ', body: `ออมได้เพียง ${savingsRate}% ของรายรับ ตั้งเป้าไว้ที่ 20% เพื่อความมั่นคงระยะยาว` })
      } else if (savingsRate >= 20) {
        recs.push({ type: 'good', title: 'ออมได้ดีเยี่ยม', body: `อัตราการออม ${savingsRate}% สูงกว่าเป้าหมาย 20% ลองพิจารณานำเงินส่วนเกินไปลงทุน` })
      }
    }

    if (categories.length > 0 && categories[0].percentage >= 40) {
      recs.push({ type: 'tip', title: `${categories[0].categoryIcon} กระจายการใช้จ่าย`, body: `"${categories[0].categoryName}" คิดเป็น ${categories[0].percentage}% ของรายจ่ายทั้งหมด ลองตั้งงบประมาณให้หมวดนี้` })
    }

    if (recs.length === 0) {
      recs.push({ type: 'tip', title: 'บันทึกต่อเนื่อง', body: 'บันทึกรายรับ-รายจ่ายสม่ำเสมอเพื่อให้ระบบวิเคราะห์และแนะนำได้แม่นยำขึ้น' })
    }

    return recs.slice(0, 3)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private buildDateFilter(
    month?: string,
    year?: string,
  ): { dateFilter: string | null; params: Record<string, string> } {
    if (month) return { dateFilter: "TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", params: { month } }
    if (year)  return { dateFilter: "TO_CHAR(e.occurred_at, 'YYYY') = :year",     params: { year }  }
    return { dateFilter: null, params: {} }
  }

  private getDaysInPeriod(month?: string, year?: string): number {
    const now = new Date()
    if (month) {
      const [y, m] = month.split('-').map(Number)
      const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1
      return isCurrent ? now.getDate() : new Date(y, m, 0).getDate()
    }
    if (year) {
      const y = parseInt(year)
      const isCurrent = y === now.getFullYear()
      return isCurrent
        ? Math.floor((now.getTime() - new Date(y, 0, 1).getTime()) / 86400000)
        : (y % 4 === 0 ? 366 : 365)
    }
    return 30
  }
}