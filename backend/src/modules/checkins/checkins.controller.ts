import { Controller, Delete, Param, Put, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { CheckinsService } from './checkins.service'

@Controller('check-ins')
@UseGuards(JwtAuthGuard)
export class CheckinsController {
  constructor(private readonly service: CheckinsService) {}

  // PUT /api/check-ins/:date  — "nothing spent that day"
  // Idempotent: tapping twice is the same as tapping once.
  @Put(':date')
  markNoSpend(@CurrentUser() user: User, @Param('date') date: string) {
    return this.service.markNoSpend(user.id, date)
  }

  // DELETE /api/check-ins/:date — undo, e.g. before recording a forgotten transaction
  @Delete(':date')
  undo(@CurrentUser() user: User, @Param('date') date: string) {
    return this.service.undoNoSpend(user.id, date)
  }
}
