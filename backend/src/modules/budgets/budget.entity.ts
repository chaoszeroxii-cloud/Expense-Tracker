import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  Unique,
} from 'typeorm'
import { User } from '../users/user.entity'
import { Category } from '../categories/category.entity'

@Entity('budgets')
@Unique(['userId', 'categoryId', 'month'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ name: 'category_id' })
  categoryId: string

  @ManyToOne(() => Category, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'category_id' })
  category: Category

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  @Column({ length: 7 })
  month: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
