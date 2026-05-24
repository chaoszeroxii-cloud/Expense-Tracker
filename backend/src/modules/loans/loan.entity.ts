import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ length: 10, default: 'lent' })
  direction: string   // 'lent' = เราให้ยืม | 'borrowed' = เรายืมมา

  @Column({ length: 100 })
  borrower: string

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  @Column({ nullable: true })
  note: string

  @Column({ name: 'lent_at', type: 'timestamptz' })
  lentAt: Date

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date

  @Column({ length: 10, default: 'active' })
  status: string

  @OneToMany(() => LoanPayment, (p) => p.loan, { cascade: true, eager: true })
  payments: LoanPayment[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}

@Entity('loan_payments')
export class LoanPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'loan_id' })
  loanId: string

  @ManyToOne(() => Loan, (l) => l.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: Loan

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt: Date

  @Column({ nullable: true })
  note: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
