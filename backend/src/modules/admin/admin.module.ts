import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { AiUsageLog } from '../chat/ai-usage-log.entity'
import { AdminService } from './admin.service'
import { AdminController } from './admin.controller'

@Module({
  imports: [TypeOrmModule.forFeature([User, AiUsageLog])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
