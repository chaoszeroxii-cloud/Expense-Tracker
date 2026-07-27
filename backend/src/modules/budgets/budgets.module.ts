import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Budget } from './budget.entity'
import { MonthlySpendingPlan } from './monthly-spending-plan.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { BudgetsService } from './budgets.service'
import { SpendingPlanService } from './spending-plan.service'
import { BudgetsController } from './budgets.controller'

@Module({
  // User for the timezone month boundaries are measured in; Category to verify a batch
  // save only touches categories the caller owns.
  imports: [TypeOrmModule.forFeature([Budget, MonthlySpendingPlan, User, Category])],
  controllers: [BudgetsController],
  providers: [BudgetsService, SpendingPlanService],
  // Analytics resolves the effective monthly total through this rather than reading the
  // legacy user column.
  exports: [BudgetsService, SpendingPlanService],
})
export class BudgetsModule {}
