import { Body, Controller, Delete, ForbiddenException, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { timingSafeEqual } from 'crypto'
import { Response } from 'express'
import { Public } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { User } from '../users/user.entity'
import { BankMailService } from './bank-mail.service'
import { BankMailCompleteDto, BankMailListDto, BankMailSaveDto, BankMailSettingsDto } from './bank-mail.dto'

@Controller('bank-mail')
export class BankMailController {
  constructor(private readonly service: BankMailService) {}
  @Get('status') @Header('Cache-Control', 'no-store') status(@CurrentUser() user: User) { return this.service.status(user.id) }
  @Post('connect') @Header('Cache-Control', 'no-store') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } })
  connect(@CurrentUser() user: User) { return this.service.connect(user.id) }
  @Public() @Get('gmail/callback') @Header('Cache-Control', 'no-store')
  callback(@Query('state') state: unknown, @Query('code') code: unknown, @Query('error') error: unknown, @Res() res: Response) {
    // Complete only after the browser proves it is still logged into the initiating
    // MoneyFlow account. The fragment keeps the short-lived code out of frontend HTTP logs.
    const valid = !error && typeof state === 'string' && /^[\w-]{43}$/.test(state)
      && typeof code === 'string' && code.length > 0 && code.length <= 4096
    const url = new URL('/settings?gmail=' + (valid ? 'complete' : 'failed'), process.env.FRONTEND_URL)
    if (valid) url.hash = new URLSearchParams({ state: state as string, code: code as string }).toString()
    return res.redirect(303, url.toString())
  }
  @Post('complete') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  async complete(@CurrentUser() user: User, @Body() dto: BankMailCompleteDto) {
    return { connected: await this.service.callback(user.id, dto.state, dto.code) }
  }
  @Delete('connection') disconnect(@CurrentUser() user: User) { return this.service.disconnect(user.id) }
  @Put('settings') settings(@CurrentUser() user: User, @Body() dto: BankMailSettingsDto) { return this.service.settings(user.id, dto) }
  @Post('sync') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } })
  sync(@CurrentUser() user: User) { return this.service.sync(user.id) }
  @Get('entries') @Header('Cache-Control', 'no-store') list(@CurrentUser() user: User, @Query() query: BankMailListDto) { return this.service.list(user.id, query) }
  @Post('entries/:id/save') @HttpCode(200)
  save(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BankMailSaveDto) { return this.service.save(user.id, id, dto) }
  @Post('entries/:id/ignore') @HttpCode(200)
  ignore(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) { return this.service.ignore(user.id, id) }
  @Public() @Post('dispatch') @HttpCode(200)
  dispatch(@Headers('x-cron-secret') supplied?: string) {
    const secret = process.env.CRON_SECRET
    if (!secret || typeof supplied !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(supplied)
      || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) throw new ForbiddenException()
    return this.service.dispatch()
  }
}
