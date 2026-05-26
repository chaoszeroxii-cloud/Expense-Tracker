import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common'
import { TaxService } from './tax.service'
import { UpsertTaxDeductionDto } from './dto/tax.dto'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('tax')
export class TaxController {
  constructor(private readonly svc: TaxService) {}

  @Get('types')
  getTypes(@Query('lang') lang?: string) {
    return this.svc.getDeductionTypes(lang ?? 'th')
  }

  @Get('deductions')
  findByYear(@CurrentUser() user, @Query('year') year: string) {
    return this.svc.findByYear(user.id, parseInt(year) || new Date().getFullYear())
  }

  @Post('deductions')
  upsert(@CurrentUser() user, @Body() dto: UpsertTaxDeductionDto) {
    return this.svc.upsert(user.id, dto)
  }

  @Delete('deductions/:id')
  remove(@CurrentUser() user, @Param('id') id: string) {
    return this.svc.remove(user.id, id)
  }

  @Get('calculate')
  calculate(
    @CurrentUser() user,
    @Query('income') income: string,
    @Query('year') year: string,
    @Query('lang') lang?: string,
  ) {
    return this.svc.calculate(user.id, parseFloat(income) || 0, parseInt(year) || new Date().getFullYear(), lang ?? 'th')
  }
}
