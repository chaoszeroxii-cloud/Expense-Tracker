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

  // Reference value only — prefills the "Add Income" amount field.
  // Never substitutes for real recorded income anywhere else.
  @Column({
    name: 'expected_monthly_income',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  expectedMonthlyIncome: number | null

  @OneToMany(() => Category, (c) => c.user)
  categories: Category[]

  @OneToMany(() => Expense, (e) => e.user)
  expenses: Expense[]

  @Column({ name: 'reset_token', nullable: true, type: 'varchar', length: 64 })
  resetToken: string | null

  @Column({ name: 'reset_token_expiry', nullable: true, type: 'timestamptz' })
  resetTokenExpiry: Date | null

  // Bumped whenever a password is changed or reset. The value is embedded in
  // every JWT (`tv`); a mismatch during auth means the token predates the last
  // credential change and is rejected — this revokes stolen/old sessions.
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}