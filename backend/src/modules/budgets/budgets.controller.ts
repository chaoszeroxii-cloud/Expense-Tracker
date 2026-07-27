import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common'
import { BudgetsService } from './budgets.service'
import { UpsertBudgetDto, BatchBudgetDto, CopyPreviousDto } from './dto/budget.dto'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { localToday, safeTimezone } from '../../common/local-date.util'

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly svc: BudgetsService) {}

  @Post()
  upsert(@CurrentUser() user: User, @Body() dto: UpsertBudgetDto) {
    return this.svc.upsert(user.id, dto)
  }

  @Get()
  getWithActual(@CurrentUser() user: User, @Query('month') month: string) {
    return this.svc.getBudgetWithActual(user.id, month ?? this.currentMonth(user))
  }

  // GET /api/budgets/suggestions?month=YYYY-MM
  // What to prefill a new month with: last month's figures, else actual spend.
  @Get('suggestions')
  getSuggestions(@CurrentUser() user: User, @Query('month') month: string) {
    return this.svc.getSuggestions(user.id, month ?? this.currentMonth(user))
  }

  // POST /api/budgets/copy-previous — carry last month's budgets forward.
  @Post('copy-previous')
  @HttpCode(HttpStatus.OK)
  copyPrevious(@CurrentUser() user: User, @Body() dto: CopyPreviousDto) {
    return this.svc.copyPrevious(user.id, dto.month)
  }

  // PUT /api/budgets/batch — save a whole month in one request.
  @Put('batch')
  saveBatch(@CurrentUser() user: User, @Body() dto: BatchBudgetDto) {
    return this.svc.saveBatch(user.id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.id, id)
  }

  /** The user's own calendar month — a UTC default reports the wrong one on the 1st. */
  private currentMonth(user: User): string {
    return localToday(safeTimezone(user.timezone)).slice(0, 7)
  }
}
