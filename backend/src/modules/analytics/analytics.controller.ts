import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { AnalyticsService } from './analytics.service'

class AnalyticsQueryDto {
  @IsOptional() @IsString() month?: string
  @IsOptional() @IsString() year?: string
  @IsOptional() @IsString() type?: 'expense' | 'income'
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

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

  @Get('daily')
  getDailyBreakdown(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    const month = q.month || new Date().toISOString().slice(0, 7)
    return this.service.getDailyBreakdown(user.id, month)
  }

  @Get('top-days')
  getTopDays(@Query() q: AnalyticsQueryDto, @CurrentUser() user: User) {
    const month = q.month || new Date().toISOString().slice(0, 7)
    return this.service.getTopSpendingDays(user.id, month)
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
    return this.service.getEmergencyFundSummary(user.id, parseInt(months ?? '6'))
  }
}