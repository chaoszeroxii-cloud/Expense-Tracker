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
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: databaseConfig }),
    AuthModule,
    AllocationsModule,
    ExpensesModule,
    CategoriesModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    Reflector,
  ],
})
export class AppModule {}
