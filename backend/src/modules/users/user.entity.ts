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

  // ── Spending plan ───────────────────────────────────────────
  // The one number "safe to spend today" derives from. NULL means the user has
  // not set a plan — which is NOT the same as a limit of 0, so callers must
  // keep the distinction and never coerce it to a number.
  @Column({
    name: 'monthly_spending_limit',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  monthlySpendingLimit: number | null

  // 'track_only' users record transactions without committing to a limit.
  @Column({ name: 'tracking_mode', length: 20, default: 'plan' })
  trackingMode: 'plan' | 'track_only'

  // IANA zone deciding what "today" and "this month" mean for this user.
  @Column({ name: 'timezone', length: 64, default: 'Asia/Bangkok' })
  timezone: string

  // ── Work-time lens ──────────────────────────────────────────
  // Hourly rate comes from `expectedMonthlyIncome / (workDaysPerMonth * workHoursPerDay)`.
  // These lived in localStorage and were lost on every device change.
  @Column({ name: 'work_hours_per_day', type: 'numeric', precision: 4, scale: 2, default: 8 })
  workHoursPerDay: number

  @Column({ name: 'work_days_per_month', type: 'int', default: 22 })
  workDaysPerMonth: number

  @Column({ name: 'show_work_time', default: true })
  showWorkTime: boolean

  // Reveals envelope wallets, loans, investments and tax. Backfilled to true for
  // anyone who already had that data — see 07-spending-plan.sql.
  @Column({ name: 'advanced_mode', default: false })
  advancedMode: boolean

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