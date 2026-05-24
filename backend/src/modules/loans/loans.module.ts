import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Loan, LoanPayment } from './loan.entity'
import { LoansService } from './loans.service'
import { LoansController } from './loans.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Loan, LoanPayment])],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
