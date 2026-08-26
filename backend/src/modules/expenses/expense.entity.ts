import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'
import { Allocation } from '../allocations/allocation.entity'
import { EntryType } from '../categories/category.entity'

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @Column({ name: 'category_id', nullable: true })
  categoryId: string

  // For income: which allocation received this money
  // For expense: auto-filled from category→allocation lookup
  @Column({ name: 'allocation_id', nullable: true })
  allocationId: string

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number

  // See Category.type — varchar + CHECK, matching the deployed schema.
  @Column({ type: 'varchar', length: 10 })
  type: EntryType

  @Column({ type: 'text', nullable: true })
  note: string

  @Column({ type: 'text', array: true, default: [] })
  tags: string[]

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date

  /**
   * Client-generated id for de-duplicating a replayed create.
   *
   * The offline queue retries whenever a response goes missing, which includes the case
   * where the write actually succeeded. Unique per user (partial index), so a replay
   * returns the original row instead of writing a second one.
   */
  @Column({ name: 'client_key', type: 'varchar', length: 64, nullable: true })
  clientKey: string | null

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @ManyToOne(() => Category, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category

  @ManyToOne(() => Allocation, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'allocation_id' })
  allocation: Allocation

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
