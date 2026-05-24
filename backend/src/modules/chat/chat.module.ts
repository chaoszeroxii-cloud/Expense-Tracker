import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ChatMessage } from './chat-message.entity'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { TavilyService } from './tavily.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage]),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [ChatController],
  providers: [ChatService, TavilyService],
  exports: [TavilyService],
})
export class ChatModule {}
