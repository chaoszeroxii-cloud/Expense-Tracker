import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Budget } from './budget.entity'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { BudgetsService } from './budgets.service'
import { BudgetsController } from './budgets.controller'

@Module({
  // User for the timezone month boundaries are measured in; Category to verify a batch
  // save only touches categories the caller owns.
  imports: [TypeOrmModule.forFeature([Budget, User, Category])],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
