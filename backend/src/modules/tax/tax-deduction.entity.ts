import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('tax_deductions')
@Unique(['userId', 'taxYear', 'type'])
export class TaxDeduction {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ name: 'tax_year' })
  taxYear: number

  @Column({ length: 50 })
  type: string

  @Column({ length: 200 })
  name: string

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount: number

  @Column({ name: 'max_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  maxAmount: number

  @Column({ nullable: true })
  note: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
