import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  CreateDateColumn,
} from 'typeorm'

@Entity('recurring_bills')
export class RecurringBill {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ length: 100 }) name: string
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId:
    string | null
  @Column({ name: 'due_day', type: 'int' }) dueDay: number
  @Column({ name: 'start_month', length: 7 }) startMonth: string
  @Column({ default: true }) active: boolean
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}

/** A frozen monthly obligation, retained even after its recurring template is stopped. */
@Entity('bill_occurrences')
export class BillOccurrence {
  @PrimaryColumn({ name: 'bill_id', type: 'uuid' }) billId: string
  @PrimaryColumn({ length: 7 }) month: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ length: 100 }) name: string
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null
  @Column({ name: 'due_day', type: 'int' }) dueDay: number
  @Column({ default: false }) waived: boolean
}

/** A bill is paid only while its real expense exists. Deleting the expense reopens the bill. */
@Entity('bill_payments')
export class BillPayment {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'bill_id', type: 'uuid' }) billId: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ length: 7 }) month: string
  @Column({ name: 'expense_id', type: 'uuid' }) expenseId: string
}

/** Self-reported savings progress, never a wallet or a transaction. */
@Entity('savings_goals')
export class SavingsGoal {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ length: 100 }) name: string
  @Column({ name: 'target_amount', type: 'numeric', precision: 12, scale: 2 })
  targetAmount: number
  @Column({
    name: 'saved_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  savedAmount: number
  @Column({ name: 'target_date', type: 'date' }) targetDate: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
