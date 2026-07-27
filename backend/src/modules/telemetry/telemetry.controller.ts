import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { TelemetryService } from './telemetry.service'
import { ProductEventDto } from './telemetry.dto'

@Controller('telemetry')
@UseGuards(JwtAuthGuard)
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

  // POST /api/telemetry/event
  // Rate-limited so a runaway client loop cannot fill the table.
  @Post('event')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  record(@CurrentUser() user: User, @Body() dto: ProductEventDto) {
    return this.service.record(user.id, dto)
  }
}
