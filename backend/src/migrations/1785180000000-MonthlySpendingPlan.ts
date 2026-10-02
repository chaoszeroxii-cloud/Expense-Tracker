import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Makes the monthly spending total a property of a *month* instead of the account.
 *
 * `users.monthly_spending_limit` had no month. The Plan screen showed it above a month
 * selector labelled "this month", so scrolling back to June changed the category budgets
 * underneath while the headline figure stayed on the current value — two numbers that
 * looked like they belonged to the same month but had different time scopes.
 *
 * The column is left in place for one release: analytics, Home and onboarding all read
 * it, and a dual-read window lets those move over without a flag day.
 */
export class MonthlySpendingPlan1785180000000 implements MigrationInterface {
  name = 'MonthlySpendingPlan1785180000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS monthly_spending_plans (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month        VARCHAR(7) NOT NULL,
        total_amount NUMERIC(14,2) NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT monthly_spending_plans_unique_month UNIQUE (user_id, month)
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_monthly_spending_plans_user_month
        ON monthly_spending_plans(user_id, month DESC)
    `)

    // Same rule as the column it replaces: a row means "a plan exists". No row means no
    // plan. A total of 0 would read as "spend nothing this month", which is a different
    // and false claim, so it is forbidden rather than treated as absence.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_spending_plans_total_positive') THEN
          ALTER TABLE monthly_spending_plans ADD CONSTRAINT monthly_spending_plans_total_positive
            CHECK (total_amount > 0);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_spending_plans_month_format') THEN
          ALTER TABLE monthly_spending_plans ADD CONSTRAINT monthly_spending_plans_month_format
            CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
        END IF;
      END $$;
    `)

    // ── Backfill: give every existing limit a month to live in ────────────────
    // Uses the user's own timezone, so someone in Asia/Bangkok on the 1st does not have
    // their plan filed under the previous month.
    await queryRunner.query(`
      INSERT INTO monthly_spending_plans (user_id, month, total_amount)
      SELECT u.id,
             TO_CHAR(now() AT TIME ZONE COALESCE(u.timezone, 'Asia/Bangkok'), 'YYYY-MM'),
             u.monthly_spending_limit
        FROM users u
       WHERE u.monthly_spending_limit IS NOT NULL
         AND u.monthly_spending_limit > 0
      ON CONFLICT (user_id, month) DO NOTHING
    `)

    // ── Allocation plan: an amount is a target, and a target is never negative ──
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_plans_amount_not_negative') THEN
          ALTER TABLE allocation_plans ADD CONSTRAINT allocation_plans_amount_not_negative
            CHECK (amount >= 0);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE allocation_plans DROP CONSTRAINT IF EXISTS allocation_plans_amount_not_negative`)
    await queryRunner.query(`DROP TABLE IF EXISTS monthly_spending_plans`)
  }
}
