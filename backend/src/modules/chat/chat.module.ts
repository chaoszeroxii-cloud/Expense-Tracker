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
import { ExpensesModule } from '../expenses/expenses.module'
import { User } from '../users/user.entity'

@Module({
  imports: [
    // User: the timezone every month/day boundary in the tools is measured in.
    TypeOrmModule.forFeature([ChatMessage, AiUsageLog, User]),
    MulterModule.register({ storage: memoryStorage() }),
    CategoriesModule,
    LoansModule,
    BudgetsModule,
    AllocationsModule,
    InvestmentsModule,
    TaxModule,
    ExpensesModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, TavilyService],
  exports: [TavilyService],
})
export class ChatModule {}
