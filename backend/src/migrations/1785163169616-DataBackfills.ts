import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * One-time data corrections that a schema sync can never perform.
 *
 * This is the half of a migration that `synchronize` structurally cannot do, and the
 * reason "just turn synchronize on" does not work: it would add `advanced_mode` with a
 * default of FALSE and every existing user would silently lose access to the wallets,
 * loans, investments and tax screens they had been using.
 *
 * Each step is written to be a no-op on a database where it has already happened, so
 * running against a fresh, a production, or a half-migrated database all converge.
 */
export class DataBackfills1785163169616 implements MigrationInterface {
  name = 'DataBackfills1785163169616'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Emoji icons → MDI names ─────────────────────────────────────────────
    // Old rows stored the emoji itself; the UI now looks up an MDI icon name. Only
    // touches values that still look like emoji, so re-running changes nothing.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mf_emoji_to_mdi(emoji VARCHAR) RETURNS VARCHAR AS $$
      BEGIN
        RETURN CASE emoji
          WHEN '🍜' THEN 'food'       WHEN '🚗' THEN 'transport'  WHEN '🛍️' THEN 'shopping'
          WHEN '💊' THEN 'health'     WHEN '🎮' THEN 'entertainment' WHEN '💡' THEN 'utilities'
          WHEN '🏠' THEN 'housing'    WHEN '📚' THEN 'education'  WHEN '📦' THEN 'other'
          WHEN '☕' THEN 'coffee'     WHEN '✈️' THEN 'travel'     WHEN '🎵' THEN 'music'
          WHEN '🐾' THEN 'pets'       WHEN '💇' THEN 'beauty'     WHEN '🏋️' THEN 'fitness'
          WHEN '🍽️' THEN 'restaurant' WHEN '🎬' THEN 'movies'     WHEN '🏥' THEN 'medical'
          WHEN '💼' THEN 'salary'     WHEN '💻' THEN 'freelance'  WHEN '📈' THEN 'investment'
          WHEN '💰' THEN 'cash'       WHEN '🎁' THEN 'gift'       WHEN '🏆' THEN 'bonus'
          WHEN '💎' THEN 'rewards'    WHEN '🌐' THEN 'global'     WHEN '🏦' THEN 'bank'
          WHEN '🎯' THEN 'target'     WHEN '🍚' THEN 'food'       WHEN '🎉' THEN 'party'
          ELSE 'other'
        END;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    // `~ '[^\x20-\x7E]'` = contains a non-ASCII character, i.e. still an emoji rather
    // than an MDI name. Guards against clobbering already-migrated rows.
    await queryRunner.query(`
      UPDATE categories SET icon = mf_emoji_to_mdi(icon)
       WHERE icon IS NOT NULL AND icon ~ '[^\\x20-\\x7E]'
    `)
    await queryRunner.query(`
      UPDATE allocations SET icon = mf_emoji_to_mdi(icon)
       WHERE icon IS NOT NULL AND icon ~ '[^\\x20-\\x7E]'
    `)
    await queryRunner.query(`DROP FUNCTION IF EXISTS mf_emoji_to_mdi(VARCHAR)`)

    // ── total_balance ───────────────────────────────────────────────────────
    // Derived from the ledger for accounts that predate the column. Skipped for anyone
    // already holding a non-zero balance so a live figure is never overwritten.
    await queryRunner.query(`
      UPDATE users u
         SET total_balance = COALESCE((
               SELECT SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE -e.amount END)
                 FROM expenses e WHERE e.user_id = u.id
             ), 0)
       WHERE u.total_balance = 0
         AND EXISTS (SELECT 1 FROM expenses e WHERE e.user_id = u.id)
    `)

    // ── advanced_mode ───────────────────────────────────────────────────────
    // Anyone already using envelopes, loans, investments or tax keeps seeing them.
    // Without this the feature toggle reads as data loss on every existing account.
    const predicate = `
      advanced_mode = FALSE
      AND (   EXISTS (SELECT 1 FROM allocations    a WHERE a.user_id = u.id)
           OR EXISTS (SELECT 1 FROM loans          l WHERE l.user_id = u.id)
           OR EXISTS (SELECT 1 FROM investments    i WHERE i.user_id = u.id)
           OR EXISTS (SELECT 1 FROM tax_deductions t WHERE t.user_id = u.id))
    `

    // Counted with a SELECT rather than read off the UPDATE: the pg driver returns
    // `[rows, rowCount]` for writes, so treating the result as a row array reports 2
    // no matter what actually changed.
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM users u WHERE ${predicate}`,
    )

    await queryRunner.query(`UPDATE users u SET advanced_mode = TRUE WHERE ${predicate}`)

    console.log(`[DataBackfills] advanced_mode enabled for ${count} existing user(s)`)
  }

  public async down(): Promise<void> {
    // Backfills reconstruct history from data that is still present; reverting them
    // would only destroy correct values. Intentionally a no-op.
  }
}
