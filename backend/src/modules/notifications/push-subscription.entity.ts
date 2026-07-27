import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm'

/**
 * One browser/device registration for Web Push.
 *
 * The endpoint is unique across the table: re-subscribing on the same device returns the
 * same endpoint, and treating that as a new row would send the user duplicate
 * notifications for every re-install.
 */
@Entity('push_subscriptions')
@Unique('push_subscriptions_endpoint_unique', ['endpoint'])
@Index(['userId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ type: 'text' })
  endpoint: string

  @Column({ type: 'text' })
  p256dh: string

  @Column({ type: 'text' })
  auth: string

  @Column({ name: 'user_agent', length: 200, nullable: true })
  userAgent: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null
}
