import { Module } from '@nestjs/common'
import { ExpensesModule } from '../expenses/expenses.module'
import { CaptureService } from './capture.service'
import { CaptureController } from './capture.controller'
@Module({
  imports: [ExpensesModule],
  providers: [CaptureService],
  controllers: [CaptureController],
})
export class CaptureModule {}
