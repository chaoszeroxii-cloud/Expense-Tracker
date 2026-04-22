import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expenses/expense.entity';

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
  month: string;   // "2024-01"
  label: string;   // "Jan 24"
  expense: number;
  income: number;
  net: number;
}

export interface DailySummary {
  date: string;    // "2024-03-15"
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

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Expense)
    private readonly repo: Repository<Expense>,
  ) {}

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

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private buildDateFilter(
    month?: string,
    year?: string,
  ): { dateFilter: string | null; params: Record<string, string> } {
    if (month) {
      return {
        dateFilter: "TO_CHAR(e.occurred_at, 'YYYY-MM') = :month",
        params: { month },
      };
    }
    if (year) {
      return {
        dateFilter: "TO_CHAR(e.occurred_at, 'YYYY') = :year",
        params: { year },
      };
    }
    return { dateFilter: null, params: {} };
  }

  private getDaysInPeriod(month?: string, year?: string): number {
    const now = new Date();
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
      return isCurrentMonth ? now.getDate() : new Date(y, m, 0).getDate();
    }
    if (year) {
      const y = parseInt(year);
      const isCurrentYear = y === now.getFullYear();
      return isCurrentYear
        ? Math.floor((now.getTime() - new Date(y, 0, 1).getTime()) / 86400000)
        : (y % 4 === 0 ? 366 : 365);
    }
    return 30;
  }
  
  // ── 6. Allocation wallet summary ──────────────────────────────
  async getAllocationSummary(userId: string) {
    // Total spent per allocation this month via its linked categories
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    const rows = await this.repo
    .createQueryBuilder('e')
      .select([
        'e.allocation_id AS "allocationId"',
        'SUM(CASE WHEN e.type = \'expense\' THEN e.amount ELSE 0 END) AS "spentThisMonth"',
        'SUM(CASE WHEN e.type = \'income\'  THEN e.amount ELSE 0 END) AS "receivedThisMonth"',
      ])
      .where('e.user_id = :userId', { userId })
      .andWhere('e.allocation_id IS NOT NULL')
      .andWhere("TO_CHAR(e.occurred_at, 'YYYY-MM') = :month", { month })
      .groupBy('e.allocation_id')
      .getRawMany()
      
      return rows.map(r => ({
        allocationId:       r.allocationId,
        spentThisMonth:     parseFloat(r.spentThisMonth)     || 0,
        receivedThisMonth:  parseFloat(r.receivedThisMonth)  || 0,
    }))
  }
}
