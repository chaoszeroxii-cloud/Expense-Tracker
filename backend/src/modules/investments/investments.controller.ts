import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common'
import { InvestmentsService } from './investments.service'
import { CreateInvestmentDto, AddInvestmentTransactionDto } from './dto/investment.dto'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('investments')
export class InvestmentsController {
  constructor(private readonly svc: InvestmentsService) {}

  @Post()
  create(@CurrentUser() user, @Body() dto: CreateInvestmentDto) {
    return this.svc.create(user.id, dto)
  }

  @Get()
  findAll(@CurrentUser() user) {
    return this.svc.findAll(user.id)
  }

  @Post(':id/transactions')
  addTransaction(@CurrentUser() user, @Param('id') id: string, @Body() dto: AddInvestmentTransactionDto) {
    return this.svc.addTransaction(user.id, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() user, @Param('id') id: string) {
    return this.svc.remove(user.id, id)
  }
}
