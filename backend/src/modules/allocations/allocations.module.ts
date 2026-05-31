import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Allocation } from './allocation.entity'
import { AllocationMovement } from './allocation-movement.entity'
import { Category } from '../categories/category.entity'
import { AllocationsService } from './allocations.service'
import { AllocationsController } from './allocations.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Allocation, AllocationMovement, Category])],
  providers: [AllocationsService],
  controllers: [AllocationsController],
  exports: [AllocationsService],           // exported so ExpensesModule can import it
})
export class AllocationsModule {}
