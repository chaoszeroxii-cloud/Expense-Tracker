import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { PlanningExtrasService } from './planning-extras.service'
import { PayCycleDto, ReminderPreferenceDto, SnoozeBillDto } from './planning-extras.dto'
@Controller('planning')
export class PlanningExtrasController {
  constructor(private readonly service: PlanningExtrasService) {}
  @Get('pay-cycle') cycle(@CurrentUser() u: User) {
    return this.service.cycle(u.id)
  }
  @Put('pay-cycle') saveCycle(@CurrentUser() u: User, @Body() dto: PayCycleDto) {
    return this.service.saveCycle(u.id, dto)
  }
  @Get('reminders') reminders(@CurrentUser() u: User) {
    return this.service.reminders(u.id)
  }
  @Put('reminders') preferences(@CurrentUser() u: User, @Body() dto: ReminderPreferenceDto) {
    return this.service.saveReminderPreferences(u.id, dto)
  }
  @Put('bills/:id/snooze') snooze(
    @CurrentUser() u: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SnoozeBillDto,
  ) {
    return this.service.snooze(u.id, id, dto)
  }
}
