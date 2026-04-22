import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { ExpensesService } from './expenses.service'
import { CreateExpenseDto, UpdateExpenseDto, QueryExpenseDto } from './dto/expense.dto'

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  findAll(@Query() query: QueryExpenseDto, @CurrentUser() user: User) {
    return this.service.findAll(user.id, query)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.findOne(id, user.id)
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: User) {
    return this.service.create(dto, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user.id)
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.remove(id, user.id)
  }
}
