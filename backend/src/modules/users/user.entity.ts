import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm'
import { Category } from '../categories/category.entity'
import { Expense } from '../expenses/expense.entity'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @Column({ length: 100 })
  name: string

  @Column({ name: 'password_hash' })
  passwordHash: string

  @Column({ length: 3, default: 'THB' })
  currency: string

  // ── Running total balance (income minus expenses, all-time) ──
  // unallocated = totalBalance - SUM(allocation.balance)
  @Column({
    name: 'total_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalBalance: number

  @OneToMany(() => Category, (c) => c.user)
  categories: Category[]

  @OneToMany(() => Expense, (e) => e.user)
  expenses: Expense[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}