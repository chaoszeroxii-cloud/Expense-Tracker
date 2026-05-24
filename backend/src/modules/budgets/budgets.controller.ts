import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common'
import { BudgetsService } from './budgets.service'
import { UpsertBudgetDto } from './dto/budget.dto'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly svc: BudgetsService) {}

  @Post()
  upsert(@CurrentUser() user, @Body() dto: UpsertBudgetDto) {
    return this.svc.upsert(user.id, dto)
  }

  @Get()
  getWithActual(@CurrentUser() user, @Query('month') month: string) {
    const m = month ?? new Date().toISOString().slice(0, 7)
    return this.svc.getBudgetWithActual(user.id, m)
  }

  @Delete(':id')
  remove(@CurrentUser() user, @Param('id') id: string) {
    return this.svc.remove(user.id, id)
  }
}
