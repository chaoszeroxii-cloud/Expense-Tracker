import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { User } from '../modules/users/user.entity'
import { Category } from '../modules/categories/category.entity'
import { Expense } from '../modules/expenses/expense.entity'
import { Allocation } from '../modules/allocations/allocation.entity'

export const databaseConfig = (): TypeOrmModuleOptions => {
  const base: Partial<TypeOrmModuleOptions> = {
    type: 'postgres',
    entities: [User, Category, Expense, Allocation],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
  }

  // Render (and most cloud providers) supply a DATABASE_URL connection string
  if (process.env.DATABASE_URL) {
    return { ...base, type: 'postgres', url: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
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
