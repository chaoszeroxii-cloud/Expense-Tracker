import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PushSubscription } from './push-subscription.entity'
import { User } from '../users/user.entity'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { NotificationsScheduler } from './notifications.scheduler'
import { PlanningModule } from '../planning/planning.module'

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription, User]), PlanningModule],
  providers: [NotificationsService, NotificationsScheduler],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
