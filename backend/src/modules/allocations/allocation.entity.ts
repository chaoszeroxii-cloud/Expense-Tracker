import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, ManyToMany, JoinTable, JoinColumn,
} from 'typeorm'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'

@Entity('allocations')
export class Allocation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @Column({ length: 100 })
  name: string

  @Column({ length: 50, nullable: true })
  icon: string

  @Column({ length: 7, nullable: true })
  color: string

  // Running balance — updated on every income/expense transaction
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  balance: number

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  // Categories that drain THIS allocation when an expense is recorded
  @ManyToMany(() => Category, { eager: true, cascade: ['insert', 'update'] })
  @JoinTable({
    name: 'allocation_categories',
    joinColumn:        { name: 'allocation_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id',   referencedColumnName: 'id' },
  })
  categories: Category[]

  // Categories that credit THIS allocation when income is recorded
  @ManyToMany(() => Category, { eager: true, cascade: ['insert', 'update'] })
  @JoinTable({
    name: 'allocation_income_categories',
    joinColumn:        { name: 'allocation_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id',   referencedColumnName: 'id' },
  })
  incomeCategories: Category[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
