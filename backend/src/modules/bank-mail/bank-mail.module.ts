import { Module, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ExpensesModule } from '../expenses/expenses.module'
import { BankMailController } from './bank-mail.controller'
import { BankMailService } from './bank-mail.service'
import { GmailProvider } from './gmail.provider'

@Injectable()
class BankMailScheduler {
  private running = false
  private readonly logger = new Logger(BankMailScheduler.name)
  constructor(private readonly mail: BankMailService) {}
  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    if (this.running || process.env.VERCEL || process.env.NODE_ENV === 'test') return
    this.running = true
    try { await this.mail.dispatch() }
    catch { this.logger.warn('Gmail sweep failed; next sweep will retry') }
    finally { this.running = false }
  }
}

@Module({ imports: [ExpensesModule], controllers: [BankMailController], providers: [BankMailService, GmailProvider, BankMailScheduler] })
export class BankMailModule {}
