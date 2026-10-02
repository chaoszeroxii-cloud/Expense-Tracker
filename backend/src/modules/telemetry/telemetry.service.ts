import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProductEvent } from './product-event.entity'
import { User } from '../users/user.entity'
import { ProductEventDto } from './telemetry.dto'

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name)

  constructor(
    @InjectRepository(ProductEvent)
    private readonly events: Repository<ProductEvent>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Records one event. Never throws: analytics must not be able to break a user
   * action, so a failure here is logged and swallowed rather than surfaced.
   */
  async record(userId: string, dto: ProductEventDto): Promise<{ ok: boolean }> {
    try {
      const localDate = this.normaliseDate(dto.localDate) ?? await this.userLocalDate(userId)

      await this.events.insert({
        userId,
        name: dto.name,
        durationMs: dto.durationMs ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        localDate,
      })
      return { ok: true }
    } catch (err) {
      this.logger.warn(`failed to record ${dto.name}: ${(err as Error).message}`)
      return { ok: false }
    }
  }

  /** Accepts only a strict `YYYY-MM-DD` that is a real date; anything else is dropped. */
  private normaliseDate(value?: string): string | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const [y, m, d] = value.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d))
    const valid = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    return valid ? value : null
  }

  private async userLocalDate(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    const tz = user?.timezone || 'Asia/Bangkok'
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
    } catch {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
    }
  }
}
