import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { User } from '../modules/users/user.entity'
import { Category } from '../modules/categories/category.entity'
import { Expense } from '../modules/expenses/expense.entity'
import { Allocation } from '../modules/allocations/allocation.entity'
import { AllocationMovement } from '../modules/allocations/allocation-movement.entity'
import { AllocationPlan } from '../modules/allocations/allocation-plan.entity'
import { Budget } from '../modules/budgets/budget.entity'
import { Loan, LoanPayment } from '../modules/loans/loan.entity'
import { Investment, InvestmentTransaction } from '../modules/investments/investment.entity'
import { TaxDeduction } from '../modules/tax/tax-deduction.entity'
import { ChatMessage } from '../modules/chat/chat-message.entity'
import { AiUsageLog } from '../modules/chat/ai-usage-log.entity'
import { ProductEvent } from '../modules/telemetry/product-event.entity'

export const databaseConfig = (): TypeOrmModuleOptions => {
  const base: Partial<TypeOrmModuleOptions> = {
    type: 'postgres',
    entities: [User, Category, Expense, Allocation, AllocationMovement, AllocationPlan, Budget, Loan, LoanPayment, Investment, InvestmentTransaction, TaxDeduction, ChatMessage, AiUsageLog, ProductEvent],
    synchronize: process.env.DB_SYNC === 'true' || process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
  }

  // Render (and most cloud providers) supply a DATABASE_URL connection string.
  // Cert validation is opt-in via DB_SSL_REJECT_UNAUTHORIZED=true — set it once
  // your provider serves a chain Node trusts, to defend against MITM.
  if (process.env.DATABASE_URL) {
    const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    return { ...base, type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized } }
  }

  return {
    ...base,
    type: 'postgres',
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'expense_tracker',
    username: process.env.DB_USER || 'expense_user',
    password: process.env.DB_PASSWORD,
  }
}
