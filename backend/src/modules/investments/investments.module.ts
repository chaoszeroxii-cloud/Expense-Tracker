import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Investment, InvestmentTransaction } from './investment.entity'
import { InvestmentsService } from './investments.service'
import { InvestmentsController } from './investments.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Investment, InvestmentTransaction])],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
