import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Web Push subscriptions and the per-user reminder preference.
 *
 * `last_reminded_date` exists so the dispatcher can be a *sweep* rather than a single
 * tick at a fixed time. A cron that fires once at 20:30 loses the reminder entirely if
 * the process happens to be restarting or deploying at that moment; a sweep that runs
 * every few minutes and asks "is it past their time today, and have we not sent yet?"
 * survives that, and handles every timezone with the same query.
 */
export class PushNotifications1785200000000 implements MigrationInterface {
  name = 'PushNotifications1785200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint   TEXT NOT NULL,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        user_agent VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ,
        CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)
    `)

    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS push_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS remind_at           VARCHAR(5) NOT NULL DEFAULT '20:30',
        ADD COLUMN IF NOT EXISTS last_reminded_date  DATE
    `)

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_remind_at_format') THEN
          ALTER TABLE users ADD CONSTRAINT users_remind_at_format
            CHECK (remind_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
        END IF;
      END $$;
    `)

    // The sweep filters on these three together.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_push_due
        ON users(push_enabled, remind_at) WHERE push_enabled = TRUE
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS push_subscriptions`)
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_remind_at_format`)
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS push_enabled,
        DROP COLUMN IF EXISTS remind_at,
        DROP COLUMN IF EXISTS last_reminded_date
    `)
  }
}
