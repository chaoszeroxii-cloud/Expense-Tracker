import {
  Controller, Post, Get, Delete, Body, Res, UseGuards, BadRequestException, ServiceUnavailableException,
} from '@nestjs/common'
import { Response } from 'express'
import { ChatService } from './chat.service'
import { TavilyService } from './tavily.service'
import { CurrentUser } from '../auth/current-user.decorator'
import { AdminGuard } from '../auth/roles.guard'
import { ChatMessageDto, ChatStreamDto, ReceiptDraftDto } from './chat.dto'
import { Throttle } from '@nestjs/throttler'

@Controller('chat')
export class ChatController {
  constructor(
    private readonly svc: ChatService,
    private readonly tavily: TavilyService,
  ) {}

  @Get('receipt-status') receiptStatus() { return { configured: !!process.env.OPENROUTER_API_KEY } }

  @Post('receipt-draft')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async receipt(@CurrentUser() user, @Body() body: ReceiptDraftDto) {
    if (!process.env.OPENROUTER_API_KEY) throw new ServiceUnavailableException('Receipt reading is not configured')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64)) throw new BadRequestException('Invalid image')
    const image = Buffer.from(body.imageBase64, 'base64')
    const valid = body.mimeType === 'image/png' ? image.subarray(0,8).toString('hex') === '89504e470d0a1a0a'
      : body.mimeType === 'image/jpeg' ? image.subarray(0,3).toString('hex') === 'ffd8ff'
      : image.subarray(0,4).toString() === 'RIFF' && image.subarray(8,12).toString() === 'WEBP'
    if (!valid || image.length > 5_000_000) throw new BadRequestException('Choose a JPEG, PNG or WebP image under 5 MB')
    await this.svc.assertWithinDailyBudget(user.id)
    let extracted: Record<string, any>
    try { extracted = await this.svc.analyzeImage(body.imageBase64, body.mimeType, user.id) }
    catch { throw new ServiceUnavailableException('Could not read this receipt. Please retry or enter it manually.') }
    const data = extracted?.isFinancialDoc === true ? extracted.extractedData : null
    if (!data || !Number.isFinite(Number(data.total)) || Number(data.total) <= 0 || Number(data.total) > 9999999999.99) {
      throw new BadRequestException('No readable total found. Please enter it manually.')
    }
    // Only bounded data leaves the extractor. No chat history, tools or financial writes.
    return { amount: Math.round(Number(data.total)*100)/100,
      note: typeof data.shop === 'string' ? data.shop.slice(0,500) : '',
      date: typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null }
  }

  // POST /api/chat  — send a text message (non-streaming, kept for fallback)
  @Post()
  async sendMessage(@CurrentUser() user, @Body() body: ChatMessageDto) {
    await this.svc.assertWithinDailyBudget(user.id)
    return this.svc.chat(user.id, body.message, {
      ...body.context,
      userName: user.name,
    })
  }

  // POST /api/chat/stream  — SSE streaming chat (with optional image as base64)
  @Post('stream')
  async streamMessage(
    @CurrentUser() user,
    @Body() body: ChatStreamDto,
    @Res() res: Response,
  ) {
    // Enforce the budget BEFORE flushing SSE headers so an over-quota user gets
    // a normal JSON error rather than a half-open event stream.
    await this.svc.assertWithinDailyBudget(user.id)

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    await this.svc.chatStream(
      user.id,
      body.message ?? '',
      { ...body.context, userName: user.name },
      res,
      body.imageBase64,
      body.mimeType,
      body.imageThumbnail,
    )

    if (!res.writableEnded) res.end()
  }

  // GET /api/chat/history  — load chat history
  @Get('history')
  getHistory(@CurrentUser() user) {
    return this.svc.getHistory(user.id)
  }

  // DELETE /api/chat/history  — clear conversation
  @Delete('history')
  clearHistory(@CurrentUser() user) {
    return this.svc.clearHistory(user.id)
  }

  // GET /api/chat/tavily-status  — admin: check key status
  @Get('tavily-status')
  @UseGuards(AdminGuard)
  getTavilyStatus() {
    return this.tavily.getStatus()
  }
}
