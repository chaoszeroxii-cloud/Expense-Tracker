import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseUUIDPipe, UseGuards,
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

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.service.remove(id, user.id)
  }
}
