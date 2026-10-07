import { MigrationInterface, QueryRunner } from 'typeorm'

export class CategoryMemoCodes1785420000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE categories ADD COLUMN memo_code varchar(20)')
    await q.query(`ALTER TABLE categories ADD CONSTRAINT chk_category_memo_code
      CHECK (memo_code IS NULL OR (length(memo_code) BETWEEN 1 AND 20 AND memo_code = lower(btrim(memo_code))))`)
    await q.query('CREATE UNIQUE INDEX uq_categories_user_memo_code ON categories (user_id, memo_code) WHERE memo_code IS NOT NULL')
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX uq_categories_user_memo_code')
    await q.query('ALTER TABLE categories DROP COLUMN memo_code')
  }
}
