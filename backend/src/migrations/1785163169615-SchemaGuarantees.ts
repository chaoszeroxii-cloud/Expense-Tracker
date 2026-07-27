import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Everything the entity decorators cannot express, plus repair for schemas that drifted.
 *
 * Three kinds of database have to converge here:
 *   1. Fresh — the baseline just created every table; this adds the constraints and
 *      indexes on top.
 *   2. Production — built from `database/init/01..06`, so it is missing the columns and
 *      table that `07`/`08` would have added. Those are topped up with IF NOT EXISTS.
 *   3. Drifted dev — `synchronize` ran here and dropped every CHECK constraint and every
 *      hand-written index, and rewrote two varchar columns as native enums. All of that
 *      is undone.
 *
 * CHECK constraints are added `NOT VALID` and then validated separately: a retrofitted
 * constraint that some legacy row violates should surface as a warning, not as a failed
 * deploy that blocks the release. New writes are constrained either way.
 */
export class SchemaGuarantees1785163169615 implements MigrationInterface {
  name = 'SchemaGuarantees1785163169615'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Columns and tables older databases never received ────────────────
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS monthly_spending_limit NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS tracking_mode          VARCHAR(20)  NOT NULL DEFAULT 'plan',
        ADD COLUMN IF NOT EXISTS timezone               VARCHAR(64)  NOT NULL DEFAULT 'Asia/Bangkok',
        ADD COLUMN IF NOT EXISTS work_hours_per_day     NUMERIC(4,2) NOT NULL DEFAULT 8,
        ADD COLUMN IF NOT EXISTS work_days_per_month    INTEGER      NOT NULL DEFAULT 22,
        ADD COLUMN IF NOT EXISTS show_work_time         BOOLEAN      NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS advanced_mode          BOOLEAN      NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS total_balance          NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expected_monthly_income NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS token_version          INTEGER      NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS google_id              VARCHAR,
        ADD COLUMN IF NOT EXISTS facebook_id            VARCHAR,
        ADD COLUMN IF NOT EXISTS auth_provider          VARCHAR(10)  NOT NULL DEFAULT 'local',
        ADD COLUMN IF NOT EXISTS reset_token            VARCHAR(64),
        ADD COLUMN IF NOT EXISTS reset_token_expiry     TIMESTAMPTZ
    `)

    await queryRunner.query(`
      ALTER TABLE loans ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'lent'
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_events (
        id          BIGSERIAL PRIMARY KEY,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(40) NOT NULL,
        duration_ms INTEGER,
        platform    VARCHAR(20),
        app_version VARCHAR(20),
        local_date  DATE NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // ── 2. Undo synchronize's enum rewrite ──────────────────────────────────
    // It converted `varchar(10) + CHECK` into native Postgres enums. Enums cannot be
    // altered in place without a migration dance, and the deployed schema is varchar,
    // so bring the drifted databases back rather than pushing the change outward.
    for (const [table, enumType] of [
      ['expenses', 'expenses_type_enum'],
      ['categories', 'categories_type_enum'],
    ]) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${table}' AND column_name = 'type' AND udt_name = '${enumType}'
          ) THEN
            ALTER TABLE ${table} ALTER COLUMN type TYPE VARCHAR(10) USING type::text;
          END IF;
        END $$;
      `)
      await queryRunner.query(`DROP TYPE IF EXISTS "${enumType}"`)
    }

    // ── 3. CHECK constraints ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mf_ensure_check(tbl TEXT, cname TEXT, expr TEXT)
      RETURNS void AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
          EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', tbl, cname, expr);
        END IF;
        BEGIN
          EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', tbl, cname);
        EXCEPTION WHEN check_violation THEN
          RAISE WARNING 'constraint % left NOT VALID — existing rows violate: %', cname, expr;
        END;
      END;
      $$ LANGUAGE plpgsql;
    `)

    const checks: [string, string, string][] = [
      // The mismatch behind the "amount 0 saves, then explodes at the database" bug.
      ['expenses', 'expenses_amount_positive', 'amount > 0'],
      ['expenses', 'expenses_type_valid', `type IN ('expense', 'income')`],
      ['categories', 'categories_type_valid', `type IN ('expense', 'income')`],
      ['users', 'users_role_valid', `role IN ('user', 'admin')`],
      // NULL means "no plan"; 0 would read as "spend nothing today". Keep them distinct.
      ['users', 'users_monthly_spending_limit_positive', 'monthly_spending_limit IS NULL OR monthly_spending_limit > 0'],
      ['users', 'users_tracking_mode_valid', `tracking_mode IN ('plan', 'track_only')`],
      ['users', 'users_work_inputs_positive', 'work_hours_per_day > 0 AND work_days_per_month > 0'],
      ['budgets', 'budgets_amount_positive', 'amount > 0'],
      ['loans', 'loans_amount_positive', 'amount > 0'],
      ['loans', 'loans_status_valid', `status IN ('active', 'settled')`],
      ['loans', 'loans_direction_valid', `direction IN ('lent', 'borrowed')`],
      ['loan_payments', 'loan_payments_amount_positive', 'amount > 0'],
      ['investments', 'investments_type_valid', `type IN ('mutual_fund', 'stock_th', 'stock_us', 'crypto', 'gold', 'other')`],
      ['investment_transactions', 'inv_tx_amount_positive', 'amount > 0'],
      ['investment_transactions', 'inv_tx_type_valid', `type IN ('buy', 'sell', 'dividend')`],
      ['product_events', 'product_events_duration_sane', 'duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 3600000)'],
    ]

    for (const [tbl, cname, expr] of checks) {
      await queryRunner.query(`SELECT mf_ensure_check($1, $2, $3)`, [tbl, cname, expr])
    }

    await queryRunner.query(`DROP FUNCTION IF EXISTS mf_ensure_check(TEXT, TEXT, TEXT)`)

    // ── 4. Indexes the query layer depends on ───────────────────────────────
    // idx_expenses_user_occurred is what makes the daily-brief range scan cheap; it was
    // among the indexes synchronize dropped.
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_expenses_user_occurred ON expenses(user_id, occurred_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_category      ON expenses(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_type          ON expenses(type)`,
      `CREATE INDEX IF NOT EXISTS idx_categories_user        ON categories(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_allocations_user       ON allocations(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_budgets_user_month     ON budgets(user_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_loans_user             ON loans(user_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_loan_payments_loan     ON loan_payments(loan_id)`,
      `CREATE INDEX IF NOT EXISTS idx_inv_tx_investment      ON investment_transactions(investment_id)`,
      `CREATE INDEX IF NOT EXISTS idx_inv_tx_user            ON investment_transactions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tax_deductions_user_year ON tax_deductions(user_id, tax_year)`,
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_user     ON chat_messages(user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_allocation_plans_user_month ON allocation_plans(user_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_product_events_user_date ON product_events(user_id, local_date)`,
      `CREATE INDEX IF NOT EXISTS idx_product_events_name_date ON product_events(name, local_date)`,
      `CREATE INDEX IF NOT EXISTS idx_users_tracking_mode    ON users(tracking_mode)`,
    ]
    for (const sql of indexes) await queryRunner.query(sql)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the constraints and indexes are dropped. Columns and tables are left alone:
    // reverting this migration must not delete anyone's data.
    const constraints = [
      ['expenses', 'expenses_amount_positive'], ['expenses', 'expenses_type_valid'],
      ['categories', 'categories_type_valid'], ['users', 'users_role_valid'],
      ['users', 'users_monthly_spending_limit_positive'], ['users', 'users_tracking_mode_valid'],
      ['users', 'users_work_inputs_positive'], ['budgets', 'budgets_amount_positive'],
      ['loans', 'loans_amount_positive'], ['loans', 'loans_status_valid'],
      ['loans', 'loans_direction_valid'], ['loan_payments', 'loan_payments_amount_positive'],
      ['investments', 'investments_type_valid'], ['investment_transactions', 'inv_tx_amount_positive'],
      ['investment_transactions', 'inv_tx_type_valid'], ['product_events', 'product_events_duration_sane'],
    ]
    for (const [tbl, cname] of constraints) {
      await queryRunner.query(`ALTER TABLE ${tbl} DROP CONSTRAINT IF EXISTS ${cname}`)
    }

    const indexNames = [
      'idx_expenses_user_occurred', 'idx_expenses_category', 'idx_expenses_type',
      'idx_categories_user', 'idx_allocations_user', 'idx_budgets_user_month',
      'idx_loans_user', 'idx_loan_payments_loan', 'idx_inv_tx_investment', 'idx_inv_tx_user',
      'idx_tax_deductions_user_year', 'idx_chat_messages_user', 'idx_allocation_plans_user_month',
      'idx_product_events_user_date', 'idx_product_events_name_date', 'idx_users_tracking_mode',
    ]
    for (const name of indexNames) await queryRunner.query(`DROP INDEX IF EXISTS ${name}`)
  }
}
