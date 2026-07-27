import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DailyCheckin } from './daily-checkin.entity'
import { User } from '../users/user.entity'
import { localToday, safeTimezone, shiftDate } from '../../common/local-date.util'

export interface CoverageDay {
  date: string
  covered: boolean
  source: 'transaction' | 'no_spend' | null
  isToday: boolean
}

export interface Coverage {
  /** Oldest first, seven entries ending today. */
  days: CoverageDay[]
  covered: number
  total: number
  canMarkToday: boolean
  /** One day of grace — forgetting yesterday should not be unrecoverable. */
  canMarkYesterday: boolean
}

@Injectable()
export class CheckinsService {
  constructor(
    @InjectRepository(DailyCheckin)
    private readonly checkins: Repository<DailyCheckin>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Seven-day coverage: how many of the last seven days the user has accounted for,
   * either by recording something or by saying there was nothing to record.
   *
   * Not a streak. Missing a day costs one square out of seven and nothing else — the
   * count never resets, because a single miss does not undo a habit.
   */
  async getCoverage(userId: string, tz: string): Promise<Coverage> {
    const today = localToday(tz)
    const start = shiftDate(today, -6)

    const [txRows, checkRows] = await Promise.all([
      this.checkins.manager.query(
        `SELECT DISTINCT (occurred_at AT TIME ZONE $2)::date::text AS d
           FROM expenses
          WHERE user_id = $1
            AND (occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`,
        [userId, tz, start, today],
      ),
      this.checkins.manager.query(
        `SELECT local_date::text AS d FROM daily_checkins
          WHERE user_id = $1 AND local_date BETWEEN $2::date AND $3::date`,
        [userId, start, today],
      ),
    ])

    const withTx = new Set<string>(txRows.map((r: { d: string }) => r.d))
    const withNoSpend = new Set<string>(checkRows.map((r: { d: string }) => r.d))

    const days: CoverageDay[] = []
    for (let i = 6; i >= 0; i--) {
      const date = shiftDate(today, -i)
      const source = withTx.has(date) ? 'transaction' : withNoSpend.has(date) ? 'no_spend' : null
      days.push({ date, covered: source !== null, source, isToday: date === today })
    }

    const yesterday = shiftDate(today, -1)
    return {
      days,
      covered: days.filter((d) => d.covered).length,
      total: 7,
      canMarkToday: !withTx.has(today) && !withNoSpend.has(today),
      canMarkYesterday: !withTx.has(yesterday) && !withNoSpend.has(yesterday),
    }
  }

  /**
   * Declares a day as no-spend.
   *
   * Only today and yesterday are accepted. Further back would let someone paper over a
   * fortnight of gaps in one sitting, which makes the number meaningless — and there is
   * no way to know a fortnight later whether that day really had no spending.
   */
  async markNoSpend(userId: string, date: string): Promise<Coverage> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    if (!user) throw new NotFoundException('User not found')

    const tz = safeTimezone(user.timezone)
    const today = localToday(tz)
    const yesterday = shiftDate(today, -1)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Expected a YYYY-MM-DD date')
    if (date !== today && date !== yesterday) {
      throw new BadRequestException('Only today or yesterday can be marked')
    }

    const hasTx = await this.checkins.manager.query(
      `SELECT 1 FROM expenses
        WHERE user_id = $1 AND (occurred_at AT TIME ZONE $2)::date = $3::date LIMIT 1`,
      [userId, tz, date],
    )
    if (hasTx.length > 0) {
      throw new BadRequestException('That day already has transactions')
    }

    // ON CONFLICT keeps a double tap idempotent rather than surfacing a unique violation.
    await this.checkins.manager.query(
      `INSERT INTO daily_checkins (user_id, local_date, status)
       VALUES ($1, $2::date, 'no_spend')
       ON CONFLICT (user_id, local_date) DO NOTHING`,
      [userId, date],
    )

    return this.getCoverage(userId, tz)
  }

  async undoNoSpend(userId: string, date: string): Promise<Coverage> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    if (!user) throw new NotFoundException('User not found')
    const tz = safeTimezone(user.timezone)

    await this.checkins.delete({ userId, localDate: date })
    return this.getCoverage(userId, tz)
  }
}
