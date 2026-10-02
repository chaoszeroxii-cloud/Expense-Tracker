import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'
import type { BankMailTransaction } from './bank-mail.parser'

export interface BankMailSettings {
  autoImport: boolean
  expenseCategoryId: string | null
  incomeCategoryId: string | null
  ownAccounts: string[]
}
export const emptyMailSettings = (): BankMailSettings => ({ autoImport: false, expenseCategoryId: null, incomeCategoryId: null, ownAccounts: [] })

@Entity('bank_mail_connections')
export class BankMailConnection {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'gmail_address', type: 'varchar', length: 320, nullable: true }) gmailAddress: string
  @Column({ name: 'refresh_cipher', type: 'text', nullable: true }) refreshCipher: string
  @Column({ name: 'state_hash', type: 'varchar', length: 64, nullable: true }) stateHash: string
  @Column({ name: 'oauth_attempt_id', type: 'uuid', nullable: true }) oauthAttemptId: string
  @Column({ name: 'verifier_cipher', type: 'text', nullable: true }) verifierCipher: string
  @Column({ name: 'state_expires_at', type: 'timestamptz', nullable: true }) stateExpiresAt: Date
  @Column({ type: 'jsonb' }) settings: BankMailSettings
  @Column({ name: 'auto_import_since', type: 'timestamptz', nullable: true }) autoImportSince: Date
  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true }) lastSyncedAt: Date
  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true }) lastAttemptAt: Date
  @Column({ name: 'scan_after', type: 'timestamptz', nullable: true }) scanAfter: Date
  @Column({ name: 'scan_before', type: 'timestamptz', nullable: true }) scanBefore: Date
  @Column({ name: 'page_token', type: 'text', nullable: true }) pageToken: string
  @Column({ name: 'lease_id', type: 'uuid', nullable: true }) leaseId: string
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil: Date
  @Column({ name: 'last_error', type: 'varchar', length: 40, nullable: true }) lastError: string
  @Column({ name: 'last_skipped', default: 0 }) lastSkipped: number
}

@Entity('bank_mail_entries')
export class BankMailEntry {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ name: 'source_key', length: 64 }) sourceKey: string
  @Column({ name: 'reference_hash', type: 'varchar', length: 64, nullable: true }) referenceHash: string
  @Column({ length: 64 }) fingerprint: string
  @Column({ type: 'jsonb' }) transaction: BankMailTransaction
  @Column({ length: 12, default: 'pending' }) status: 'pending' | 'saved' | 'ignored'
  @Column({ type: 'varchar', length: 40, nullable: true }) reason: string
  @Column({ name: 'expense_id', type: 'uuid', nullable: true }) expenseId: string
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date
}
