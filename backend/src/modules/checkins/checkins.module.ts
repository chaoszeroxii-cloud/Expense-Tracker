import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DailyCheckin } from './daily-checkin.entity'
import { User } from '../users/user.entity'
import { CheckinsService } from './checkins.service'
import { CheckinsController } from './checkins.controller'

@Module({
  imports: [TypeOrmModule.forFeature([DailyCheckin, User])],
  providers: [CheckinsService],
  controllers: [CheckinsController],
  // AnalyticsModule folds coverage into the daily brief so Home stays one request.
  exports: [CheckinsService],
})
export class CheckinsModule {}
