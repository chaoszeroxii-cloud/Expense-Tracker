import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common'
import { LoansService } from './loans.service'
import { CreateLoanDto, CreateLoanPaymentDto } from './dto/loan.dto'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('loans')
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @Post()
  create(@CurrentUser() user, @Body() dto: CreateLoanDto) {
    return this.svc.create(user.id, dto)
  }

  @Get()
  findAll(@CurrentUser() user) {
    return this.svc.findAll(user.id)
  }

  @Get('summary')
  summary(@CurrentUser() user) {
    return this.svc.getDashboardSummary(user.id)
  }

  @Post(':id/payments')
  addPayment(@CurrentUser() user, @Param('id') id: string, @Body() dto: CreateLoanPaymentDto) {
    return this.svc.addPayment(user.id, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() user, @Param('id') id: string) {
    return this.svc.remove(user.id, id)
  }
}
