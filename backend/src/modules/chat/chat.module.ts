import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { ChatMessage } from './chat-message.entity'
import { AiUsageLog } from './ai-usage-log.entity'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { TavilyService } from './tavily.service'
import { CategoriesModule } from '../categories/categories.module'
import { LoansModule } from '../loans/loans.module'
import { BudgetsModule } from '../budgets/budgets.module'
import { AllocationsModule } from '../allocations/allocations.module'
import { InvestmentsModule } from '../investments/investments.module'
import { TaxModule } from '../tax/tax.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, AiUsageLog]),
    MulterModule.register({ storage: memoryStorage() }),
    CategoriesModule,
    LoansModule,
    BudgetsModule,
    AllocationsModule,
    InvestmentsModule,
    TaxModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, TavilyService],
  exports: [TavilyService],
})
export class ChatModule {}
