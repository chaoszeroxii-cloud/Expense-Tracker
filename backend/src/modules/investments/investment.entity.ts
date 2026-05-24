import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('investments')
export class Investment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ length: 200 })
  name: string

  @Column({ length: 50, nullable: true })
  symbol: string

  @Column({ length: 20, default: 'mutual_fund' })
  type: string

  @Column({ nullable: true })
  note: string

  @OneToMany(() => InvestmentTransaction, (t) => t.investment, { cascade: true })
  transactions: InvestmentTransaction[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}

@Entity('investment_transactions')
export class InvestmentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'investment_id' })
  investmentId: string

  @ManyToOne(() => Investment, (i) => i.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'investment_id' })
  investment: Investment

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ length: 10 })
  type: string

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  units: number

  @Column({ name: 'nav_price', type: 'numeric', precision: 14, scale: 4, nullable: true })
  navPrice: number

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date

  @Column({ nullable: true })
  note: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
