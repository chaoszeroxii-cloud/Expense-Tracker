import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, IsIn, Matches } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { AnalyticsService, AiRecommendation } from './analytics.service'
import { localMonth, safeTimezone } from '../../common/local-date.util'

class AnalyticsQueryDto {
  // Shape-checked here rather than trusted downstream. `month` and `year` reach a date
  // cast in SQL, and an unparseable value surfaced as an opaque 500 instead of a 400.
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string

  @IsOptional() @Matches(/^\d{4}$/, { message: 'year must be YYYY' })
  year?: string

  @IsOptional() @IsIn(['expense', 'income'])
  type?: 'expense' | 'income'
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  // GET /api/analytics/daily-brief
  // → everything the home screen needs above the fold, in one round trip.
  //   Timezone comes from the user's profile, not the client, so the figures
  //   cannot be shifted by a device with a wrong clock.
  @Get('daily-brief')
  getDailyBrief(@CurrentUser() user: User) {
    return this.service.getDailyBrief(user.id)
  }

  // GET /api/analytics/weekly-review
  // Deterministic SQL — no model call, so it is fast, free and explainable.
  @Get('weekly-review')
  getWeeklyReview(@CurrentUser() user: User) {
    return this.service.getWeeklyReview(user.id)
  }

  @Get('summary')
  getSummary(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    return this.service.getPeriodSummary(user.id, q.month, q.year)
  }

  @Get('categories')
  getCategoryBreakdown(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    return this.service.getCategoryBreakdown(user.id, q.month, q.year, q.type as any)
  }

  @Get('monthly-trend')
  getMonthlyTrend(@CurrentUser() user: User) {
    return this.service.getMonthlyTrend(user.id)
  }

  // The default month is resolved from the user's own calendar, not the server's.
  // `new Date().toISOString()` is UTC, so before 07:00 Bangkok time on the 1st these
  // endpoints defaulted to the *previous* month while the rest of the app showed this one.
  @Get('daily')
  getDailyBreakdown(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    return this.service.getDailyBreakdown(user.id, q.month ?? localMonth(safeTimezone(user.timezone)))
  }

  @Get('top-days')
  getTopDays(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    return this.service.getTopSpendingDays(user.id, q.month ?? localMonth(safeTimezone(user.timezone)))
  }

  // GET /api/analytics/allocations
  // → current balance + monthly in/out per allocation (for Dashboard widget)
  @Get('allocations')
  getAllocationSummary(@CurrentUser() user: User) {
    return this.service.getAllocationSummary(user.id)
  }

  // GET /api/analytics/balance
  // → totalBalance, allocatedBalance, unallocatedBalance
  @Get('balance')
  getBalanceSummary(@CurrentUser() user: User) {
    return this.service.getBalanceSummary(user.id)
  }

  // GET /api/analytics/emergency-fund?months=6
  @Get('emergency-fund')
  getEmergencyFund(@CurrentUser() user: User, @Query('months') months?: string) {
    // `parseInt('abc')` is NaN, which multiplied the target into NaN and rendered as
    // "NaN" on the card. Clamp to something a fund target can sensibly be.
    const parsed = parseInt(months ?? '6', 10)
    const targetMonths = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 24) : 6
    return this.service.getEmergencyFundSummary(user.id, targetMonths)
  }

  // GET /api/analytics/recommendations
  @Get('recommendations')
  getRecommendations(@CurrentUser() user: User): Promise<AiRecommendation[]> {
    return this.service.getRecommendations(user.id)
  }
}