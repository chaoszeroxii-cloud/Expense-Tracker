import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { PlanningService } from './planning.service'
import { PlanningController } from './planning.controller'

@Module({
  imports: [ExpensesModule],
  providers: [PlanningService],
  controllers: [PlanningController],
  exports: [PlanningService],
})
export class PlanningModule {}
