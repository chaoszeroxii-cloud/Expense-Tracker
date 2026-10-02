import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Converges every persisted category and wallet icon to an MDI ID.
 *
 * The first icon backfill ran before new-account and factory-reset seeders stopped
 * writing emoji, so rows created after that migration could still reintroduce them.
 * API writes are normalized now; this migration closes the gap for existing rows.
 */
export class MdiIconsOnly1785210000000 implements MigrationInterface {
  name = 'MdiIconsOnly1785210000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mf_normalize_mdi_icon(stored_icon VARCHAR, fallback_icon VARCHAR)
      RETURNS VARCHAR AS $$
      BEGIN
        RETURN CASE stored_icon
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
          ELSE CASE
            WHEN stored_icon IN (
              'food', 'transport', 'shopping', 'health', 'entertainment', 'utilities',
              'housing', 'education', 'other', 'coffee', 'travel', 'music', 'pets',
              'beauty', 'fitness', 'restaurant', 'movies', 'medical', 'tools',
              'groceries', 'salary', 'freelance', 'investment', 'otherincome', 'cash',
              'gift', 'bonus', 'rewards', 'global', 'bank', 'target', 'party', 'wallet',
              'gardening'
            ) THEN stored_icon
            ELSE fallback_icon
          END
        END;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    await queryRunner.query(`
      UPDATE categories
         SET icon = mf_normalize_mdi_icon(icon, 'other')
       WHERE icon IS DISTINCT FROM mf_normalize_mdi_icon(icon, 'other')
    `)
    await queryRunner.query(`
      UPDATE allocations
         SET icon = mf_normalize_mdi_icon(icon, 'wallet')
       WHERE icon IS DISTINCT FROM mf_normalize_mdi_icon(icon, 'wallet')
    `)

    await queryRunner.query(`DROP FUNCTION IF EXISTS mf_normalize_mdi_icon(VARCHAR, VARCHAR)`)
  }

  public async down(): Promise<void> {
    // MDI IDs contain the same meaning as the emoji they replace. Reverting would
    // discard the normalized representation without recovering any user data.
  }
}
