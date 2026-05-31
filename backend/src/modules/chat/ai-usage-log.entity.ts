import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ length: 100 })
  model: string

  @Column({ name: 'prompt_tokens', default: 0 })
  promptTokens: number

  @Column({ name: 'completion_tokens', default: 0 })
  completionTokens: number

  @Column({ name: 'total_tokens', default: 0 })
  totalTokens: number

  @Column({ name: 'cost_usd', type: 'numeric', precision: 14, scale: 8, default: 0 })
  costUsd: number

  @Column({ name: 'cost_thb', type: 'numeric', precision: 14, scale: 4, default: 0 })
  costThb: number

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
