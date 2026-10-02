import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Gives transaction creation an idempotency key.
 *
 * The offline queue holds entries captured without a connection and replays them when one
 * returns — the case it exists for is a bad signal, which is also the case where a request
 * reaches the server and its *response* is lost on the way back. The client then sees a
 * network error, keeps the entry, and creates the same transaction again on the next
 * drain. The queue's own comment already anticipated this ("the idempotency marker if the
 * server ever grows one"); the server never grew one.
 *
 * The key is the client-generated id the queue already stores, so replays collapse onto
 * the same row. Unique per user rather than globally, and partial so the column costs
 * nothing for the overwhelming majority of rows that are created online without one.
 */
export class ExpenseIdempotency1785230000000 implements MigrationInterface {
  name = 'ExpenseIdempotency1785230000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_key VARCHAR(64)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_user_client_key
        ON expenses(user_id, client_key) WHERE client_key IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_expenses_user_client_key`)
    await queryRunner.query(`ALTER TABLE expenses DROP COLUMN IF EXISTS client_key`)
  }
}
