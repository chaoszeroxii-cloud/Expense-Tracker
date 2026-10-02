import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProductEvent } from './product-event.entity'
import { User } from '../users/user.entity'
import { TelemetryService } from './telemetry.service'
import { TelemetryController } from './telemetry.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ProductEvent, User])],
  providers: [TelemetryService],
  controllers: [TelemetryController],
})
export class TelemetryModule {}
