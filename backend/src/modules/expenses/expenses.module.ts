import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Expense } from './expense.entity'
import { ExpensesService } from './expenses.service'
import { ExpensesController } from './expenses.controller'
import { AllocationsModule } from '../allocations/allocations.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense]),
    AllocationsModule,   // provides AllocationsService + DataSource
  ],
  providers: [ExpensesService],
  controllers: [ExpensesController],
})
export class ExpensesModule {}
