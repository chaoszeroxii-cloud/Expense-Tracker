import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { PlanningService } from './planning.service'
import { PlanningController } from './planning.controller'
import { PlanningExtrasController } from './planning-extras.controller'
import { PlanningExtrasService } from './planning-extras.service'

@Module({
  imports: [ExpensesModule],
  providers: [PlanningService, PlanningExtrasService],
  controllers: [PlanningController, PlanningExtrasController],
  exports: [PlanningService, PlanningExtrasService],
})
export class PlanningModule {}
