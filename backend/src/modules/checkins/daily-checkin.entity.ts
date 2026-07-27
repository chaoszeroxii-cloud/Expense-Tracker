import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm'

/**
 * A day the user explicitly declared as "nothing spent".
 *
 * Days with transactions are not recorded here — they are already covered by the
 * expenses table. Storing both would let the two disagree.
 */
@Entity('daily_checkins')
@Unique('daily_checkins_unique_day', ['userId', 'localDate'])
@Index(['userId', 'localDate'])
export class DailyCheckin {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  /** `YYYY-MM-DD` in the user's own timezone. */
  @Column({ name: 'local_date', type: 'date' })
  localDate: string

  @Column({ length: 20, default: 'no_spend' })
  status: 'no_spend'

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
