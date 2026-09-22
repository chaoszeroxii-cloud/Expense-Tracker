import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm'

/**
 * The spending total for one month.
 *
 * Replaces `users.monthly_spending_limit`, which had no month and therefore could not
 * answer "what was my plan in June?" — the Plan screen showed the current value above a
 * month selector, so the headline and the rows beneath it described different periods.
 *
 * Missing months inherit the latest row. A null total explicitly clears the plan and
 * stops inheritance; zero remains invalid.
 */
@Entity('monthly_spending_plans')
@Unique('monthly_spending_plans_unique_month', ['userId', 'month'])
@Index(['userId', 'month'])
export class MonthlySpendingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  /** `YYYY-MM` in the user's own timezone. */
  @Column({ length: 7 })
  month: string

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  totalAmount: number | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
