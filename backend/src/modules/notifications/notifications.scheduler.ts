import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificationsService } from './notifications.service'

/**
 * Runs the reminder sweep on a timer inside the app.
 *
 * This is viable only because an external health ping keeps the service awake — a free
 * Render instance spins down after ~15 minutes of silence, and an in-process timer stops
 * with it. If that ping ever goes away, `POST /api/notifications/dispatch` does the same
 * work from outside, so the feature does not quietly stop.
 *
 * Every five minutes rather than once at a fixed time: the sweep asks "is it past this
 * user's reminder time today, and have we not sent yet?", so a run missed during a deploy
 * is picked up by the next one instead of losing the day.
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name)
  private running = false

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    if (!this.notifications.isConfigured()) return

    // A slow sweep must not overlap itself and send twice.
    if (this.running) {
      this.logger.warn('previous sweep still running — skipping this tick')
      return
    }

    this.running = true
    try {
      await this.notifications.dispatchDueReminders()
    } catch (err) {
      // Never let a failed sweep take the process down; the next tick retries.
      this.logger.error(`sweep failed: ${(err as Error).message}`)
    } finally {
      this.running = false
    }
  }
}
