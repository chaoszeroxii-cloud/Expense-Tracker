import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expense.entity';
import { AllocationMovement } from '../allocations/allocation-movement.entity';
import { User } from '../users/user.entity';
import { CheckinsModule } from '../checkins/checkins.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  // Coverage is folded into the daily brief rather than fetched separately, so Home
  // stays a single request.
  // BudgetsModule supplies the month-scoped spending plan that `safeToday` derives from.
  imports: [
    TypeOrmModule.forFeature([Expense, AllocationMovement, User]),
    CheckinsModule,
    BudgetsModule,
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
