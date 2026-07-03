import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  Unique,
} from 'typeorm'
import { User } from '../users/user.entity'
import { Allocation } from './allocation.entity'

// Target funding TOTAL for one wallet in one month — intent, not a movement record.
// Written only as a byproduct of the "Apply Last Month's Plan" action (see docs/adr/0001).
@Entity('allocation_plans')
@Unique(['userId', 'allocationId', 'month'])
export class AllocationPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @Column({ name: 'allocation_id' })
  allocationId: string

  @ManyToOne(() => Allocation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'allocation_id' })
  allocation: Allocation

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  @Column({ length: 7 })
  month: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
