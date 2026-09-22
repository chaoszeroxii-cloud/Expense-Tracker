import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { PlanningService } from './planning.service'
import { BillDto, GoalDto, PayBillDto } from './planning.dto'

@Controller('planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Get() overview(@CurrentUser() user: User) {
    return this.planning.overview(user.id)
  }
  @Post('bills') createBill(@CurrentUser() user: User, @Body() dto: BillDto) {
    return this.planning.saveBill(user.id, dto)
  }
  @Put('bills/:id') updateBill(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BillDto,
  ) {
    return this.planning.saveBill(user.id, dto, id)
  }
  @Delete('bills/:id') archiveBill(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.planning.archiveBill(user.id, id)
  }
  @Post('bills/:id/pay') payBill(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayBillDto,
  ) {
    return this.planning.payBill(user.id, id, dto)
  }
  @Put('bills/:id/occurrences/:month') updateOccurrence(
    @CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string,
    @Param('month') month: string, @Body() dto: BillDto,
  ) {
    return this.planning.changeOccurrence(user.id, id, month, dto)
  }
  @Delete('bills/:id/occurrences/:month') waiveOccurrence(
    @CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Param('month') month: string,
  ) {
    return this.planning.changeOccurrence(user.id, id, month)
  }
  @Post('goals') createGoal(@CurrentUser() user: User, @Body() dto: GoalDto) {
    return this.planning.saveGoal(user.id, dto)
  }
  @Put('goals/:id') updateGoal(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GoalDto,
  ) {
    return this.planning.saveGoal(user.id, dto, id)
  }
  @Delete('goals/:id') removeGoal(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.planning.removeGoal(user.id, id)
  }
}
