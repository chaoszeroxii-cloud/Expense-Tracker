import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { AccountService } from './account.service'
import { AccountController } from './account.controller'

@Module({
  imports: [TypeOrmModule.forFeature([User, Category])],
  providers: [AccountService],
  controllers: [AccountController],
})
export class AccountModule {}
