import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { APP_GUARD, Reflector } from '@nestjs/core'
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
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: databaseConfig }),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    Reflector,
  ],
})
export class AppModule {}
