import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, ParseUUIDPipe, UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { AllocationsService } from './allocations.service'
import {
  CreateAllocationDto, UpdateAllocationDto, MoveMoneyDto, TransferMoneyDto,
  ApplyPlanDto, SaveAllocationTargetsDto,
} from './allocation.dto'

@Controller('allocations')
@UseGuards(JwtAuthGuard)
export class AllocationsController {
  constructor(private readonly service: AllocationsService) {}

  // ── Monthly funding template (static routes — keep above ':id' routes) ──
  //
  // Intent and money movement are separate operations with different failure modes:
  // a plan can always be written down, whereas moving money can fail for lack of it.
  // Binding them together meant a user with ฿0 unallocated could not record a plan at all.

  // GET — this month's targets, inherited from the last month that had them.
  @Get('plans/preview')
  previewApplyPlan(@CurrentUser() user: User) {
    return this.service.previewApplyPlan(user.id)
  }

  // PUT — record intent only. Moves nothing, never blocked by an empty pool.
  @Put('plans')
  saveTargets(@Body() dto: SaveAllocationTargetsDto, @CurrentUser() user: User) {
    return this.service.saveTargets(user.id, dto.month, dto.items)
  }

  // POST — move real money. Leaves the targets untouched.
  @Post('plans/apply')
  applyPlan(@Body() dto: ApplyPlanDto, @CurrentUser() user: User) {
    return this.service.applyPlan(user.id, dto.amounts)
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id)
  }

  @Post()
  create(@Body() dto: CreateAllocationDto, @CurrentUser() user: User) {
    return this.service.create(dto, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAllocationDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user.id)
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.remove(id, user.id)
  }

  // ── Move unallocated funds → specific wallet ─────────────────
  @Post(':id/move')
  moveToAllocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveMoneyDto,
    @CurrentUser() user: User,
  ) {
    return this.service.moveToAllocation(id, user.id, dto.amount)
  }

  // ── Transfer funds between wallets ────────────────────────────
  @Post(':id/transfer')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferMoneyDto,
    @CurrentUser() user: User,
  ) {
    return this.service.transferBetweenAllocations(id, dto.targetAllocationId, user.id, dto.amount)
  }

  // ── Return wallet funds to unallocated pool ───────────────────
  @Post(':id/unallocate')
  unallocate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveMoneyDto,
    @CurrentUser() user: User,
  ) {
    return this.service.unallocateFromAllocation(id, user.id, dto.amount)
  }
}