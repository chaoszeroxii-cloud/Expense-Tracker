import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Allocation } from './allocation.entity'
import { AllocationMovement } from './allocation-movement.entity'
import { AllocationPlan } from './allocation-plan.entity'
import { Category } from '../categories/category.entity'
import { User } from '../users/user.entity'
import { AllocationsService } from './allocations.service'
import { AllocationsController } from './allocations.controller'

@Module({
  // User is needed for the timezone that month boundaries are measured in.
  imports: [TypeOrmModule.forFeature([Allocation, AllocationMovement, AllocationPlan, Category, User])],
  providers: [AllocationsService],
  controllers: [AllocationsController],
  exports: [AllocationsService],           // exported so ExpensesModule can import it
})
export class AllocationsModule {}
