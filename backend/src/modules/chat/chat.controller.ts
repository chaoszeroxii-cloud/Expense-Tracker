import {
  Controller, Post, Get, Delete, Body, Res,
} from '@nestjs/common'
import { Response } from 'express'
import { ChatService } from './chat.service'
import { TavilyService } from './tavily.service'
import { CurrentUser } from '../auth/current-user.decorator'

@Controller('chat')
export class ChatController {
  constructor(
    private readonly svc: ChatService,
    private readonly tavily: TavilyService,
  ) {}

  // POST /api/chat  — send a text message (non-streaming, kept for fallback)
  @Post()
  sendMessage(
    @CurrentUser() user,
    @Body() body: { message: string; context?: Record<string, any> },
  ) {
    return this.svc.chat(user.id, body.message, {
      ...body.context,
      userName: user.name,
    })
  }

  // POST /api/chat/stream  — SSE streaming chat (with optional image as base64)
  @Post('stream')
  async streamMessage(
    @CurrentUser() user,
    @Body() body: { message?: string; imageBase64?: string; mimeType?: string; imageThumbnail?: string; context?: Record<string, any> },
    @Res() res: Response,
  ) {
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
  getTavilyStatus() {
    return this.tavily.getStatus()
  }
}
