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

  @Column({ name: 'password_hash', nullable: true, default: null })
  passwordHash: string | null

  @Column({ name: 'google_id', nullable: true, default: null })
  googleId: string | null

  @Column({ name: 'facebook_id', nullable: true, default: null })
  facebookId: string | null

  @Column({ name: 'auth_provider', length: 10, default: 'local' })
  authProvider: 'local' | 'google' | 'facebook'

  @Column({ length: 3, default: 'THB' })
  currency: string

  @Column({ length: 10, default: 'user' })
  role: string

  @Column({ name: 'onboarding_completed', default: false })
  onboardingCompleted: boolean

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