import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto'

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id)
  }

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: User) {
    return this.service.create(dto, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user.id)
  }

  // What the confirmation dialog needs in order to say what is at stake: how many
  // transactions lose their classification, over what date range, and whether a wallet
  // is funded by this category. Read-only.
  @Get(':id/delete-impact')
  deleteImpact(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.getDeleteImpact(id, user.id)
  }

  // `?reassignTo=<uuid>` moves this category's transactions instead of orphaning them.
  // Without it the delete strips the category off every past transaction permanently —
  // `expenses.category_id` is ON DELETE SET NULL.
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('reassignTo', new ParseUUIDPipe({ optional: true })) reassignTo?: string,
  ) {
    return this.service.remove(id, user.id, reassignTo)
  }
}
