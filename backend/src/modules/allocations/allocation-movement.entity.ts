import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('allocation_movements')
export class AllocationMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  @Column({ name: 'allocation_id' })
  allocationId: string

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number

  // fund = from unallocated pool, transfer_in = from another wallet
  // transfer_out = to another wallet, unallocate = back to pool
  @Column({ length: 20 })
  type: 'fund' | 'transfer_in' | 'transfer_out' | 'unallocate'

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date
}
