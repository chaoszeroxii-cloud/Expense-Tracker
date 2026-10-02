import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('capture_templates')
export class CaptureTemplate {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'category_id', type: 'uuid' }) categoryId: string
  @Column({ length: 100 }) name: string
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number
  @Column({ length: 10 }) type: 'expense' | 'income'
  @Column({ length: 500, default: '' }) note: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
