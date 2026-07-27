import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { databaseConfig } from './config/database.config'
import { AuthModule } from './modules/auth/auth.module'
import { ExpensesModule } from './modules/expenses/expenses.module'
import { CategoriesModule } from './modules/categories/categories.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
import { AllocationsModule } from './modules/allocations/allocations.module'
import { BudgetsModule } from './modules/budgets/budgets.module'
import { LoansModule } from './modules/loans/loans.module'
import { InvestmentsModule } from './modules/investments/investments.module'
import { TaxModule } from './modules/tax/tax.module'
import { AdminModule } from './modules/admin/admin.module'
import { ChatModule } from './modules/chat/chat.module'
import { TelemetryModule } from './modules/telemetry/telemetry.module'
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: databaseConfig }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    AllocationsModule,
    ExpensesModule,
    CategoriesModule,
    AnalyticsModule,
    BudgetsModule,
    LoansModule,
    InvestmentsModule,
    TaxModule,
    AdminModule,
    ChatModule,
    TelemetryModule,
  ],
  providers: [
    // Rate-limit first (per IP), then authenticate. Registering ThrottlerGuard
    // here makes the 100 req/min ceiling actually global — previously it only
    // applied to the one route that opted in via @UseGuards(ThrottlerGuard).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    Reflector,
  ],
})
export class AppModule {}
