import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { CaptureService } from './capture.service'
import { CaptureBatchDto, TemplateDto } from './capture.dto'

@Controller('capture')
export class CaptureController {
  constructor(private readonly service: CaptureService) {}
  @Get('templates') list(@CurrentUser() user: User) {
    return this.service.templates(user.id)
  }
  @Post('templates') create(@CurrentUser() user: User, @Body() dto: TemplateDto) {
    return this.service.saveTemplate(user.id, dto)
  }
  @Put('templates/:id') update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TemplateDto,
  ) {
    return this.service.saveTemplate(user.id, dto, id)
  }
  @Delete('templates/:id') remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeTemplate(user.id, id)
  }
  @Post('preview') preview(@CurrentUser() user: User, @Body() dto: CaptureBatchDto) {
    return this.service.batch(user.id, dto)
  }
  @Post('batch') batch(@CurrentUser() user: User, @Body() dto: CaptureBatchDto) {
    return this.service.batch(user.id, dto, true)
  }
}
