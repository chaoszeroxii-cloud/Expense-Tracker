import {
  Body, Controller, Delete, ForbiddenException, Get, Headers,
  HttpCode, HttpStatus, Post, UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { NotificationsService } from './notifications.service'
import { SubscribeDto, UnsubscribeDto } from './notifications.dto'
import { timingSafeEqual } from 'crypto'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  // GET /api/notifications/status — what the client needs to decide what to show.
  @Get('status')
  status(@CurrentUser() user: User) {
    return this.service.getStatus(user.id)
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.OK)
  subscribe(
    @CurrentUser() user: User,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.subscribe(user.id, dto.subscription, userAgent)
  }

  @Delete('subscriptions')
  unsubscribe(@CurrentUser() user: User, @Body() dto: UnsubscribeDto) {
    return this.service.unsubscribe(user.id, dto?.endpoint)
  }

  @Post('test')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  test(@CurrentUser() user: User) {
    return this.service.sendTest(user.id)
  }

  /**
   * POST /api/notifications/dispatch — run the reminder sweep now.
   *
   * The in-app scheduler already calls this on a timer, which works because the service
   * is kept awake by an external health ping. This endpoint exists so the sweep does not
   * *depend* on that staying true: point a cron service straight at it and reminders keep
   * working even if the app is allowed to sleep again.
   *
   * Public because an external caller has no session — authenticated instead by a shared
   * secret, compared in constant time. Without `CRON_SECRET` set it stays closed.
   */
  @Public()
  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(@Headers('x-cron-secret') provided?: string) {
    const expected = process.env.CRON_SECRET
    if (!expected) throw new ForbiddenException('CRON_SECRET is not configured')

    const a = Buffer.from(provided ?? '')
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid cron secret')
    }

    return this.service.dispatchDueReminders()
  }
}
