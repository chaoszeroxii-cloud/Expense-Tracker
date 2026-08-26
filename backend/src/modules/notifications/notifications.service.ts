import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as webpush from 'web-push'
import { PushSubscription } from './push-subscription.entity'
import { User } from '../users/user.entity'
import { localToday, safeTimezone } from '../../common/local-date.util'

export interface DispatchResult {
  considered: number
  sent: number
  skipped: number
  failed: number
  prunedSubscriptions: number
}

/**
 * How late after midnight a *previous* day's missed reminder may still be delivered.
 *
 * A fixed literal rather than something configurable: it only has to be long enough to
 * cover a deploy or a restart, and short enough that nobody is woken at 4am about
 * yesterday. Interpolated into SQL below, which is safe precisely because it is a
 * constant here and never reachable from a request.
 */
const GRACE_UNTIL = '02:00'

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private readonly configured: boolean

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subs: Repository<PushSubscription>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    this.configured = Boolean(publicKey && privateKey)

    if (this.configured) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:noreply@moneyflow.app',
        publicKey!,
        privateKey!,
      )
    } else {
      // Not an error: the feature is simply off until keys exist. Everything below
      // degrades to a no-op so a missing key never breaks an unrelated request.
      this.logger.warn('VAPID keys not set — push notifications are disabled')
    }
  }

  isConfigured(): boolean {
    return this.configured
  }

  publicKey(): string | null {
    return this.configured ? process.env.VAPID_PUBLIC_KEY! : null
  }

  /**
   * Registers a device.
   *
   * Keyed on the endpoint, which a browser reuses across re-subscribes: treating a
   * repeat as a new row would send the same person one notification per re-install.
   * Re-subscribing on a device that belonged to someone else re-points the row, so a
   * shared phone does not deliver one user's reminders to another.
   */
  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    const existing = await this.subs.findOne({ where: { endpoint: sub.endpoint } })
    if (existing) {
      existing.userId = userId
      existing.p256dh = sub.keys.p256dh
      existing.auth = sub.keys.auth
      existing.userAgent = userAgent?.slice(0, 200) ?? null
      await this.subs.save(existing)
    } else {
      await this.subs.save(this.subs.create({
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 200) ?? null,
      }))
    }

    await this.users.update(userId, { pushEnabled: true })
    return { ok: true }
  }

  async unsubscribe(userId: string, endpoint?: string) {
    if (endpoint) await this.subs.delete({ userId, endpoint })
    else await this.subs.delete({ userId })

    const left = await this.subs.count({ where: { userId } })
    if (left === 0) await this.users.update(userId, { pushEnabled: false })
    return { ok: true, remaining: left }
  }

  /**
   * Sends the day's reminder to everyone who is due one.
   *
   * A sweep rather than a tick fired at a fixed time. A single 20:30 cron loses the
   * reminder entirely if the process happens to be deploying or restarting at that
   * moment; asking "is it past their time today, and have we not sent yet?" every few
   * minutes survives a missed run, and covers every timezone with one query.
   *
   * Nobody is reminded about a day they have already accounted for — recording a
   * transaction or marking a no-spend day both count. A nudge to do something already
   * done is the fastest way to get notifications switched off.
   */
  async dispatchDueReminders(): Promise<DispatchResult> {
    const result: DispatchResult = { considered: 0, sent: 0, skipped: 0, failed: 0, prunedSubscriptions: 0 }
    if (!this.configured) return result

    // Postgres resolves each user's local clock, so one query serves every timezone.
    //
    // The "is it past their time today" test is a same-day comparison, which silently
    // gave a late reminder time almost no window: someone set to 23:55 could only be
    // caught by a sweep between 23:55 and midnight, and if the service happened to be
    // deploying then, the day's reminder was simply lost — the exact failure the
    // five-minute sweep exists to prevent. Yesterday's reminder is now still delivered
    // during a grace period after midnight, provided it was never sent, and stamped
    // against the day it was for.
    const due: { id: string; timezone: string; local_date: string; for_date: string }[] =
      await this.users.query(`
      WITH clock AS (
        SELECT u.id,
               COALESCE(u.timezone, 'Asia/Bangkok') AS timezone,
               u.remind_at,
               u.last_reminded_date,
               (now() AT TIME ZONE COALESCE(u.timezone, 'Asia/Bangkok'))                AS local_now,
               (now() AT TIME ZONE COALESCE(u.timezone, 'Asia/Bangkok'))::date          AS local_date
          FROM users u
         WHERE u.push_enabled = TRUE
           AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
      )
      SELECT id, timezone, local_date::text AS local_date,
             CASE
               WHEN TO_CHAR(local_now, 'HH24:MI') >= remind_at THEN local_date
               ELSE local_date - 1
             END::text AS for_date
        FROM clock
       WHERE (
               -- Today's reminder is due.
               (TO_CHAR(local_now, 'HH24:MI') >= remind_at
                AND last_reminded_date IS DISTINCT FROM local_date)
               -- Or yesterday's never went out and we are still inside the grace window.
               OR (TO_CHAR(local_now, 'HH24:MI') < remind_at
                   AND local_now::time < TIME '${GRACE_UNTIL}'
                   AND last_reminded_date IS DISTINCT FROM (local_date - 1))
             )
    `)

    result.considered = due.length

    for (const row of due) {
      // Already accounted for today? Then there is nothing to nudge about. The date is
      // still stamped so the sweep does not reconsider them every few minutes.
      const [covered] = await this.users.query(
        `SELECT
           EXISTS (SELECT 1 FROM expenses e
                    WHERE e.user_id = $1
                      AND (e.occurred_at AT TIME ZONE $2)::date = $3::date) AS has_tx,
           EXISTS (SELECT 1 FROM daily_checkins c
                    WHERE c.user_id = $1 AND c.local_date = $3::date) AS has_checkin`,
        [row.id, row.timezone, row.for_date],
      )

      if (covered?.has_tx || covered?.has_checkin) {
        await this.users.update(row.id, { lastRemindedDate: row.for_date })
        result.skipped++
        continue
      }

      const sent = await this.sendToUser(row.id, {
        title: 'MoneyFlow',
        // Deliberately a question about today, not a warning about losing something.
        // Loss framing is what makes a reminder feel like nagging.
        body: row.for_date === row.local_date
          ? 'วันนี้มีรายการที่ยังไม่ได้จดไหม?'
          : 'เมื่อวานมีรายการที่ยังไม่ได้จดไหม?',
        url: '/add',
        tag: `daily-${row.for_date}`,
      })

      result.sent += sent.sent
      result.failed += sent.failed
      result.prunedSubscriptions += sent.pruned

      // Stamped whether or not delivery succeeded: a broken endpoint should not make the
      // sweep retry the same person every few minutes for the rest of the day. Stamped
      // with the day the reminder was *for*, so a late catch-up does not also consume
      // today's slot.
      await this.users.update(row.id, { lastRemindedDate: row.for_date })
    }

    if (result.considered > 0) {
      this.logger.log(`reminder sweep: ${JSON.stringify(result)}`)
    }
    return result
  }

  /** Sends to every device a user has registered, pruning ones the service has dropped. */
  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; tag?: string },
  ): Promise<{ sent: number; failed: number; pruned: number }> {
    const out = { sent: 0, failed: 0, pruned: 0 }
    if (!this.configured) return out

    const devices = await this.subs.find({ where: { userId } })
    const body = JSON.stringify(payload)

    for (const device of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          body,
        )
        await this.subs.update(device.id, { lastUsedAt: new Date() })
        out.sent++
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        // 404/410 mean the push service has permanently dropped this endpoint —
        // the app was uninstalled or permission revoked. Keeping the row would make
        // every future sweep retry a device that no longer exists.
        if (status === 404 || status === 410) {
          await this.subs.delete({ id: device.id })
          out.pruned++
        } else {
          this.logger.warn(`push failed (${status ?? 'unknown'}) for user ${userId}`)
          out.failed++
        }
      }
    }

    return out
  }

  /** Lets the user check the whole path — permission, subscription, delivery — at once. */
  async sendTest(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    const res = await this.sendToUser(userId, {
      title: 'MoneyFlow',
      body: 'การแจ้งเตือนทำงานแล้ว',
      url: '/',
      tag: 'test',
    })
    return { ...res, configured: this.configured }
  }

  async getStatus(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    return {
      configured: this.configured,
      publicKey: this.publicKey(),
      enabled: user.pushEnabled,
      remindAt: user.remindAt,
      timezone: safeTimezone(user.timezone),
      today: localToday(safeTimezone(user.timezone)),
      deviceCount: await this.subs.count({ where: { userId } }),
    }
  }
}
