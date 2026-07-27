import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

/**
 * A single product-analytics event.
 *
 * Contains no financial content by construction — no amounts, notes, category names
 * or free text of any kind. The only payload beyond the event name is a duration and
 * two coarse client descriptors, all validated against ProductEventDto.
 *
 * Rows cascade-delete with the user so deleting an account removes them.
 */
@Entity('product_events')
@Index(['userId', 'localDate'])
export class ProductEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ length: 40 })
  name: string

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null

  @Column({ length: 20, nullable: true })
  platform: string | null

  @Column({ name: 'app_version', length: 20, nullable: true })
  appVersion: string | null

  /** The user's local calendar date, so retention is counted in their own timezone. */
  @Column({ name: 'local_date', type: 'date' })
  localDate: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
