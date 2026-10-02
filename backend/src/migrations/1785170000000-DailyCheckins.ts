import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Explicit "I had no spending today" declarations.
 *
 * Only no-spend days are stored. A day with a transaction is already covered by the
 * expenses table, and duplicating that here would create two sources of truth that
 * drift the first time someone deletes a transaction.
 *
 * This is deliberately not a streak counter. A day without spending is good behaviour;
 * a mechanic that resets to zero for it would punish the outcome the app exists to
 * encourage. Coverage is counted out of the last seven days and never resets.
 */
export class DailyCheckins1785170000000 implements MigrationInterface {
  name = 'DailyCheckins1785170000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS daily_checkins (
        id         BIGSERIAL PRIMARY KEY,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date DATE NOT NULL,
        status     VARCHAR(20) NOT NULL DEFAULT 'no_spend',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT daily_checkins_unique_day UNIQUE (user_id, local_date)
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
        ON daily_checkins(user_id, local_date DESC)
    `)

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_checkins_status_valid') THEN
          ALTER TABLE daily_checkins ADD CONSTRAINT daily_checkins_status_valid
            CHECK (status IN ('no_spend'));
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS daily_checkins`)
  }
}
