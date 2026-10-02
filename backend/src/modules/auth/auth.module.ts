import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { Allocation } from '../allocations/allocation.entity'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { getJwtSecret } from '../../config/jwt.config'
import { BudgetsModule } from '../budgets/budgets.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Category, Allocation]),
    // Onboarding writes the month-scoped spending plan, not just the legacy user column.
    BudgetsModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
