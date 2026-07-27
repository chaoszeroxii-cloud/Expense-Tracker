import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Expense } from '../expenses/expense.entity';

export type EntryType = 'expense' | 'income';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, nullable: true })
  icon: string;

  @Column({ length: 7, nullable: true })
  color: string;

  // varchar + a CHECK constraint rather than a native Postgres enum: the deployed
  // schema has always been varchar, and altering an enum in place is a migration
  // hazard for no benefit here. The constraint lives in the migrations.
  @Column({ type: 'varchar', length: 10 })
  type: EntryType;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @ManyToOne(() => User, (u) => u.categories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Expense, (e) => e.category)
  expenses: Expense[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
