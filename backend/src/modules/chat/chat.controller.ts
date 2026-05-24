import {
  Controller, Post, Get, Delete, Body, UploadedFile,
  UseInterceptors, MaxFileSizeValidator, ParseFilePipe,
  FileTypeValidator, Res,
} from '@nestjs/common'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
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

  // POST /api/chat/stream  — SSE streaming chat
  @Post('stream')
  async streamMessage(
    @CurrentUser() user,
    @Body() body: { message: string; context?: Record<string, any> },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    await this.svc.chatStream(user.id, body.message, {
      ...body.context,
      userName: user.name,
    }, res)

    if (!res.writableEnded) res.end()
  }

  // POST /api/chat/vision  — upload image for bill reading
  @Post('vision')
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(
    @CurrentUser() user,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp|gif)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const base64 = file.buffer.toString('base64')
    return this.svc.analyzeImage(user.id, base64, file.mimetype)
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
