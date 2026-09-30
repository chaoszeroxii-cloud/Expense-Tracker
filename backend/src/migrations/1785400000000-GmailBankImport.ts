import { MigrationInterface, QueryRunner } from 'typeorm'

export class GmailBankImport1785400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE bank_mail_connections (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      gmail_address varchar(320), refresh_cipher text, state_hash varchar(64),
      verifier_cipher text, state_expires_at timestamptz, oauth_attempt_id uuid,
      settings jsonb NOT NULL DEFAULT '{"autoImport":false,"expenseCategoryId":null,"incomeCategoryId":null,"ownAccounts":[]}',
      auto_import_since timestamptz, last_synced_at timestamptz, last_attempt_at timestamptz,
      scan_after timestamptz, scan_before timestamptz, page_token text,
      lease_id uuid, lease_until timestamptz, last_error varchar(40), last_skipped integer NOT NULL DEFAULT 0
    )`)
    await q.query(`CREATE UNIQUE INDEX idx_bank_mail_oauth_state ON bank_mail_connections(state_hash) WHERE state_hash IS NOT NULL`)
    await q.query(`CREATE INDEX idx_bank_mail_queue ON bank_mail_connections(last_attempt_at NULLS FIRST) WHERE refresh_cipher IS NOT NULL`)
    await q.query(`CREATE TABLE bank_mail_entries (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_key varchar(64) NOT NULL, reference_hash varchar(64), fingerprint varchar(64) NOT NULL,
      "transaction" jsonb NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','saved','ignored')),
      reason varchar(40), expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, source_key)
    )`)
    await q.query(`CREATE UNIQUE INDEX idx_bank_mail_reference ON bank_mail_entries(user_id, reference_hash) WHERE reference_hash IS NOT NULL`)
    await q.query(`CREATE INDEX idx_bank_mail_fingerprint ON bank_mail_entries(user_id, fingerprint)`)
    await q.query(`CREATE INDEX idx_bank_mail_pending ON bank_mail_entries(user_id, status, created_at DESC, id DESC)`)
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE bank_mail_entries')
    await q.query('DROP TABLE bank_mail_connections')
  }
}
