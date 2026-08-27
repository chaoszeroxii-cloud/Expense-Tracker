import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Makes "one category funds at most one wallet" a rule the database enforces.
 *
 * The app has always assumed it. `AllocationsService.debitByCategory` resolves the
 * envelope with `.getOne()` and no ORDER BY, so with two links it picks one arbitrarily
 * — and a later reversal is free to pick the *other*, permanently moving money between
 * two wallets that no user action ever moved. `AnalyticsService.getAllocationSummary`
 * used to join the same table and double-count every expense whose category was linked
 * twice.
 *
 * The only thing preventing it was a disabled button in the wallet editor. The REST API
 * accepted a duplicate link, and so did the assistant's `create_allocation` /
 * `update_allocation` tools, which never see that UI at all. A constraint only enforced
 * in the browser is not a constraint.
 *
 * Also adds the CHECK constraints `allocation_movements` never had: a movement is a
 * record of money moving, and a zero or negative one is not a thing that can happen.
 */
export class WalletLinkIntegrity1785220000000 implements MigrationInterface {
  name = 'WalletLinkIntegrity1785220000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Collapse existing duplicates before the index can reject them ────────
    //
    // Keep the link belonging to the wallet that actually holds the money — that is the
    // one whose balance the expenses were debited against, so it is the one the history
    // agrees with. Ties go to the oldest wallet, which is deterministic.
    for (const table of ['allocation_categories', 'allocation_income_categories']) {
      const dupes = await queryRunner.query(`
        SELECT category_id, COUNT(*) AS n FROM ${table} GROUP BY category_id HAVING COUNT(*) > 1
      `)
      if (dupes.length > 0) {
        console.log(
          `[WalletLinkIntegrity] ${table}: ${dupes.length} category/categories linked to ` +
          `more than one wallet — keeping the wallet with the largest balance`,
        )
      }

      await queryRunner.query(`
        DELETE FROM ${table} link
         WHERE EXISTS (
           SELECT 1 FROM ${table} keep
             JOIN allocations ka ON ka.id = keep.allocation_id
             JOIN allocations la ON la.id = link.allocation_id
            WHERE keep.category_id = link.category_id
              AND keep.allocation_id <> link.allocation_id
              AND (ka.balance, ka.created_at, ka.id) > (la.balance, la.created_at, la.id)
         )
      `)
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_allocation_categories_category
        ON allocation_categories(category_id)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_allocation_income_categories_category
        ON allocation_income_categories(category_id)
    `)

    // ── Movement amounts ────────────────────────────────────────────────────
    // Added NOT VALID then validated separately, matching SchemaGuarantees: a legacy row
    // that violates this should be a warning, not a failed deploy.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_movements_amount_positive') THEN
          ALTER TABLE allocation_movements
            ADD CONSTRAINT allocation_movements_amount_positive CHECK (amount > 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_movements_type_valid') THEN
          ALTER TABLE allocation_movements
            ADD CONSTRAINT allocation_movements_type_valid
            CHECK (type IN ('fund', 'transfer_in', 'transfer_out', 'unallocate')) NOT VALID;
        END IF;
      END $$;
    `)

    for (const c of ['allocation_movements_amount_positive', 'allocation_movements_type_valid']) {
      try {
        await queryRunner.query(`ALTER TABLE allocation_movements VALIDATE CONSTRAINT "${c}"`)
      } catch {
        console.warn(`[WalletLinkIntegrity] ${c} left NOT VALID — existing rows violate it`)
      }
    }

    // ── Index the reset-token lookup ────────────────────────────────────────
    // `findOne({ where: { resetToken } })` sequentially scanned the whole users table on
    // every password-reset click. Partial, so it costs nothing for the rows that are NULL
    // — which is all of them, almost all of the time.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token
        ON users(reset_token) WHERE reset_token IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_reset_token`)
    await queryRunner.query(`
      ALTER TABLE allocation_movements
        DROP CONSTRAINT IF EXISTS allocation_movements_amount_positive,
        DROP CONSTRAINT IF EXISTS allocation_movements_type_valid
    `)
    await queryRunner.query(`DROP INDEX IF EXISTS uq_allocation_income_categories_category`)
    await queryRunner.query(`DROP INDEX IF EXISTS uq_allocation_categories_category`)
  }
}
