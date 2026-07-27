import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { AccountService } from './account.service'
import { ResetTransactionsDto, FactoryResetDto, RESET_TRANSACTIONS_PHRASE } from './account.dto'

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly service: AccountService) {}

  // GET /api/account/reset-preview?from=&to=
  // What the confirmation dialog states is at stake. Read-only.
  @Get('reset-preview')
  preview(@CurrentUser() user: User, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getResetPreview(user.id, from, to)
  }

  // POST /api/account/reset-transactions
  //
  // Rate-limited because nothing here should ever be called in a loop and both actions
  // are irreversible. `@Throttle` alone is enough: ThrottlerGuard is already registered
  // globally in app.module, and adding `@UseGuards(ThrottlerGuard)` as well runs it twice
  // per request, so each call counts double and the real ceiling is half the number
  // written here.
  @Post('reset-transactions')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  resetTransactions(@CurrentUser() user: User, @Body() dto: ResetTransactionsDto) {
    if (dto.confirm?.trim() !== RESET_TRANSACTIONS_PHRASE) {
      throw new BadRequestException(`Type "${RESET_TRANSACTIONS_PHRASE}" to confirm`)
    }
    return this.service.resetTransactions(user.id, { from: dto.from, to: dto.to })
  }

  // POST /api/account/factory-reset
  // Wipes everything the user created but keeps the login.
  @Post('factory-reset')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  factoryReset(@CurrentUser() user: User, @Body() dto: FactoryResetDto) {
    // Compared case-insensitively — the address is a memory check, not a typing test.
    if (dto.confirm?.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Type your email address to confirm')
    }
    return this.service.factoryReset(user.id, dto.lang ?? 'th')
  }
}
